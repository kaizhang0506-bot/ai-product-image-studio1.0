import { validateNodeModels, type NodeModel } from '@/lib/node-models';
import { PRODUCT_NODE_INSTRUCTION, LAYOUT_NODE_INSTRUCTION } from '@/lib/prompt-registry';
import { NextRequest, NextResponse } from 'next/server';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { resolveKimiKey, understandChat } from '@/lib/kimi-client';
import {
  QUOTA_CLOSED_MESSAGE,
  readQuota,
} from '@/lib/quota-server';
import { fillTemplate, getPromptText } from '@/lib/prompt-registry';
import {
  MAIN_KIND_LABELS,
  parseSlotSpecs,
  type AnalyzeRequestBody,
  type AnalysisResult,
  type CampaignBrief,
  type CampaignSlotPlan,
  type ColorSwatch,
  type MainKind,
  type ParsedSlotSpecs,
  type PlanJob,
  type ProductImageRead,
  type SceneDna,
  type StyleAnalysis,
  type UnderstandEngine,
} from '@/lib/studio-types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAIN_KINDS: MainKind[] = ['white', 'size', 'scene', 'attr', 'model'];
const EXTRA_ROTATION: MainKind[] = ['scene', 'attr', 'model'];

type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' } };

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatPart[];
}

interface RawJob {
  kind?: unknown;
  title?: unknown;
  copy?: unknown;
  concept?: unknown;
  productImageIndex?: unknown;
}

interface RawImageRead {
  index?: unknown;
  angle?: unknown;
  details?: unknown;
  bestFor?: unknown;
}

interface RawSlotPlan {
  id?: unknown;
  role?: unknown;
  focus?: unknown;
  notes?: unknown;
}

interface RawCampaign {
  storyline?: unknown;
  artDirection?: unknown;
  coverage?: unknown;
  slots?: unknown;
}

interface RawPlan {
  productUnderstanding?: unknown;
  productImages?: unknown;
  style?: {
    atmosphere?: unknown;
    styleKeywords?: unknown;
    colorPalette?: unknown;
    layoutNotes?: unknown;
  };
  campaign?: RawCampaign;
  mainImages?: unknown;
  detailImages?: unknown;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN;
  return Number.isNaN(n) ? fallback : clamp(n, min, max);
}

const STYLE_MODE_HINTS: Record<string, string> = {
  studio: '【风格基调】用户指定「影棚精修」：atmosphere 与 styleKeywords 需面向纯色无缝背景、专业影棚布光、锐利商业质感策划。',
  lifestyle: '【风格基调】用户指定「生活场景」：atmosphere 与 styleKeywords 需面向自然窗光、温馨居家氛围、真实生活方式策划。',
  poster: '【风格基调】用户指定「简约海报」：atmosphere 与 styleKeywords 需面向大色块背景、强排版构成、大留白平面设计感策划。',
};

const KIND_NAME_CN: Record<MainKind, string> = {
  white: '白底图',
  size: '尺寸图',
  scene: '场景图',
  attr: '属性海报图',
  model: '模特图',
  combine: '双产品合成图',
};

