import { validateNodeModel } from '@/lib/node-models';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { downloadImage, uploadBufferToStorage } from '@/lib/studio-server';
import { assertOpen } from '@/lib/quota-server';
import { generateImage } from '@/lib/image-providers';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ENHANCE_PROMPT = [
  'Professional photo enhancement, upscale and refine this exact image.',
  'Improve sharpness and clarity, balance lighting, correct color, enhance texture and material details, reduce noise.',
].join(' ');

/** 基础约束：无论是否自定义提示词都必须遵守（保内容保构图，无文字） */
const CONSTRAINT_PROMPT = [
  'Strictly keep the subject, composition, framing and aspect ratio unchanged.',
  'Do not add, remove, replace or restyle any object. Do not add any text, letters, logo or watermark.',
].join(' ');

/** 用户自定义提示词上限（字符） */
const USER_PROMPT_MAX = 300;

export async function POST(request: NextRequest) {
  // 系统已关闭时拒绝（关闭检查最优先）
  const closedResponse = await assertOpen();
  if (closedResponse) return closedResponse;

  let body: { url?: unknown; prompt?: unknown; apiKey?: unknown; nodeModel?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; prompt?: unknown; apiKey?: unknown; nodeModel?: unknown };
  } catch {
    return Response.json({ error: '参数错误：请求体不是合法 JSON' }, { status: 400 });
  }
  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!/^https?:\/\//i.test(rawUrl)) {
    return Response.json({ error: '参数错误：缺少有效的图片地址' }, { status: 400 });
  }
  // 可选的自定义优化提示词（人工指令）
  const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, USER_PROMPT_MAX) : '';
  const enhancePrompt = rawPrompt
    ? `${ENHANCE_PROMPT} User instruction: ${rawPrompt}. ${CONSTRAINT_PROMPT}`
    : `${ENHANCE_PROMPT} ${CONSTRAINT_PROMPT}`;

  // 出图引擎双通道：配置了 Gemini Key 走 Google Imagen；未配置自动走内置免密生图引擎
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey : undefined;
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

  try {
    const nodeModel = validateNodeModel(body.nodeModel, 'image');
    // 读取原图尺寸：内置引擎通道需要像素尺寸（自动 clamp 到支持范围）
    const original = await downloadImage(rawUrl);
    const meta = await sharp(original).metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;

    // 图生图：画质增强，内容与构图不变
    const image = await generateImage({
      nodeModel,
      prompt: enhancePrompt,
      refs: [rawUrl],
      aspectRatio: '1:1',
      width,
      height,
      apiKey,
      customHeaders,
    });

    // 轻锐化后回传
    const processed = await sharp(image)
      .sharpen({ sigma: 0.8 })
      .jpeg({ quality: 95 })
      .toBuffer();
    const name = `enhanced_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { url } = await uploadBufferToStorage(
      processed,
      `enhanced/${name}`,
      'image/jpeg',
    );
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `AI 优化失败：${message}` }, { status: 500 });
  }
}
