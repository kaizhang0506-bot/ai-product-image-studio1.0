import { NODE_MODELS_STORAGE, validateNodeModels } from './node-models';
function storedNodeModels() { return validateNodeModels(JSON.parse(window.localStorage.getItem(NODE_MODELS_STORAGE) || '{}')); }
/**
 * 前端 API 客户端：上传 / AI 解析 / SSE 生成流 / 下载
 */
import type {
  AnalysisResult,
  AnalyzeRequestBody,
  GenerateEvent,
  GenerateRequestBody,
  UploadedAsset,
} from './studio-types';

interface UploadApiResponse {
  files?: Array<{ key: string; url: string; name: string }>;
  error?: string;
}

interface ApiErrorBody {
  error?: string;
}

/** 上传素材到对象存储 */
export async function uploadFiles(files: File[]): Promise<UploadedAsset[]> {
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = (await res.json()) as UploadApiResponse;
  if (!res.ok || !data.files) {
    throw new Error(data.error || '上传失败');
  }
  return data.files.map((f) => ({ id: f.key, url: f.url, name: f.name }));
}

/** Imagen API Key 本地存储键（仅保存在当前浏览器） */
const IMAGEN_KEY_STORAGE = 'imagen_api_key';

/** 读取页面保存的 Imagen API Key */
export function getStoredImagenKey(): string {
  try {
    return window.localStorage.getItem(IMAGEN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/** 保存 / 清除页面侧 Imagen API Key */
export function storeImagenKey(key: string): void {
  try {
    if (key.trim()) {
      window.localStorage.setItem(IMAGEN_KEY_STORAGE, key.trim());
    } else {
      window.localStorage.removeItem(IMAGEN_KEY_STORAGE);
    }
  } catch {
    // localStorage 不可用时静默忽略
  }
}

/** Kimi（Moonshot）API Key 本地存储键（仅保存在当前浏览器；选填，不填走内置旗舰模型） */
const KIMI_KEY_STORAGE = 'kimi_api_key';

/** 读取页面保存的 Kimi API Key（可空） */
export function getStoredKimiKey(): string {
  try {
    return window.localStorage.getItem(KIMI_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

/** 保存 / 清除页面侧 Kimi API Key */
export function storeKimiKey(key: string): void {
  try {
    if (key.trim()) {
      window.localStorage.setItem(KIMI_KEY_STORAGE, key.trim());
    } else {
      window.localStorage.removeItem(KIMI_KEY_STORAGE);
    }
  } catch {
    // localStorage 不可用时静默忽略
  }
}

/** AI 画质优化：返回优化后的图片 URL */
export async function enhanceImage(url: string, prompt?: string): Promise<string> {
  const res = await fetch('/api/enhance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, prompt, nodeModel: storedNodeModels().enhance, apiKey: getStoredImagenKey() }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'AI 优化失败');
  }
  return data.url;
}

/** AI 解析与出图策划（理解环节双通道：填了 Kimi Key 走 kimi-k3，不填走内置免密旗舰模型） */
export async function requestAnalysis(
  body: AnalyzeRequestBody,
): Promise<AnalysisResult> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, nodeModels: body.nodeModels ?? storedNodeModels(), apiKey: getStoredImagenKey(), kimiApiKey: body.kimiApiKey || getStoredKimiKey() }),
  });
  const data = (await res.json()) as AnalysisResult & ApiErrorBody;
  if (!res.ok) {
    throw new Error(data.error || 'AI 解析失败');
  }
  return data;
}

/** 批量出图：SSE 流式读取，逐事件回调 */
export async function streamGenerate(
  body: GenerateRequestBody,
  onEvent: (event: GenerateEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, nodeModels: body.nodeModels ?? storedNodeModels(), apiKey: getStoredImagenKey(), kimiApiKey: body.kimiApiKey || getStoredKimiKey() }),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = '生成请求失败';
    try {
      const data = (await res.json()) as ApiErrorBody;
      if (data.error) message = data.error;
    } catch {
      // 忽略非 JSON 响应
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const dataLine = frame
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as GenerateEvent);
      } catch {
        // 忽略坏帧
      }
    }
  }
}

/** 跨域签名 URL 下载必须使用 fetch + blob 模式 */
export async function downloadAsset(
  url: string,
  filename: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(blobUrl);
}

export interface QuotaInfo {
  generated: number;
  max: number;
  remaining: number;
  closed: boolean;
  closedAt: string | null;
}

/** 查询测试版限量配额 */
export async function fetchQuota(): Promise<QuotaInfo> {
  const res = await fetch('/api/quota');
  if (!res.ok) {
    throw new Error(`配额查询失败: HTTP ${res.status}`);
  }
  return (await res.json()) as QuotaInfo;
}
