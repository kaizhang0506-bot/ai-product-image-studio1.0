import { validateNodeModel, type NodeModel } from './node-models';
import { ImageGenerationClient, Config } from 'coze-coding-dev-sdk';
import { downloadImage } from '@/lib/studio-server';

/**
 * 出图引擎适配层（双通道，自动分流）：
 *
 * 通道 A（免密默认）：平台内置生图引擎（豆包 Seedream 5.0，经 coze-coding-dev-sdk 网关）。
 *   - 凭证由沙箱自动注入，无需任何 Key
 *   - 支持多参考图图生图（image: string[]，产品一致性与 Gemini 通道同构）
 *   - 模型可用环境变量 SEEDREAM_MODEL 覆盖
 *
 * 通道 B（可选）：Google 官方图像生成（Imagen 家族，gemini-2.5-flash-image）。
 *   - 配置了 Key 才启用：页面传入 > GEMINI_API_KEY > GOOGLE_API_KEY
 *   - 可用环境变量 IMAGEN_MODEL 覆盖模型名
 *
 * 统一入口 generateImage()：按 Key 是否存在自动分流，调用方无感。
 */

const IMAGEN_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const DEFAULT_MODEL = 'gemini-2.5-flash-image';

/** Gemini 图像 API 支持的宽高比枚举（REST 侧 imageConfig.aspectRatio） */
const ASPECT_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ['1:1', 1],
  ['4:5', 0.8],
  ['5:4', 1.25],
  ['3:4', 0.75],
  ['4:3', 4 / 3],
  ['3:2', 1.5],
  ['2:3', 2 / 3],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['21:9', 21 / 9],
];

export function resolveImagenKey(bodyKey?: string): string {
  const fromBody = (bodyKey ?? '').trim();
  if (fromBody) return fromBody;
  const fromEnv =
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '';
  return fromEnv;
}

export function nearestAspectRatio(width: number, height: number): string {
  const ratio = width / Math.max(height, 1);
  let best = ASPECT_RATIOS[0];
  let bestDiff = Math.abs(ratio - best[1]);
  for (const entry of ASPECT_RATIOS.slice(1)) {
    const diff = Math.abs(ratio - entry[1]);
    if (diff < bestDiff) {
      best = entry;
      bestDiff = diff;
    }
  }
  return best[0];
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

function pickImageBuffer(response: GeminiResponse): Buffer {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    if (data) {
      return Buffer.from(data, 'base64');
    }
  }
  const block = response.promptFeedback?.blockReason;
  if (block) {
    throw new Error(`Imagen 拒绝了该请求（${block}），请调整画面描述后重试`);
  }
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP') {
    throw new Error(`Imagen 未返回图片（finishReason=${finish}）`);
  }
  throw new Error('Imagen 响应中未包含图片数据');
}

function sniffImageMime(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer.subarray(1, 4).toString('ascii') === 'PNG') {
    return 'image/png';
  }
  return 'image/jpeg';
}

async function downloadRefAsInlineData(
  url: string,
): Promise<{ inline_data: { mime_type: string; data: string } } | null> {
  try {
    const buffer = await downloadImage(url);
    const data = buffer.toString('base64');
    return { inline_data: { mime_type: sniffImageMime(buffer), data } };
  } catch {
    // 单张参考图下载失败不阻塞整体出图
    return null;
  }
}

interface ImagenGenerateInput {
  model?: string;
  prompt: string;
  /** 参考图（产品图 / 氛围参考 / 排版参考），按顺序注入 */
  refs: string[];
  /** 期望宽高比（如 1:1 / 3:2），由 nearestAspectRatio 映射 */
  aspectRatio: string;
  apiKey: string;
}

