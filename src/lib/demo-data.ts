import { uploadFiles } from './client-api';
import type { UploadedAsset } from './studio-types';

/** 演示模式：卖点清单（对应需求示例） */
export const DEMO_POINTS_TEXT = `图1：尺寸+承重+安装
图2：板子厚度，柔软度，高强力的支撑度
图3：绒材质：亲肤，柔软舒适，不起球，透气`;

export const DEMO_SKU = 'W636P535053';
export const DEMO_PRODUCT_NAME = '云感绒面大型犬窝';

interface DemoFileSpec {
  path: string;
  name: string;
}

const PRODUCT_FILES: DemoFileSpec[] = [
  { path: '/demo/product-1.jpg', name: 'product-1.jpg' },
  { path: '/demo/product-2.jpg', name: 'product-2.jpg' },
  { path: '/demo/product-3.jpg', name: 'product-3.jpg' },
];

const BG_FILES: DemoFileSpec[] = [
  { path: '/demo/bg-ref-1.jpg', name: 'bg-ref-1.jpg' },
  { path: '/demo/bg-ref-2.jpg', name: 'bg-ref-2.jpg' },
];

const LAYOUT_FILES: DemoFileSpec[] = [
  { path: '/demo/layout-ref-1.jpg', name: 'layout-ref-1.jpg' },
  { path: '/demo/layout-ref-2.jpg', name: 'layout-ref-2.jpg' },
];

const LOGO_FILE: DemoFileSpec = { path: '/demo/logo.jpg', name: 'logo.jpg' };

async function urlToFile(spec: DemoFileSpec): Promise<File> {
  const res = await fetch(spec.path);
  if (!res.ok) {
    throw new Error(`演示素材加载失败：${spec.name}（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  return new File([blob], spec.name, { type: blob.type || 'image/jpeg' });
}

export interface DemoAssets {
  productImages: UploadedAsset[];
  bgRefs: UploadedAsset[];
  layoutRefs: UploadedAsset[];
  logo: UploadedAsset | null;
}

/**
 * 加载演示素材：从 public/demo 读取图片 → 走真实 /api/upload 上传到对象存储，
 * 与用户手动上传完全同链路，保证 LLM 视觉解析与生图参考图可用。
 */
export async function loadDemoAssets(): Promise<DemoAssets> {
  const specs = [...PRODUCT_FILES, ...BG_FILES, ...LAYOUT_FILES, LOGO_FILE];
  const files = await Promise.all(specs.map((spec) => urlToFile(spec)));
  const uploaded = await uploadFiles(files);

  const productCount = PRODUCT_FILES.length;
  const bgCount = BG_FILES.length;
  const layoutCount = LAYOUT_FILES.length;

  return {
    productImages: uploaded.slice(0, productCount),
    bgRefs: uploaded.slice(productCount, productCount + bgCount),
    layoutRefs: uploaded.slice(productCount + bgCount, productCount + bgCount + layoutCount),
    logo: uploaded[productCount + bgCount + layoutCount] ?? null,
  };
}
