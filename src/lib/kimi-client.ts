import { validateNodeModel, type NodeModel } from './node-models';
/**
 * Kimi（Moonshot AI）官方 API 直连适配层。
 * 工作台的理解环节（产品细读 / 统筹 / 策划 / 场景 DNA / 渲染文字质检）统一走最新 Kimi 模型。
 * - OpenAI 兼容协议：POST {baseUrl}/chat/completions
 * - 默认模型 kimi-k3（Kimi 迄今最强：原生视觉理解、百万 token 上下文），
 *   可通过 KIMI_MODEL 环境变量覆盖；KIMI_BASE_URL 可切换全球站 api.moonshot.ai
 * - Key 解析：调用方传入（页面 localStorage）> MOONSHOT_API_KEY > KIMI_API_KEY
 * - 注意：Kimi K2.5+ 系列 temperature/top_p 等采样参数固定，一律使用服务端默认值，不下发
 */

import { LLMClient, Config } from 'coze-coding-dev-sdk';
import type { UnderstandEngine } from './studio-types';

export type KimiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | KimiContentPart[];
}

/** 理解环节统一消息格式（兼容内置网关与 Kimi 直连两条通道） */
export type UnderstandPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' } };

export interface UnderstandMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | UnderstandPart[];
}

const DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k3';

/** 当前生效的 Kimi 模型名（用于 UI 展示与日志） */
export function kimiModelName(): string {
  return (process.env.KIMI_MODEL || DEFAULT_MODEL).trim();
}

/** Key 三级解析：页面传入 > MOONSHOT_API_KEY > KIMI_API_KEY（可空——空时走内置兜底模型） */
export function resolveKimiKey(fromBody?: string): string {
  if (fromBody && fromBody.trim()) return fromBody.trim();
  return (process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY || '').trim();
}

/** 内置兜底模型（沙箱 LLM 网关免密）：旗舰视觉理解，无 Kimi Key 时使用 */
const BUILTIN_MODEL = 'doubao-seed-2-0-pro-260215';
/** 内置兜底轻量模型：渲染文字质检等高频小任务提速 */
export const BUILTIN_LITE_MODEL = 'doubao-seed-2-0-lite-260215';

interface KimiApiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * 发起一次 Kimi 对话调用，返回文本内容。
 * 失败抛出带业务指引的错误；调用方按需重试或降级。
 */
export async function kimiChat(options: {
  messages: KimiMessage[];
  apiKey: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const baseUrl = (process.env.KIMI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = options.model || kimiModelName();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
      }),
    });
  } catch (error) {
    throw new Error(
      `Kimi API 网络请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const text = await res.text();
  let data: KimiApiResponse = {};
  try {
    data = JSON.parse(text) as KimiApiResponse;
  } catch {
    // 保留原始文本用于错误提示
  }
  if (!res.ok) {
    const detail = data.error?.message || text.slice(0, 200);
    if (res.status === 401) {
      throw new Error('Kimi API Key 无效或余额异常，请检查左侧填入的 Moonshot Key');
    }
    if (res.status === 429) {
      throw new Error('Kimi API 触发限流，请稍后重试');
    }
    throw new Error(`Kimi API 错误（${res.status}）：${detail}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Kimi 返回内容为空，请重试');
  }
  return content;
}

/**
 * 理解环节统一入口（双通道 + 自动降级）：
 * - 有 Kimi Key → 优先走最新 Kimi（默认 kimi-k3，Moonshot 官方 API 直连）；
 *   Kimi 通道失败（Key 无效/限流/网络异常）自动降级内置旗舰模型，流程永不中断
 * - 无 Kimi Key → 直接走内置旗舰模型（免密，网关转发请求头鉴权）
 * fallbackModel 可指定内置通道的模型（如质检走 lite 提速）。
 * 返回实际生效的引擎标记（kimi / builtin / kimi-fallback），供前端透明展示。
 */
export async function understandChat(options: {
  messages: UnderstandMessage[];
  kimiKey?: string;
  customHeaders?: Record<string, string>;
  nodeModel?: NodeModel;
  fallbackModel?: string;
  maxTokens?: number;
}): Promise<{ content: string; engine: UnderstandEngine }> {
  const selection = validateNodeModel(options.nodeModel, 'text');
  const kimiKey = selection.provider === 'builtin' ? '' : (options.kimiKey ?? '').trim();
  if (selection.provider === 'kimi' && !kimiKey) throw new Error('所选 Kimi 模型需要配置 API Key');
  let degraded = false;
  if (kimiKey) {
    // Kimi 官方 API：OpenAI 兼容格式，剥离 detail 等 Moonshot 不识别的字段
    const messages: KimiMessage[] = options.messages.map((m) => ({
      role: m.role,
      content:
        typeof m.content === 'string'
          ? m.content
          : m.content.map((p) =>
              p.type === 'text'
                ? { type: 'text' as const, text: p.text }
                : { type: 'image_url' as const, image_url: { url: p.image_url.url } },
            ),
    }));
    try {
      const content = await kimiChat({ messages, apiKey: kimiKey, model: selection.provider === 'kimi' ? selection.model : undefined, maxTokens: options.maxTokens });
      return { content, engine: 'kimi' };
    } catch (error) {
      if (selection.provider !== 'auto') throw error;
      degraded = true;
      console.warn(
        `[understandChat] Kimi 通道失败，自动降级内置旗舰模型：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  // 内置网关通道（免 Key）：转发请求头完成鉴权
  const client = new LLMClient(new Config(), options.customHeaders ?? {});
  const response = await client.invoke(
    options.messages.map((m) => ({ role: m.role, content: m.content })),
    {
      model: (selection.provider === 'builtin' && selection.model) || options.fallbackModel || BUILTIN_MODEL,
      thinking: 'disabled',
      temperature: 0.3,
    },
  );
  const content = (response as { content?: unknown }).content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('内置模型返回内容为空，请重试');
  }
  return { content, engine: degraded ? 'kimi-fallback' : 'builtin' };
}