function buildSpecSection(specs: ParsedSlotSpecs): string {
  const mainSpecs = specs.specs.filter((s) => s.slot === 'main');
  const detailSpecs = specs.specs.filter((s) => s.slot === 'detail');
  const render = (list: typeof mainSpecs, isMain: boolean): string =>
    list
      .map((s) => {
        const typeName =
          isMain && s.kind !== 'auto' ? KIND_NAME_CN[s.kind as MainKind] : isMain ? '类型由你决定' : '详情页图';
        const note = s.note ? `：${s.note}` : '';
        return `- ${isMain ? '主图' : '详情页'}图${s.index}（${typeName}）${note}`;
      })
      .join('\n');
  const parts: string[] = [];
  if (mainSpecs.length > 0) parts.push(`主图图位：\n${render(mainSpecs, true)}`);
  if (detailSpecs.length > 0) parts.push(`详情页图位：\n${render(detailSpecs, false)}`);
  if (specs.notes.length > 0) {
    parts.push(`补充卖点池（可融入上图位）：\n${specs.notes.map((n) => `- ${n}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

function buildInstruction(body: AnalyzeRequestBody, specs: ParsedSlotSpecs): string {
  const specDriven = specs.specs.length > 0;
  const mainCount = specDriven
    ? specs.specs.filter((s) => s.slot === 'main').length
    : clampNumber(body.settings?.mainCount, 5, 7, 5);
  const detailCount = specDriven
    ? specs.specs.filter((s) => s.slot === 'detail').length
    : clampNumber(body.settings?.detailCount, 3, 7, 4);
  const sellingLines =
    body.sellingPoints.length > 0
      ? body.sellingPoints.map((sp, i) => `${i + 1}. ${sp}`).join('\n')
      : '（用户未填写卖点，请基于产品理解自动策划核心卖点）';
  const productTotal = Math.max(body.productImages.length - 1, 0);

  const slotIdNote = specDriven
    ? `用户已逐张指定图位（最高优先级），slots 的 id 顺序必须为：${specs.specs
        .map((s) => `${s.slot === 'main' ? 'm' : 'd'}${s.index}`)
        .join(' → ')}，不得增删调换。图位括号内的类型已由用户指定，你只负责统筹这张图"讲什么故事、看什么重点"。图位规格如下：

${buildSpecSection(specs)}`
    : `用户未指定图位，出图数量：主图 ${mainCount} 张（第 1 张固定为白底图 white${body.settings?.includeSizeChart ? '、第 2 张为尺寸图 size' : ''}，其余在 场景图 scene / 属性海报图 attr / 模特图 model 中多样化分配${(body.productImages?.length ?? 0) >= 2 ? '；若产品具备多件组合使用价值，可将其中 1 张设为双产品合成图 combine（把两件产品合拢陈列）' : ''}）、详情页 ${detailCount} 张（每张承载一条卖点）。slots 的 id 顺序必须为：m1 → ${Array.from({ length: Math.max(mainCount - 1, 0) }, (_, i) => `m${i + 2}`).join(' → ')}${mainCount > 1 ? ' → ' : ''}d1 → ${Array.from({ length: Math.max(detailCount - 1, 0) }, (_, i) => `d${i + 2}`).join(' → ')}。`;

  const styleModeHint = STYLE_MODE_HINTS[body.settings?.styleMode ?? 'auto'] ?? '';
  const slotsConstraint = specDriven
    ? '必须逐图位输出、id 顺序与用户图位一一对应'
    : '按主图+详情页图位顺序输出';
  const logoNote = body.logoUrl ? ' → 品牌 logo' : '';

  return fillTemplate(getPromptText('scout'), {
    productImageCount: String(body.productImages.length),
    productTotal: String(productTotal),
    slotIdNote,
    styleModeHint,
    slotsConstraint,
    productName: body.productName || '未提供',
    sku: body.sku || '未提供',
    sellingLines,
    logoNote,
  });
}

function buildMessages(body: AnalyzeRequestBody, specs: ParsedSlotSpecs): ChatMessage[] {
  const content: ChatPart[] = [{ type: 'text', text: buildInstruction(body, specs) }];

  const productImages = body.productImages.slice(0, 6);
  if (productImages.length > 0) {
    content.push({ type: 'text', text: '产品图如下：' });
    productImages.forEach((url, i) => {
      content.push({ type: 'text', text: `产品图 ${i}：` });
      content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
    });
  }

  const bgRefs = body.bgRefs.slice(0, 4);
  if (bgRefs.length > 0) {
    content.push({ type: 'text', text: '背景氛围参考图如下（只提炼氛围，不照搬）：' });
    bgRefs.forEach((url) => {
      content.push({ type: 'image_url', image_url: { url, detail: 'low' } });
    });
  }

  const layoutRefs = body.layoutRefs.slice(0, 4);
  if (layoutRefs.length > 0) {
    content.push({ type: 'text', text: '排版设计参考图如下（只提炼版式语言，不照搬）：' });
    layoutRefs.forEach((url) => {
      content.push({ type: 'image_url', image_url: { url, detail: 'low' } });
    });
  }

  if (body.logoUrl) {
    content.push({ type: 'text', text: '品牌 logo：' });
    content.push({ type: 'image_url', image_url: { url: body.logoUrl, detail: 'low' } });
  }

  return [
    {
      role: 'system',
      content:
        '你是资深电商视觉总监。你只输出严格 JSON，不输出任何多余文字、注释或 markdown 代码块。',
    },
    { role: 'user', content },
  ];
}

/**
 * LLM 输出 JSON 容错修复：字符串值内部混入未转义的英文双引号
 * （模型在中文文案里写 "xxx" 式引用时未转义，导致 JSON.parse 报
 * "Expected ',' or '}' after property value"）。
 * 状态机逐字符扫描：字符串内部的 " 若其后第一个非空白字符不是合法结构字符（, } ] :），
 * 则判定为值内引号并转义。
 */
function repairJsonQuotes(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (ch === '\\') {
      out += ch + (text[i + 1] ?? '');
      i += 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const next = text[j];
      if (next === undefined || ',}]:'.includes(next)) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

function extractJson(text: string): RawPlan {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI 返回内容无法解析为 JSON');
  }
  const jsonText = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonText) as RawPlan;
  } catch {
    // 容错：修复字符串值内部未转义引号后重试
    return JSON.parse(repairJsonQuotes(jsonText)) as RawPlan;
  }
}

function normalizePalette(v: unknown): ColorSwatch[] {
  if (!Array.isArray(v)) return [];
  const out: ColorSwatch[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const hex = str(rec.hex);
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
    out.push({ hex: hex.toUpperCase(), name: str(rec.name) || '主色' });
    if (out.length >= 6) break;
  }
  return out;
}

/** 统筹 AI 简报归一化：slots 与图位顺序严格对齐，缺失图位补默认任务 */
function normalizeCampaign(raw: RawCampaign, specs: ParsedSlotSpecs): CampaignBrief {
  const specDriven = specs.specs.length > 0;
  const expectedIds = specDriven
    ? specs.specs.map((s) => `${s.slot === 'main' ? 'm' : 'd'}${s.index}`)
    : [];
  const rawSlots = Array.isArray(raw.slots)
    ? (raw.slots as RawSlotPlan[]).filter(
        (s): s is RawSlotPlan => Boolean(s) && typeof s === 'object',
      )
    : [];
  const byId = new Map<string, RawSlotPlan>();
  for (const slot of rawSlots) {
    const id = str(slot.id);
    if (id && !byId.has(id)) byId.set(id, slot);
  }
  const slots: CampaignSlotPlan[] = (specDriven ? expectedIds : rawSlots.map((s) => str(s.id)).filter(Boolean)).map(
    (id, i) => {
      const item = byId.get(id);
      return {
        id,
        role: str(item?.role) || (specDriven ? '按用户图位规格执行该图位的转化任务' : `第 ${i + 1} 位画面任务`),
        focus: str(item?.focus) || '产品主体与核心卖点元素',
        notes: str(item?.notes) || '与相邻图位保持视角或道具差异，避免重复构图',
      };
    },
  );
  return {
    storyline: str(raw.storyline) || '首图建立产品信任，中段逐卖点证实，末图呈现真实使用场景促成转化',
    artDirection:
      str(raw.artDirection) ||
      '统一柔和自然光与暖调色温；道具从简、色调与色板一致；视角在平视/俯视间交替形成节奏；画面元素克制留白充足',
    coverage: str(raw.coverage) || '卖点已分配到具体图位，无明显缺口',
    slots,
  };
}

interface ScoutContext {
  productUnderstanding: string;
  productImages: ProductImageRead[];
  style: StyleAnalysis;
  campaign: CampaignBrief;
}

/** 第一轮结果归一化：细读 + 风格 + 统筹简报 */
function normalizeScout(raw: RawPlan, body: AnalyzeRequestBody, specs: ParsedSlotSpecs): ScoutContext {
  const style = raw.style && typeof raw.style === 'object' ? raw.style : {};
  const keywords = Array.isArray(style.styleKeywords)
    ? style.styleKeywords
        .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
        .map((k) => k.trim())
        .slice(0, 8)
    : [];
  return {
    productUnderstanding:
      str(raw.productUnderstanding) || `以参考图为准：${body.productName}`,
    productImages: normalizeProductImages(raw, body),
    style: {
      atmosphere: str(style.atmosphere) || '干净明亮的商业影棚氛围，主体突出',
      styleKeywords: keywords.length > 0 ? keywords : ['高级', '简洁', '商业感'],
      colorPalette: normalizePalette(style.colorPalette),
      layoutNotes: str(style.layoutNotes) || '非对称栅格，主标题贴顶部网格线，留白充足，细线分隔，最多两档字号',
    },
    campaign: normalizeCampaign(
      raw.campaign && typeof raw.campaign === 'object' ? raw.campaign : {},
      specs,
    ),
  };
}

/** 第二轮：策划环节。消费统筹简报，产出逐图位画面策划（纯文本，无需再看图） */
function buildPlanInstruction(body: AnalyzeRequestBody, specs: ParsedSlotSpecs, scout: ScoutContext): string {
  const specDriven = specs.specs.length > 0;
  const mainCount = specDriven
    ? specs.specs.filter((s) => s.slot === 'main').length
    : clampNumber(body.settings?.mainCount, 5, 7, 5);
  const detailCount = specDriven
    ? specs.specs.filter((s) => s.slot === 'detail').length
    : clampNumber(body.settings?.detailCount, 3, 7, 4);
  const productTotal = Math.max(body.productImages.length - 1, 0);
  const sellingLines =
    body.sellingPoints.length > 0
      ? body.sellingPoints.map((sp, i) => `${i + 1}. ${sp}`).join('\n')
      : '（用户未填写卖点，按统筹简报的 coverage 分配执行）';

  const readLines = scout.productImages
    .map((r) => `- 产品图 ${r.index}：${r.angle}；${r.details}；适合：${r.bestFor}`)
    .join('\n');
  const slotLines = scout.campaign.slots
    .map((s) => `- ${s.id}｜叙事角色：${s.role}｜视觉重心：${s.focus}｜执行要点：${s.notes}`)
    .join('\n');
  const palette = scout.style.colorPalette.map((c) => `${c.name}${c.hex}`).join('、');

  const upstreamIntel = `■ 产品理解：${scout.productUnderstanding}
■ 产品图细读（绑定 productImageIndex 的唯一依据）：
${readLines || '（无产品图，画面以参考图氛围为准）'}
■ 套系风格：${scout.style.atmosphere}；关键词：${scout.style.styleKeywords.join('、')}${palette ? `；色板：${palette}` : ''}；版式：${scout.style.layoutNotes}
■ 套系叙事线：${scout.campaign.storyline}
■ 套系美术宪法（每张图必须遵守）：${scout.campaign.artDirection}
■ 卖点覆盖审查：${scout.campaign.coverage}
■ 逐图位统筹任务（concept 必须执行对应图位的视觉重心与执行要点）：
${slotLines || '（无逐图位任务，按卖点顺序均衡分配）'}`;

  const plannerSlotRules = specDriven
    ? `图位类型已由用户指定：kind 原样输出（类型待定的图位由你从 white/size/scene/attr/model 中选定）。用户图位规格：
${buildSpecSection(specs)}`
    : `类型分配：主图第 1 条 kind=white（无文字）${body.settings?.includeSizeChart ? '、第 2 条 kind=size' : ''}，其余在 scene/attr/model 中多样化分配；详情页 kind 一律 detail。`;

  return fillTemplate(getPromptText('planner'), {
    mainCount: String(mainCount),
    detailCount: String(detailCount),
    plannerSlotRules,
    productTotal: String(productTotal),
    upstreamIntel,
    productName: body.productName || '未提供',
    sku: body.sku || '未提供',
    sellingLines,
  });
}

function buildPlanMessages(body: AnalyzeRequestBody, specs: ParsedSlotSpecs, scout: ScoutContext): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是资深电商视觉策划师。你只输出严格 JSON，不输出任何多余文字、注释或 markdown 代码块。',
    },
    { role: 'user', content: buildPlanInstruction(body, specs, scout) },
  ];
}