export async function generateWithImagen(
  input: ImagenGenerateInput,
): Promise<Buffer> {
  const model = input.model || process.env.IMAGEN_MODEL?.trim() || DEFAULT_MODEL;
  const parts: GeminiPart[] = [{ text: input.prompt }];
  for (const ref of input.refs) {
    const inline = await downloadRefAsInlineData(ref);
    if (inline) parts.push(inline);
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: input.aspectRatio, imageSize: '2K' },
    },
  };

  const response = await fetch(`${IMAGEN_BASE_URL}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': input.apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: GeminiResponse = {};
  try {
    parsed = JSON.parse(text) as GeminiResponse;
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    // imageConfig/imageSize 参数不被当前模型支持时降级重试
    const message = parsed.error?.message ?? text.slice(0, 300);
    if (/imageConfig|imageSize|aspectRatio|Unknown name/i.test(message)) {
      const fallback = await requestImagenWithoutImageConfig(model, parts, input.apiKey);
      return fallback;
    }
    throw new Error(`Imagen 出图失败（HTTP ${response.status}）：${message}`);
  }

  return pickImageBuffer(parsed);
}

async function requestImagenWithoutImageConfig(
  model: string,
  parts: GeminiPart[],
  apiKey: string,
): Promise<Buffer> {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };
  const response = await fetch(`${IMAGEN_BASE_URL}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: GeminiResponse = {};
  try {
    parsed = JSON.parse(text) as GeminiResponse;
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    throw new Error(
      `Imagen 出图失败（HTTP ${response.status}）：${parsed.error?.message ?? text.slice(0, 300)}`,
    );
  }
  return pickImageBuffer(parsed);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 内置免密通道：豆包 Seedream（平台网关）
 * ────────────────────────────────────────────────────────────────────── */

/** 内置引擎接受的尺寸范围（与生图模型约束一致） */
const BUILTIN_MIN_SIDE = 1440;
const BUILTIN_MAX_SIDE = 4096;

function clampBuiltinSize(
  width: number,
  height: number,
): { width: number; height: number } {
  // 等比缩放：短边不足下限时放大、长边超上限时压回，始终保持原比例
  const minSide = Math.min(width, height);
  let scale = minSide < BUILTIN_MIN_SIDE ? BUILTIN_MIN_SIDE / Math.max(minSide, 1) : 1;
  const maxSideScaled = Math.max(width, height) * scale;
  if (maxSideScaled > BUILTIN_MAX_SIDE) {
    scale *= BUILTIN_MAX_SIDE / maxSideScaled;
  }
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function generateWithBuiltin(input: UnifiedImageInput): Promise<Buffer> {
  // 大图生成耗时较长：显式放宽 SDK 超时到 5 分钟
  const config = new Config({ timeout: 300000 });
  const client = new ImageGenerationClient(config, input.customHeaders);
  const model = input.nodeModel?.model || process.env.SEEDREAM_MODEL?.trim() || undefined;
  const size = clampBuiltinSize(input.width, input.height);
  const response = await client.generate({
    prompt: input.prompt,
    // SDK 对 image 字段做严格校验（undefined/空串均报错）：无参考图时完全不传该字段
    ...(input.refs.length > 0 ? { image: input.refs } : {}),
    size: `${size.width}x${size.height}`,
    watermark: false,
    responseFormat: 'url',
    ...(model ? { model } : {}),
  });
  const helper = client.getResponseHelper(response);
  if (!helper.success || helper.imageUrls.length === 0) {
    throw new Error(
      `内置生图引擎失败：${helper.errorMessages[0] ?? '未返回图片，请重试'}`,
    );
  }
  return downloadImage(helper.imageUrls[0]);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 统一入口：按 Key 自动分流（有 Key → Gemini；无 Key → 内置 Seedream）
 * ────────────────────────────────────────────────────────────────────── */

export interface UnifiedImageInput {
  nodeModel?: NodeModel;
  prompt: string;
  /** 参考图（产品图 / 氛围参考 / 排版参考），按顺序注入 */
  refs: string[];
  /** 期望宽高比（如 1:1 / 3:2），Gemini 通道使用 */
  aspectRatio: string;
  /** 期望生成像素尺寸（内置通道按此 clamp 到 1440~4096） */
  width: number;
  height: number;
  /** 页面传入的 Gemini Key（可缺省） */
  apiKey?: string;
  /** 请求转发头（SDK 网关鉴权与追踪需要） */
  customHeaders?: Record<string, string>;
}

export async function generateImage(input: UnifiedImageInput): Promise<Buffer> {
  const selection = validateNodeModel(input.nodeModel, 'image');
  const key = selection.provider === 'builtin' ? '' : resolveImagenKey(input.apiKey);
  if (selection.provider === 'gemini' && !key) throw new Error('所选 Gemini 模型需要配置 API Key');
  if (key) {
    return generateWithImagen({
      model: selection.provider === 'gemini' ? selection.model : undefined,
      prompt: input.prompt,
      refs: input.refs,
      aspectRatio: input.aspectRatio,
      apiKey: key,
    });
  }
  return generateWithBuiltin(input);
}
