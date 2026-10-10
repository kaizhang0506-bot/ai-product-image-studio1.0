import { validateNodeModels } from '@/lib/node-models';
import { NextRequest } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { buildJobRefs, buildJobPrompt, buildCombineScenePrompt } from '@/lib/studio-prompts';
import { generateImage } from '@/lib/image-providers';
import { resolveKimiKey } from '@/lib/kimi-client';
import {
  checkRenderedText,
  downloadImage,
  processImage,
  uploadBufferToStorage,
} from '@/lib/studio-server';
import {
  addGenerated,
  getRemaining,
  QUOTA_CLOSED_MESSAGE,
  readQuota,
} from '@/lib/quota-server';
import {
  DEFAULT_SETTINGS,
  TARGET_SIZE,
  sanitizeSku,
  type GenerateEvent,
  type GenerateRequestBody,
  type JobSlot,
  type PlanJob,
} from '@/lib/studio-types';

export const runtime = 'nodejs';
export const maxDuration = 800;

const CONCURRENCY = 2;
const MAX_ATTEMPTS = 2;

interface JobResult {
  url: string;
  filename: string;
  width: number;
  height: number;
}

function slotOrder(slot: JobSlot): number {
  return slot === 'main' ? 0 : 1;
}

/** 批量出图流水线（SSE 流式推进）：生图 → 高清增强 → 精确尺寸 → 对象存储（SKU_N 命名） */
export async function POST(request: NextRequest) {
  // 测试版限量：达到 50 张后系统自动关闭（最优先检查）
  const quotaState = await readQuota();
  if (quotaState.closed) {
    return Response.json({ error: QUOTA_CLOSED_MESSAGE }, { status: 403 });
  }

  let body: GenerateRequestBody;
  try {
    body = (await request.json()) as GenerateRequestBody;
    body.nodeModels = validateNodeModels(body.nodeModels);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '请求体解析失败' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.jobs)) {
    return Response.json({ error: '参数错误：缺少出图计划' }, { status: 400 });
  }

  const safeSku = sanitizeSku(body.sku || 'SKU');
  const remaining = await getRemaining();

  // 出图引擎双通道：配置了 Gemini Key 走 Google Imagen；未配置自动走内置免密生图引擎（Seedream）

  // 参考图规范化：兼容误传对象数组（如 {url}），统一收敛为字符串 URL 并过滤空值
  const normalizeUrlList = (list: unknown): string[] =>
    (Array.isArray(list) ? list : [])
      .map((item) =>
        typeof item === 'string'
          ? item.trim()
          : item && typeof item === 'object' && 'url' in item && typeof (item as { url: unknown }).url === 'string'
            ? ((item as { url: string }).url).trim()
            : '',
      )
      .filter(Boolean);

  const safeBody: GenerateRequestBody = {
    ...body,
    sku: safeSku,
    settings: { ...DEFAULT_SETTINGS, ...(body.settings ?? {}) },
    productImages: normalizeUrlList(body.productImages),
    bgRefs: normalizeUrlList(body.bgRefs),
    layoutRefs: normalizeUrlList(body.layoutRefs),
    jobs: body.jobs.filter(
      (j): j is PlanJob => Boolean(j) && typeof j.id === 'string',
    ),
  };

  const enabledJobs = safeBody.jobs
    .filter((j) => j.enabled)
    .sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));

  if (enabledJobs.length === 0) {
    return Response.json({ error: '出图计划为空' }, { status: 400 });
  }

  // 本批次最多只生成剩余配额张数，超出部分直接标记配额不足
  const runnableJobs = enabledJobs.slice(0, remaining);
  const skippedJobs = enabledJobs.slice(remaining);

  // 命名规则：主图 sku_1、sku_2、...；详情页（A+）后缀字母 sku_1A、sku_2A、...（人工重试可覆盖保留原编号）
  const filenameById = new Map<string, string>();
  const mainCounter = { n: 0 };
  const detailCounter = { n: 0 };
  for (const job of enabledJobs) {
    const isMain = job.slot === 'main';
    const counter = isMain ? mainCounter : detailCounter;
    counter.n += 1;
    const fallbackName = isMain ? `${safeSku}_${counter.n}` : `${safeSku}_${counter.n}A`;
    const override = safeBody.filenameOverrides?.[job.id];
    filenameById.set(job.id, override && /^[\w-]+$/.test(override) ? override : fallbackName);
  }

  // 渲染文字质检：有 Kimi Key 走最新 Kimi，无 Key 走内置轻量模型（均不阻塞主流程）
  const kimiKey = resolveKimiKey(body.kimiApiKey);
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  const runJob = async (
    job: PlanJob,
    send: (event: GenerateEvent) => void,
  ): Promise<JobResult> => {
    const baseName = filenameById.get(job.id) ?? `${safeSku}_x`;
    const target = TARGET_SIZE[job.slot];
    const aspectRatio = job.slot === 'main' ? '1:1' : '3:2';

    const attemptGenerate = async (extraHint?: string): Promise<string> => {
      let lastError = '';
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          let image: Buffer;
          if (job.kind === 'combine') {
            // 合成图两步走：AI① 先把两款产品合拢到同一画面 → AI② 为合拢底图生成场景背景
            const mergeImage = await generateImage({
              nodeModel: body.nodeModels?.productImage,
              prompt: extraHint
                ? `${buildJobPrompt(safeBody, job)}\n\n${extraHint}`
                : buildJobPrompt(safeBody, job),
              refs: buildJobRefs(safeBody, job),
              aspectRatio,
              width: 2560,
              height: 2560,
              apiKey: body.apiKey,
              customHeaders,
            });
            const merged = await uploadBufferToStorage(
              mergeImage,
              `generated/${safeSku}/_merge_${baseName}_${attempt}.jpg`,
              'image/jpeg',
            );
            image = await generateImage({
              nodeModel: body.nodeModels?.backgroundImage,
              prompt: [buildCombineScenePrompt(safeBody, job), extraHint]
                .filter(Boolean)
                .join('\n\n'),
              refs: [merged.url, safeBody.bgRefs[0]].filter(Boolean),
              aspectRatio,
              width: 2560,
              height: 2560,
              apiKey: body.apiKey,
              customHeaders,
            });
          } else {
            const refs = buildJobRefs(safeBody, job);
            const prompt = extraHint
              ? `${buildJobPrompt(safeBody, job)}\n\n${extraHint}`
              : buildJobPrompt(safeBody, job);
            image = await generateImage({
              nodeModel: body.nodeModels?.[job.kind === 'scene' || job.kind === 'model' ? 'backgroundImage' : 'productImage'],
              prompt,
              refs,
              aspectRatio,
              width: 2560,
              height: job.slot === 'main' ? 2560 : 1584,
              apiKey: body.apiKey,
              customHeaders,
            });
          }
          // Imagen 直接返回图片字节：先落对象存储得到质检用 URL
          const { url } = await uploadBufferToStorage(
            image,
            `generated/${safeSku}/_raw_${baseName}_${attempt}.jpg`,
            'image/jpeg',
          );
          return url;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
      throw new Error(lastError || '生图失败');
    };

    // 1) 生图
    let rawUrl = await attemptGenerate();
    console.log(`[GEN-STEP] ${job.id} raw-image ok: ${rawUrl.slice(0, 80)}`);

    // 2) 渲染文字质检（白底图无文字跳过）：拼写错误/中文混入/乱码 → 带强调提示重新采样
    if (job.kind !== 'white') {
      const firstCheck = await checkRenderedText(rawUrl, kimiKey, customHeaders, body.nodeModels?.textQa);
      console.log(`[GEN-STEP] ${job.id} text-qa ok=${firstCheck.ok} ${firstCheck.ok ? '' : String(firstCheck.issues).slice(0, 60)}`);
      if (!firstCheck.ok) {
        send({ type: 'job-stage', id: job.id, stage: 'generating' });
        const hint = `CRITICAL FIX REQUIRED: the previous render contained misspelled or garbled text. Render the quoted text again with LETTER-PERFECT spelling — copy each English word exactly as given, all caps for the headline, and keep total text minimal. If unsure of a word, simplify it to a common word instead of inventing letters.`;
        try {
          rawUrl = await attemptGenerate(hint);
        } catch {
          // 重采样失败则保留首图
        }
      }
    }

    // 3) 高清增强 + 精确尺寸（主图 2000x2000 / 详情页 1940x1200）
    console.log(`[GEN-STEP] ${job.id} processing start`);
    const raw = await downloadImage(rawUrl);
    const processed = await processImage(raw, {
      width: target.width,
      height: target.height,
      hdEnhance: safeBody.settings.hdEnhance,
    });
    console.log(`[GEN-STEP] ${job.id} processed ${processed.width}x${processed.height}`);

    // 4) 上传对象存储，按 SKU_N 规范命名
    const { url } = await uploadBufferToStorage(
      processed.buffer,
      `generated/${safeSku}/${baseName}.jpg`,
      'image/jpeg',
    );
    return {
      url,
      filename: `${baseName}.jpg`,
      width: processed.width,
      height: processed.height,
    };
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: GenerateEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
      }, 15000);

      try {
        send({
          type: 'phase',
          message: `流水线就绪：共 ${enabledJobs.length} 张，${safeBody.settings.hdEnhance ? '生成后自动高清增强' : '生成后直接交付'}（测试版权额剩余 ${remaining} 张）`,
        });

        let succeeded = 0;
        let failed = 0;
        let cursor = 0;

        const worker = async (): Promise<void> => {
          while (cursor < runnableJobs.length && !request.signal.aborted) {
            const job = runnableJobs[cursor];
            cursor += 1;
            const filename = `${filenameById.get(job.id) ?? `${safeSku}_x`}.jpg`;
            send({
              type: 'job-start',
              id: job.id,
              label: job.label || (job.slot === 'main' ? '主图' : '详情页'),
              filename,
            });
            try {
              const result = await runJob(job, send);
              const quotaAfter = await addGenerated(1);
              succeeded += 1;
              send({ type: 'job-done', id: job.id, ...result });
              if (quotaAfter.closed) {
                send({
                  type: 'phase',
                  message: '测试版 50 张限量已生成完毕，系统即将自动关闭',
                });
              }
            } catch (error) {
              failed += 1;
              const message =
                error instanceof Error ? error.message : String(error);
              const stack = error instanceof Error ? (error.stack ?? '') : '';
              console.error(
                `[GEN-FAIL] ${job.id} (${job.kind}): ${message}\n${stack.slice(0, 800)}`,
              );
              send({ type: 'job-error', id: job.id, message });
            }
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, runnableJobs.length) }, () =>
            worker(),
          ),
        );

        // 配额耗尽：本批次未排入的任务直接标记失败
        for (const job of skippedJobs) {
          failed += 1;
          send({
            type: 'job-error',
            id: job.id,
            message: '测试版权额已用尽（上限 50 张），本张未生成',
          });
        }
        if (skippedJobs.length > 0) {
          send({
            type: 'phase',
            message: `测试版权额已用尽：${skippedJobs.length} 张未排入生成（上限 50 张）`,
          });
        }
        send({ type: 'done', total: enabledJobs.length, succeeded, failed });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ type: 'error', message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // 流已关闭，忽略
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