function normalizeJobs(raw: RawPlan, body: AnalyzeRequestBody, specs: ParsedSlotSpecs): PlanJob[] {
  const hasProductImages = body.productImages.length > 0;
  const clampIdx = (v: unknown): number => {
    const n =
      typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
    if (!hasProductImages) return 0;
    return clamp(n, 0, body.productImages.length - 1);
  };
  const rawMains = Array.isArray(raw.mainImages)
    ? (raw.mainImages as RawJob[]).filter(
        (m): m is RawJob => Boolean(m) && typeof m === 'object',
      )
    : [];
  const rawDetails = Array.isArray(raw.detailImages)
    ? (raw.detailImages as RawJob[]).filter(
        (d): d is RawJob => Boolean(d) && typeof d === 'object',
      )
    : [];
  const jobs: PlanJob[] = [];

  const mainSpecs = specs.specs.filter((s) => s.slot === 'main');
  const detailSpecs = specs.specs.filter((s) => s.slot === 'detail');

  const defaultCopy: Record<MainKind, string> = {
    white: '',
    size: 'Measured to fit',
    scene: 'Premium quality',
    attr: 'Thoughtful details',
    model: 'Real life use',
    combine: 'Better together',
  };
  const defaultTitle: Record<MainKind, string> = {
    white: '',
    size: 'Dimensions',
    scene: 'EVERYDAY COMFORT',
    attr: 'THOUGHTFUL DETAILS',
    model: 'REAL LIFE USE',
    combine: 'COMPLETE SETUP',
  };

  if (mainSpecs.length > 0) {
    // ---- 图位驱动：主图逐条对齐用户规格 ----
    mainSpecs.forEach((spec, i) => {
      const rawItem = rawMains[i];
      let kind: MainKind;
      if (spec.kind !== 'auto' && spec.kind !== 'detail') {
        kind = spec.kind;
      } else {
        const k = str(rawItem?.kind);
        kind = MAIN_KINDS.includes(k as MainKind)
          ? (k as MainKind)
          : EXTRA_ROTATION[i % EXTRA_ROTATION.length];
      }
      jobs.push({
        id: `m${i + 1}`,
        slot: 'main',
        kind,
        label: '',
        title: str(rawItem?.title) || defaultTitle[kind],
        copy: str(rawItem?.copy) || defaultCopy[kind],
        concept:
          str(rawItem?.concept) ||
          (spec.note
            ? `围绕「${spec.note}」结合套系风格与绑定产品图的细读细节设计画面`
            : '结合套系风格与绑定产品图的细读细节设计画面'),
        productImageIndex: clampIdx(rawItem?.productImageIndex ?? 0),
        enabled: true,
      });
    });
  } else {
    // ---- 自主规划模式（无图位规格）：白底固定 + 尺寸可选 + 轮转分配 ----
    const mainCount = clampNumber(body.settings?.mainCount, 5, 7, 5);
    const extraRaws = rawMains.filter((m) => {
      const k = str(m.kind);
      return k === 'scene' || k === 'attr' || k === 'model';
    });

    // 1. 白底图（固定第一张，无文字无 logo）
    const whiteRaw = rawMains.find((m) => str(m.kind) === 'white') ?? rawMains[0];
    jobs.push({
      id: 'm1',
      slot: 'main',
      kind: 'white',
      label: '',
      title: '',
      copy: '',
      concept: str(whiteRaw?.concept) || '纯白底产品主图，突出产品本体',
      productImageIndex: clampIdx(whiteRaw?.productImageIndex ?? 0),
      enabled: true,
    });

    // 2. 尺寸图（可选）
    if (body.settings?.includeSizeChart && jobs.length < mainCount) {
      const sizeRaw =
        rawMains.find((m) => str(m.kind) === 'size') ?? rawMains[1];
      jobs.push({
        id: `m${jobs.length + 1}`,
        slot: 'main',
        kind: 'size',
        label: '',
        title: str(sizeRaw?.title) || 'Dimensions',
        copy: str(sizeRaw?.copy) || 'Key dimensions',
        concept: str(sizeRaw?.concept) || '工程制图风格的尺寸标注图',
        productImageIndex: clampIdx(sizeRaw?.productImageIndex ?? 0),
        enabled: true,
      });
    }

    // 3. 其余主图：scene / attr / model 轮转分配卖点
    let sellingIdx = 0;
    let rotateIdx = 0;
    while (jobs.length < mainCount) {
      const rawItem = extraRaws.shift();
      const rawKind = str(rawItem?.kind);
      const kind: MainKind =
        rawKind === 'scene' || rawKind === 'attr' || rawKind === 'model'
          ? rawKind
          : EXTRA_ROTATION[rotateIdx % EXTRA_ROTATION.length];
      rotateIdx += 1;
      const sp = body.sellingPoints[sellingIdx] ?? '';
      sellingIdx += 1;
      jobs.push({
        id: `m${jobs.length + 1}`,
        slot: 'main',
        kind,
        label: '',
        title: str(rawItem?.title) || defaultTitle[kind],
        copy: str(rawItem?.copy) || defaultCopy[kind],
        concept: str(rawItem?.concept) || (sp ? `围绕卖点"${sp}"结合参考氛围重新设计画面` : '结合参考氛围重新设计画面'),
        productImageIndex: clampIdx(rawItem?.productImageIndex ?? 0),
        enabled: true,
      });
    }
  }

  // ---- 详情页 ----
  if (detailSpecs.length > 0) {
    // 图位驱动：详情页逐条对齐用户规格
    detailSpecs.forEach((spec, i) => {
      const rawItem = rawDetails[i];
      jobs.push({
        id: `d${i + 1}`,
        slot: 'detail',
        kind: 'detail',
        label: '',
        title: str(rawItem?.title) || '',
        copy: str(rawItem?.copy) || '',
        concept:
          str(rawItem?.concept) ||
          (spec.note
            ? `围绕「${spec.note}」组织画面：景别、光线与元素需与套系风格一致`
            : '围绕该卖点组织画面，与套系风格一致'),
        productImageIndex: clampIdx(rawItem?.productImageIndex ?? i),
        enabled: true,
      });
    });
  } else {
    const detailCount = clampNumber(body.settings?.detailCount, 3, 7, 4);
    for (let i = 0; i < detailCount; i += 1) {
      const rawItem = rawDetails[i];
      const sp = body.sellingPoints[i] ?? '';
      jobs.push({
        id: `d${i + 1}`,
        slot: 'detail',
        kind: 'detail',
        label: '',
        title: str(rawItem?.title) || '',
        copy: str(rawItem?.copy) || '',
        concept: str(rawItem?.concept) || (sp ? `围绕卖点"${sp}"组织画面` : '围绕该卖点组织画面'),
        productImageIndex: clampIdx(rawItem?.productImageIndex ?? i),
        enabled: true,
      });
    }
  }

  // ---- 展示名 ----
  let mainSeq = 0;
  let detailSeq = 0;
  for (const job of jobs) {
    if (job.slot === 'main') {
      mainSeq += 1;
      job.label = `主图${mainSeq} · ${MAIN_KIND_LABELS[job.kind as MainKind] ?? '主图'}`;
    } else {
      detailSeq += 1;
      job.label = `详情页${detailSeq}`;
    }
  }
  return jobs;
}

