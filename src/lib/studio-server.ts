import type { NodeModel } from './node-models';
/**
 * 服务端专用工具：对象存储 + sharp 图像处理 + 渲染文字质检
 */
import { S3Storage } from 'coze-coding-dev-sdk';
import sharp from 'sharp';
import { understandChat } from '@/lib/kimi-client';
import { getPromptText } from '@/lib/prompt-registry';

let storageInstance: S3Storage | null = null;

export function getStorage(): S3Storage {
  if (!storageInstance) {
    storageInstance = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }
  return storageInstance;
}

/** 签名 URL 有效期：30 天 */
export const PRESIGN_EXPIRES = 2592000;

export interface StoredFile {
  key: string;
  url: string;
}

/** 上传 Buffer 到对象存储，返回实际 key 与可访问签名 URL */
export async function uploadBufferToStorage(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<StoredFile> {
  const storage = getStorage();
  const key = await storage.uploadFile({
    fileContent: buffer,
    fileName,
    contentType,
  });
  const url = await storage.generatePresignedUrl({
    key,
    expireTime: PRESIGN_EXPIRES,
  });
  return { key, url };
}

/** 下载远程图片为 Buffer */
export async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载生成图失败: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface ProcessImageOptions {
  width: number;
  height: number;
  hdEnhance: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * 精确缩放到电商规范尺寸（主图 2000x2000 / 详情页 1940x1200），
 * 高清增强开启时附加锐化与高质量 JPEG 压缩。
 */
export async function processImage(
  raw: Buffer,
  options: ProcessImageOptions,
): Promise<ProcessedImage> {
  let pipeline = sharp(raw).resize(options.width, options.height, {
    fit: 'cover',
  });
  if (options.hdEnhance) {
    pipeline = pipeline.sharpen({ sigma: 0.9 });
  }
  const buffer = await pipeline
    .jpeg({ quality: options.hdEnhance ? 95 : 92, mozjpeg: true })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? options.width,
    height: meta.height ?? options.height,
  };
}

export interface TextCheckResult {
  ok: boolean;
  issues: string;
}

/**
 * 渲染文字质检（Kimi 视觉）：检查生成图上的文字是否存在拼写错误 / 中文字符 / 乱码。
 * Key 缺失或校验服务异常时返回 ok=true，不阻塞主流程。
 */
export async function checkRenderedText(
  imageUrl: string,
  kimiKey: string,
  customHeaders: Record<string, string> = {},
  nodeModel?: NodeModel,
): Promise<TextCheckResult> {
  try {
    const { content: raw } = await understandChat({
      nodeModel,
      kimiKey,
      customHeaders,
      fallbackModel: 'doubao-seed-2-0-lite-260215', // 质检轻量，无 Key 时走 lite 提速
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: getPromptText('textQa'),
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: true, issues: '' };
    const parsed = JSON.parse(match[0]) as { ok?: boolean; issues?: string };
    return {
      ok: parsed.ok !== false,
      issues: typeof parsed.issues === 'string' ? parsed.issues : '',
    };
  } catch (error) {
    if (nodeModel && nodeModel.provider !== 'auto') throw error;
    return { ok: true, issues: '' };
  }
}
