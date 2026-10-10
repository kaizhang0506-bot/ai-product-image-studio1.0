import type { NodeModels } from './node-models';
/**
 * 工作台共享类型与纯工具函数（前后端通用，禁止引入服务端专用模块）
 */

export interface UploadedAsset {
  id: string;
  url: string;
  name: string;
  /** 是否已经过 AI 画质优化 */
  optimized?: boolean;
}

export interface StudioSettings {
  /** 精修产品图：质感与纹理协调精修（可人工关闭） */
  refine: boolean;
  /** 高清增强：成片二次锐化并精确输出目标尺寸 */
  hdEnhance: boolean;
  /** 是否生成尺寸图（一般已有尺寸图，默认关闭） */
  includeSizeChart: boolean;
  /** 画面风格预设 */
  styleMode: StyleMode;
  /** 主图数量 5~7 */
  mainCount: number;
  /** 详情页数量 3~7 */
  detailCount: number;
}

export type MainKind = 'white' | 'size' | 'scene' | 'attr' | 'model' | 'combine';
export type JobKind = MainKind | 'detail';
export type JobSlot = 'main' | 'detail';

/** 画面风格预设：auto = AI 按产品与参考图自动决定 */
export type StyleMode = 'auto' | 'studio' | 'lifestyle' | 'poster';

export const STYLE_MODE_LABELS: Record<StyleMode, string> = {
  auto: 'AI 自动（跟随参考图氛围）',
  studio: '影棚精修（纯色背景·专业布光）',
  lifestyle: '生活场景（自然光·居家氛围）',
  poster: '简约海报（大留白·排版感强）',
};

export interface PlanJob {
  id: string;
  slot: JobSlot;
  kind: JobKind;
  /** 展示名，如 "主图1 · 白底图" */
  label: string;
  /** 画面主标题 / 卖点短语（渲染进画面文字） */
  title: string;
  /** 辅助文案 / 尺寸标注内容 */
  copy: string;
  /** 画面策划说明（写入生图提示词） */
  concept: string;
  /** 绑定的产品图索引（对应上传的产品图顺序） */
  productImageIndex: number;
  enabled: boolean;
}

export interface ColorSwatch {
  hex: string;
  name: string;
}

export interface SceneDna {
  style: string;
  moodKeywords: string[];
  hardMaterials: { floor: string; wall: string; finish: string };
  softMaterials: { palette: string; fabrics: string; decor: string };
  lighting: { source: string; colorTemp: string; shadow: string; atmosphere: string };
  colorSystem: { primary: string; secondary: string; accent: string; productAnchor: string };
  composition: { whitespace: string; productZone: string };
  fitCheck: string;
  scenePrompt: string;
  negativePrompt: string;
}

export interface StyleAnalysis {
  atmosphere: string;
  styleKeywords: string[];
  colorPalette: ColorSwatch[];
  layoutNotes: string;
  sceneDna?: SceneDna;
}

export interface ProductImageRead {
  index: number;
  angle: string;
  details: string;
  bestFor: string;
}

/** 统筹 AI：单个图位的叙事安排 */
export interface CampaignSlotPlan {
  /** 图位 ID（m1/d1...，与 PlanJob.id 对应） */
  id: string;
  /** 叙事角色：该图在整个套系中承担的转化任务 */
  role: string;
  /** 视觉重心：一眼必须看到什么 */
  focus: string;
  /** 执行要点：与相邻图位的差异、必须避免的重复 */
  notes: string;
}

/** 统筹 AI：拍摄前的「总导演简报」，全链路创作宪法 */
export interface CampaignBrief {
  /** 套系叙事线：整套图按什么故事推进 */
  storyline: string;
  /** 套系美术宪法：统一的光线/道具/模特/视角节奏约束，下发到每个生图环节 */
  artDirection: string;
  /** 卖点覆盖审查：哪些卖点由哪些图承载、发现的缺口 */
  coverage: string;
  /** 逐图位统筹安排（图位驱动模式必有，自动模式可为空） */
  slots: CampaignSlotPlan[];
}

/** 理解环节引擎：kimi = Kimi 直连（kimi-k3）；builtin = 内置免密旗舰模型；kimi-fallback = Kimi 通道失败自动降级内置 */
export type UnderstandEngine = 'kimi' | 'builtin' | 'kimi-fallback';

export interface AnalysisResult {
  productUnderstanding: string;
  productImages: ProductImageRead[];
  style: StyleAnalysis;
  /** 统筹 AI 简报（总导演：叙事线 + 图位任务分配 + 覆盖审查 + 美术宪法） */
  campaign: CampaignBrief;
  jobs: PlanJob[];
  /** 本次策划实际使用的理解引擎（降级时前端给出提示） */
  engine?: UnderstandEngine;
}