/** 画面标题质检：空值或 "Key Feature N" 式空泛占位词 */
const TITLE_PLACEHOLDER_RE = /^(key\s+)?features?\s*\d*$/i;

/** 补全失败时的类型短语兜底（有语义、非占位） */
const KIND_TITLE_FALLBACK: Record<string, string> = {
  size: 'Dimensions',
  scene: 'EVERYDAY COMFORT',
  attr: 'THOUGHTFUL DETAILS',
  model: 'REAL LIFE USE',
  detail: 'CRAFTED DETAILS',
  combine: 'COMPLETE SETUP',
};

/**
 * 标题补全：策划漏给/给出占位 title 的图位，由文案专家批量产出卖点驱动的英文文案；
 * 调用失败不阻塞——按图位类型给具体短语兜底。
 */
async function fillTitlesIfNeeded(
  jobs: PlanJob[],
  body: AnalyzeRequestBody,
  channel: UnderstandChannel,
): Promise<PlanJob[]> {
  const needs = jobs.filter((j) => {
    if (j.kind === 'white') return false; // 白底图不渲染文字
    const title = (j.title || '').trim();
    const copy = (j.copy || '').trim();
    return !title || TITLE_PLACEHOLDER_RE.test(title) || !copy;
  });
  if (needs.length === 0) return jobs;

  const needIds = new Set(needs.map((j) => j.id));
  const applyFallback = (j: PlanJob): PlanJob => ({
    ...j,
    title: (j.title || '').trim() && !TITLE_PLACEHOLDER_RE.test(j.title.trim())
      ? j.title
      : KIND_TITLE_FALLBACK[j.kind] || j.title,
    copy: (j.copy || '').trim() || 'Designed to impress',
  });

  try {
    const list = needs
      .map((j) => `- ${j.id}（${j.label || j.kind}）：画面策划「${j.concept || '未提供'}」`)
      .join('\n');
    const { content } = await understandChat({
      messages: [
        {
          role: 'user',
          content: fillTemplate(getPromptText('copywriter'), {
            productName: body.productName || '未提供',
            sellingPoints: body.sellingPoints.join('；') || '未提供',
            jobList: list,
          }),
        },
      ],
      nodeModel: channel.nodeModel,
      kimiKey: channel.kimiKey,
      customHeaders: channel.customHeaders,
      fallbackModel: 'doubao-seed-2-0-lite-260215', // 补全任务轻量，无 Key 时走 lite 提速
    });
    const parsed = extractJson(content);
    const arr = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const item of arr) {
      if (item && typeof item.id === 'string') byId.set(item.id, item);
    }
    return jobs.map((j) => {
      if (!needIds.has(j.id)) return j;
      const got = byId.get(j.id);
      const title = typeof got?.title === 'string' ? got.title.trim() : '';
      const copy = typeof got?.copy === 'string' ? got.copy.trim() : '';
      const filled: PlanJob = { ...j };
      if (title && !TITLE_PLACEHOLDER_RE.test(title)) filled.title = title;
      if (copy) filled.copy = copy;
      return applyFallback(filled);
    });
  } catch (error) {
    if (channel.nodeModel && channel.nodeModel.provider !== 'auto') throw error;
    return jobs.map((j) => (needIds.has(j.id) ? applyFallback(j) : j));
  }
}

function normalizeProductImages(raw: RawPlan, body: AnalyzeRequestBody): ProductImageRead[] {
  const total = body.productImages.length;
  const rawList = Array.isArray(raw.productImages)
    ? (raw.productImages as RawImageRead[]).filter(
        (r): r is RawImageRead => Boolean(r) && typeof r === 'object',
      )
    : [];
  const byIndex = new Map<number, RawImageRead>();
  for (const item of rawList) {
    const idx = clampNumber(item.index, 0, Math.max(total - 1, 0), -1);
    if (idx >= 0 && !byIndex.has(idx)) byIndex.set(idx, item);
  }
  const out: ProductImageRead[] = [];
  for (let i = 0; i < total; i += 1) {
    const item = byIndex.get(i);
    out.push({
      index: i,
      angle: str(item?.angle) || `产品图 ${i + 1}`,
      details: str(item?.details) || '（模型未提供细读描述，可重新策划）',
      bestFor: str(item?.bestFor) || '通用出图参考',
    });
  }
  return out;
}

/** 理解通道：Kimi Key（可空——空时走内置兜底模型）+ 网关转发头 */
interface UnderstandChannel {
  nodeModel?: NodeModel;
  kimiKey: string;
  customHeaders: Record<string, string>;
}

async function invokeJson(
  messages: ChatMessage[],
  label: string,
  channel: UnderstandChannel,
): Promise<{ parsed: RawPlan; engine: UnderstandEngine }> {
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { content, engine } = await understandChat({
        messages,
        nodeModel: channel.nodeModel,
      kimiKey: channel.kimiKey,
        customHeaders: channel.customHeaders,
      });
      return { parsed: extractJson(content), engine };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${label}：${lastError}`);
}

/** 两轮调用：①总导演（细读+风格+统筹简报）→ ②策划师（消费简报产出图位策划） */
async function requestAnalysis(
  body: AnalyzeRequestBody,
  specs: ParsedSlotSpecs,
  channel: UnderstandChannel,
): Promise<AnalysisResult> {
  const nodeChannel = (nodeModel?: NodeModel): UnderstandChannel => ({ ...channel, nodeModel });
  const productMessages = buildMessages({ ...body, bgRefs: [], layoutRefs: [] }, specs);
  productMessages.push({ role: 'user', content: PRODUCT_NODE_INSTRUCTION });
  const layoutMessages: ChatMessage[] = [{ role: 'user', content: [
    { type: 'text', text: LAYOUT_NODE_INSTRUCTION },
    ...body.layoutRefs.map((url): ChatPart => ({ type: 'image_url', image_url: { url, detail: 'high' } })),
  ] }];
  const [productResult, sceneDna, layoutResult] = await Promise.all([
    invokeJson(productMessages, '产品图片分析失败', nodeChannel(body.nodeModels?.product)),
    body.bgRefs.length ? extractSceneDna(body, nodeChannel(body.nodeModels?.background)) : Promise.resolve(undefined),
    body.layoutRefs.length ? invokeJson(layoutMessages, '排版参考分析失败', nodeChannel(body.nodeModels?.layout)) : Promise.resolve(undefined),
  ]);
  const directorMessages = buildMessages(body, specs);
  directorMessages.push({ role: 'user', content: '以下为前置节点的分析结果，请据此完成套系统筹，不要丢失产品细读、场景和排版信息：' + JSON.stringify({ product: productResult.parsed, background: sceneDna, layout: layoutResult?.parsed }) });
  const scoutResult = await invokeJson(directorMessages, '总导演统筹失败', nodeChannel(body.nodeModels?.director));
  const scout = normalizeScout(scoutResult.parsed, body, specs);
  scout.productUnderstanding = str(productResult.parsed.productUnderstanding) || scout.productUnderstanding;
  scout.productImages = normalizeProductImages(productResult.parsed, body);
  if (sceneDna) scout.style = { ...scout.style, sceneDna };
  const layoutNotes = str(layoutResult?.parsed.style?.layoutNotes);
  if (layoutNotes) scout.style.layoutNotes = layoutNotes;
  const planResult = await invokeJson(buildPlanMessages(body, specs, scout), 'AI 出图策划失败', nodeChannel(body.nodeModels?.planner));
  const jobs = await fillTitlesIfNeeded(normalizeJobs(planResult.parsed, body, specs), body, nodeChannel(body.nodeModels?.copywriter));
  return {
    productUnderstanding: scout.productUnderstanding,
    productImages: scout.productImages,
    style: scout.style,
    campaign: scout.campaign,
    jobs,
    // 引擎透明度：任一轮降级即标记 kimi-fallback（两轮通道一致，取细读轮为准）
    engine: [productResult.engine, scoutResult.engine, planResult.engine, layoutResult?.engine].includes('kimi-fallback') ? 'kimi-fallback' : scoutResult.engine,
  };
}

/**
 * 场景 DNA 提取 AI（角色：商业空间摄影师 + 软装设计师 + AI 生图提示词工程师）。
 * 核心纪律：只吸收参考图的风格/材质/色彩/光影/氛围质感语言，禁止复刻其拍摄视角、
 * 透视角度、空间格局与物件摆放；所有场景均为全新搭建、全新透视、全新布局。
 */
function buildSceneDnaMessages(body: AnalyzeRequestBody): ChatMessage[] {
  const content: ChatPart[] = [
    {
      type: 'text',
      text: fillTemplate(getPromptText('sceneDna'), { productName: body.productName || '未提供' }),
    },
  ];
  const bgRefs = body.bgRefs.slice(0, 2);
  content.push({ type: 'text', text: '场景参考图：' });
  bgRefs.forEach((url) => {
    content.push({ type: 'image_url', image_url: { url, detail: 'high' } });
  });
  const firstProduct = body.productImages[0];
  if (firstProduct) {
    content.push({ type: 'text', text: '产品图（色彩与光线参照，产品光线方向必须与场景对齐）：' });
    content.push({ type: 'image_url', image_url: { url: firstProduct, detail: 'high' } });
  }
  return [{ role: 'user', content }];
}

function pickStr(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickStrArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0) : [];
}

/** 解析场景 DNA（字段容错映射，失败返回 undefined 不阻塞主流程） */
function normalizeSceneDna(raw: unknown): SceneDna | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const hard = (r.hardMaterials ?? {}) as Record<string, unknown>;
  const soft = (r.softMaterials ?? {}) as Record<string, unknown>;
  const light = (r.lighting ?? {}) as Record<string, unknown>;
  const color = (r.colorSystem ?? {}) as Record<string, unknown>;
  const comp = (r.composition ?? {}) as Record<string, unknown>;
  const scenePrompt = pickStr(r.scenePrompt);
  if (!scenePrompt) return undefined;
  return {
    style: pickStr(r.style),
    moodKeywords: pickStrArray(r.moodKeywords),
    hardMaterials: { floor: pickStr(hard.floor), wall: pickStr(hard.wall), finish: pickStr(hard.finish) },
    softMaterials: { palette: pickStr(soft.palette), fabrics: pickStr(soft.fabrics), decor: pickStr(soft.decor) },
    lighting: { source: pickStr(light.source), colorTemp: pickStr(light.colorTemp), shadow: pickStr(light.shadow), atmosphere: pickStr(light.atmosphere) },
    colorSystem: { primary: pickStr(color.primary), secondary: pickStr(color.secondary), accent: pickStr(color.accent), productAnchor: pickStr(color.productAnchor) },
    composition: { whitespace: pickStr(comp.whitespace), productZone: pickStr(comp.productZone) },
    fitCheck: pickStr(r.fitCheck),
    scenePrompt,
    negativePrompt: pickStr(r.negativePrompt),
  };
}

async function extractSceneDna(body: AnalyzeRequestBody, channel: UnderstandChannel): Promise<SceneDna | undefined> {
  try {
    const { parsed } = await invokeJson(buildSceneDnaMessages(body), '场景 DNA 提取失败', channel);
    return normalizeSceneDna(parsed);
  } catch (error) {
    if (channel.nodeModel && channel.nodeModel.provider !== 'auto') throw error;
    return undefined;
  }
}

/** AI 解析与出图策划：多模态理解产品图 + 参考图 → 风格提炼 + 出图计划 */
export async function POST(request: NextRequest) {
  try {
    // 测试版限量：系统关闭后停止解析
    const quotaState = await readQuota();
    if (quotaState.closed) {
      return NextResponse.json({ error: QUOTA_CLOSED_MESSAGE }, { status: 403 });
    }
    const body = (await request.json()) as AnalyzeRequestBody;
    body.nodeModels = validateNodeModels(body.nodeModels);
    if (!body || typeof body.productName !== 'string' || !body.productName.trim()) {
      return NextResponse.json({ error: '产品名称不能为空' }, { status: 400 });
    }
    // 理解通道：填了 Kimi Key 走最新 Kimi（kimi-k3），不填走内置兜底模型，均可用
    const channel: UnderstandChannel = {
      kimiKey: resolveKimiKey(body.kimiApiKey),
      customHeaders: HeaderUtils.extractForwardHeaders(request.headers),
    };
    // 人工图位规格（最高优先级）："图1 模特图"、"详情页图2 细节图 绒面质感"…
    const specs = parseSlotSpecs(
      typeof body.slotSpecText === 'string' ? body.slotSpecText : '',
    );
    const result = await requestAnalysis(body, specs, channel);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