export interface AnalyzeRequestBody {
  nodeModels?: NodeModels;
  sku: string;
  productName: string;
  sellingPoints: string[];
  /** 图位清单原始文本（人工逐张指定图类型，最高优先级） */
  slotSpecText?: string;
  productImages: string[];
  bgRefs: string[];
  layoutRefs: string[];
  logoUrl?: string;
  settings: StudioSettings;
  /** Kimi（Moonshot）API Key（页面传入优先于服务端环境变量 MOONSHOT_API_KEY / KIMI_API_KEY） */
  kimiApiKey?: string;
}

export interface GenerateRequestBody {
  nodeModels?: NodeModels;
  sku: string;
  productName: string;
  productImages: string[];
  bgRefs: string[];
  layoutRefs: string[];
  logoUrl?: string;
  settings: StudioSettings;
  productUnderstanding: string;
  style: StyleAnalysis;
  /** 统筹 AI 简报（生图环节继承：美术宪法 + 逐图位任务） */
  campaign?: CampaignBrief;
  /** 产品图细读结果（策划阶段产出，生图环节继承其视角与细节描述） */
  productImageReads?: ProductImageRead[];
  jobs: PlanJob[];
  /** Imagen API Key（页面传入优先于服务端环境变量 GEMINI_API_KEY / GOOGLE_API_KEY） */
  apiKey?: string;
  /** Kimi（Moonshot）API Key：渲染文字质检环节使用（缺失时跳过质检不阻塞） */
  kimiApiKey?: string;
  /** 重试时保留原编号：jobId → 基础文件名（不含扩展名） */
  filenameOverrides?: Record<string, string>;
}

export type GenerateEvent =
  | { type: 'phase'; message: string }
  | { type: 'job-start'; id: string; label: string; filename: string }
  | { type: 'job-stage'; id: string; stage: 'generating' | 'enhancing' }
  | {
      type: 'job-done';
      id: string;
      url: string;
      filename: string;
      width: number;
      height: number;
    }
  | { type: 'job-error'; id: string; message: string }
  | { type: 'done'; total: number; succeeded: number; failed: number }
  | { type: 'error'; message: string };

export type JobStatus = 'queued' | 'generating' | 'enhancing' | 'done' | 'error';

export interface JobRuntime {
  status: JobStatus;
  url?: string;
  filename?: string;
  width?: number;
  height?: number;
  error?: string;
}

/** 输入面板整体状态（前端页面持有） */
export interface InputState {
  sku: string;
  productName: string;
  logo: UploadedAsset | null;
  productImages: UploadedAsset[];
  bgRefs: UploadedAsset[];
  layoutRefs: UploadedAsset[];
  sellingPointsText: string;
  settings: StudioSettings;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  refine: true,
  hdEnhance: true,
  includeSizeChart: false,
  styleMode: 'auto',
  mainCount: 5,
  detailCount: 4,
};

export const MAIN_KIND_LABELS: Record<MainKind, string> = {
  white: '白底主图',
  size: '尺寸图',
  scene: '场景变更图',
  attr: '属性海报图',
  model: '模特场景图',
  combine: '双产品合成图',
};

/** 生成目标尺寸：生图模型输出 → 精确缩放到电商规范尺寸 */
export const TARGET_SIZE: Record<JobSlot, { width: number; height: number }> = {
  main: { width: 2000, height: 2000 },
  detail: { width: 1940, height: 1200 },
};

/** 生图模型接受的尺寸（需在 2560x1440 ~ 4096x4096 范围内） */
export const GEN_SIZE: Record<JobSlot, string> = {
  main: '2560x2560',
  detail: '2560x1584',
};

/** SKU 只保留安全文件名字符 */
export function sanitizeSku(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'SKU';
}

/**
 * 解析卖点清单（高敏感度）：
 * - 行首序号前缀宽容匹配：图1：/ 图 1: / 第1张 / 1. / 一、等均可
 * - 一行内多个卖点自动拆分（+ ＋ , ， 、 ; ； / | 均可作分隔）
 * - 自动去重、去空，返回纯净卖点数组
 * 例："图2: 蚊子厚度，柔软度，高强力的支撑度" → ["蚊子厚度", "柔软度", "高强力的支撑度"]
 */
/**
 * 用户图位规格：卖点清单升级为「图位清单」——
 * 用户直接指定每张图的类型与内容（如 "图1 模特图"、"详情页图2 细节图 绒面质感"），
 * AI 只负责按图位填充创意内容，不再自行规划图类型与顺序。
 */
export interface SlotSpec {
  /** main = 主图 / detail = 详情页图 */
  slot: JobSlot;
  /** 该图位在对应 slot 内的序号（从 1 开始，按用户书写顺序） */
  index: number;
  /** 用户指定的图类型；auto = 未指明类型，由 AI 按产品与卖点决定 */
  kind: JobKind | 'auto';
  /** 图位备注（卖点 / 内容要求），已剥离类型词 */
  note: string;
  /** 原始行文本（用于展示与校验） */
  raw: string;
}

export interface ParsedSlotSpecs {
  specs: SlotSpec[];
  /** 无法匹配图位格式的行，作为卖点池供 AI 参考 */
  notes: string[];
}

/** 主图类型关键词（顺序即匹配优先级，长词在前） */
const MAIN_KIND_WORDS: Array<{ kind: MainKind; words: string[] }> = [
  { kind: 'white', words: ['白底', '纯白', '透明底'] },
  { kind: 'size', words: ['尺寸', '规格', '大小'] },
  { kind: 'scene', words: ['场景变更', '场景图', '场景'] },
  { kind: 'attr', words: ['属性海报', '卖点海报', '属性图', '细节图', '细节', '材质', '特写', '属性'] },
  { kind: 'model', words: ['模特场景', '模特图', '模特', '真人', '人宠', '使用图'] },
  { kind: 'combine', words: ['合成图', '产品合成', '二合一', '合成', '组合图', '合并'] },
];

/**
 * 解析「图位清单」（人工指定的图位规格，最高优先级）：
 * - 行格式：[主图|详情页] 图N [类型词] [备注]
 * - 例："图1 模特图" → main/1/model；"详情页图2 细节图 绒面质感" → detail/2/note=绒面质感
 * - 宽容匹配：图1: / 图 1、/ 主图1- 等均支持；序号缺省按出现顺序自动补
 * - 无法识别图位的行进入 notes（卖点池）
 */
export function parseSlotSpecs(text: string): ParsedSlotSpecs {
  const specs: SlotSpec[] = [];
  const notes: string[] = [];
  const counters: Record<JobSlot, number> = { main: 0, detail: 0 };
  const LINE_RE = /^(主图|详情页)?\s*图\s*(\d*)\s*[:：、\-—.]?\s*(.*)$/;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = LINE_RE.exec(line);
    if (!match) {
      notes.push(line);
      continue;
    }
    const [, slotWord, numWord, restRaw] = match;
    const rest = restRaw.trim();
    if (!slotWord && !numWord) {
      notes.push(line);
      continue;
    }
    const slot: JobSlot = slotWord === '详情页' ? 'detail' : 'main';
    const index = numWord ? Number.parseInt(numWord, 10) : counters[slot] + 1;
    if (!Number.isFinite(index) || index < 1) {
      notes.push(line);
      continue;
    }

    let kind: JobKind | 'auto' = 'auto';
    let note = rest;
    if (slot === 'main') {
      const hit = MAIN_KIND_WORDS.find((entry) =>
        entry.words.some((word) => rest.includes(word)),
      );
      if (hit) {
        kind = hit.kind;
        // 剥离类型词（含紧随的"图"字，如"白底图/场景图/模特图"整体剥离）
        for (const word of hit.words) note = note.split(word + '图').join(' ');
        for (const word of hit.words) note = note.split(word).join(' ');
      }
    } else {
      kind = 'detail';
    }
    note = note.replace(/^[，,、;；:：\s]+|[，,、;；:：\s]+$/g, '').trim();
    counters[slot] = Math.max(counters[slot], index);
    specs.push({ slot, index, kind, note, raw: line });
  }
  return { specs, notes };
}

export function parseSellingPoints(text: string): string[] {
  const SPLIT_RE = /[+＋,，、;；/|]+/;
  const seen = new Set<string>();
  const points: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const body = line
      .replace(
        /^(图\s*\d+|第\s*\d+\s*张?|\d+|[①②③④⑤⑥⑦⑧⑨⑩]|[一二三四五六七八九十]{1,3})\s*[：:、.，,\-—)）]*\s*/,
        '',
      )
      .trim();
    if (!body) continue;
    for (const part of body.split(SPLIT_RE)) {
      const point = part.trim();
      if (!point) continue;
      const key = point.replace(/\s+/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        points.push(point);
      }
    }
  }
  return points;
}
