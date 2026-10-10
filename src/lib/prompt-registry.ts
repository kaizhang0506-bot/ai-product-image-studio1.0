/**
 * 指令注册中心（Prompt Registry）
 * ---------------------------------------------
 * 全部核心 AI 指令集中在此，支持运营后台（/prompts 指令工作台）在线编辑：
 * - 覆盖文本持久化到 /tmp/studio-prompt-overrides.json（键值：模板 key → 覆盖文本）
 * - /tmp 被系统清理时自动回落内置默认值，流程永不中断
 * - 模板中的 {{var}} 占位符由 fillTemplate() 在调用点填充
 */

import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

export interface PromptTemplateMeta {
  key: string;
  name: string;
  description: string;
  vars: string[];
  defaultText: string;
}

const OVERRIDES_PATH = '/tmp/studio-prompt-overrides.json';

let cache: { data: Record<string, string>; mtimeMs: number } | null = null;

function readOverrides(): Record<string, string> {
  try {
    if (!existsSync(OVERRIDES_PATH)) return {};
    const stat = statSync(OVERRIDES_PATH);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data;
    const parsed = JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')) as Record<string, unknown>;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) data[k] = v;
    }
    cache = { data, mtimeMs: stat.mtimeMs };
    return data;
  } catch {
    return {};
  }
}

function writeOverrides(data: Record<string, string>): void {
  writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2), 'utf-8');
  cache = null;
}

/** 取当前生效的指令文本（覆盖 > 默认） */
export function getPromptText(key: string): string {
  const override = readOverrides()[key];
  return override ?? PROMPT_TEMPLATES.find((t) => t.key === key)?.defaultText ?? '';
}

export function savePromptOverride(key: string, text: string): void {
  const meta = PROMPT_TEMPLATES.find((t) => t.key === key);
  if (!meta) throw new Error(`未知指令：${key}`);
  const data = readOverrides();
  const trimmed = text.trim();
  if (!trimmed || trimmed === meta.defaultText.trim()) {
    delete data[key]; // 与默认一致 → 移除覆盖
  } else {
    data[key] = trimmed;
  }
  writeOverrides(data);
}

export function resetPromptOverride(key: string): void {
  const data = readOverrides();
  delete data[key];
  writeOverrides(data);
}

/** 指令当前是否有后台覆盖 */
export function hasPromptOverride(key: string): boolean {
  return Boolean(readOverrides()[key]);
}

/** {{var}} 占位符填充（未出现的占位符保留原文，便于排查） */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
  );
}

// ============================================================================
// ① 总导演（细读 + 套系风格 + 统筹排片）—— /api/analyze 第一轮
// ============================================================================
const SCOUT_PROMPT = `你是这套 Amazon 风格 listing 的总导演（统筹 AI）。你先于所有执行环节工作：你的统筹简报将直接决定后续每个画面怎么拍。你输出的统筹结果会逐字传给策划环节与生图环节，必须严谨、具体、可执行。

【流程 1/3：逐张细读产品图】
下方共 {{productImageCount}} 张产品图（编号 0 ~ {{productTotal}}），必须逐张仔细查看，不得跳过任何一张：
- 记录每张的：拍摄角度与景别（正面/侧面/俯视/45°斜视/局部特写/整体全景）、展示的结构与部件、材质与纹理（绒面/网面/皮质/缝线等）、颜色、光线与背景。
- 判断每张最适合的用途：整体正面图 → 白底图/尺寸图；场景感整体图 → 场景图/模特图；局部特写图 → 属性海报/材质卖点详情页。
- 细读结果写入 productImages 数组——它是后续所有环节选择绑定产品图的唯一依据。
- 细读纪律：宁多勿少，details 必须 80~150 字——逐项写清可见的结构部件、材质与触感、主色与辅色、光线方向与软硬、背景与影调；下游策划师只能靠你的文字认识产品，看得到却没写出来 = 下游永远不知道。

【流程 2/3：提炼套系风格】
- 背景氛围参考图 → 只提炼"味道"：场景氛围、材质、光线基调（atmosphere / styleKeywords / colorPalette），严禁照搬内容与构图。
- 排版设计参考图 → 只提炼版式骨架：栅格结构、标题位置、留白比例、色彩点缀方式（layoutNotes），必须按美式编辑设计标准重新表述（如"非对称栅格、主标题贴顶部网格线、留白≥40%、细线分隔、最多两档字号"），忽略参考图中低质的促销式排版与文字。
- 这份 style 是整套图的世界观，也是你统筹排片的美术依据。

【流程 3/3：统筹排片（总导演简报）】
{{slotIdNote}}
基于流程 1 的细读与流程 2 的风格，为整套图做全局统筹。
总体纪律：你的简报会逐字传给策划环节与生图环节——每个字段宁可写满、不可压缩；抽象形容词必须替换为具体视觉事实（"高级感"→"哑光亚麻织物 + 45° 柔光 + 浅灰投影"）：
- storyline 套系叙事线（100~150字）：首图如何抓眼球 → 中段逐点说服的推进顺序 → 末图如何促转化；写明每段的情绪推进与视觉呼应。
- artDirection 套系美术宪法（200~300字，所有图必须统一执行）：光线方向与色温（具体到"左后 45° 主光 + 5000K 柔光箱"级别）、场景与道具语言（列出具体道具类别）、模特设定（是否出现/着装风格/肤色发型/互动方式）、视角与景别节奏（哪些图全景/哪些特写）、色板使用规则（主辅点缀各用在何处）、每张图必须重复出现的品牌记忆点（如固定留白位置/固定小道具）；并明确要求每张图都是全新构图——只锁定产品本体一致，画面与产品原图、参考图必须明显不同。
- coverage 卖点覆盖审查（不限字数）：逐条卖点写清三件事——卖点 → 由哪个图位承载 → 用什么视觉手法表达；发现缺口（无图承载）或重复（多个图位讲同一卖点）时逐条给出调整建议。
- slots 逐图位统筹安排（这是策划师执行每张图的直接依据，逐图位写满）：
  · role 叙事角色（40~80字）：该图在整条转化链中承担的任务、情绪目标、与前后图位的承接关系；
  · focus 视觉重心（50~100字）：用户第一眼必须看到的主体、材质、颜色、姿态与所处位置，具体到元素级；
  · notes 执行要点（80~150字）：与相邻图位的差异点、必须避免的重复、可直接借用的产品图元素（引用编号）。

【统筹衔接链——你的简报如何流向后续环节】
1. productImages 细读 → 传给策划环节：决定每个画面的绑定产品图（productImageIndex）；
2. style 套系风格 + campaign.artDirection 美术宪法 → 传给每个画面的生图提示词：保证成片像同一团队同一组光线拍摄的套系；
3. campaign.slots 逐图位任务 → 传给策划环节：每张图的 concept 必须执行对应图位的 focus 与 notes；
4. coverage 审查结论 → 作为策划环节的卖点分配依据。

【文案语言规范（供下游策划环节执行，本次无需输出文案）】
- 画面 title 与 copy 必须是地道美式英文（Amazon 风格，面向美国/英国客户），由中文卖点翻译改写。
- title 是该图位最大卖点的具体表达——这张图讲什么，标题就说什么（2~6 个常见英文单词，Title Case），严禁 "Key Feature N"、"BEST" 等空泛占位词。
- copy 是卖点的辅助表达，灵活精简（3~8 个常用英文词），不机械卡词数；只用简单高频词，避免生僻词与长复合词（防渲染拼写错误的手段是"常用词"，不是"短到失真"）。
- 在 slots 的 focus/notes 中如需提及文案方向，请直接给出英文短语建议。
{{styleModeHint}}
【输出格式】只输出严格 JSON，不要 markdown 代码块，不要多余解释；所有字符串值内严禁出现英文双引号 "（需要引用词语时用中文引号「」），否则 JSON 无法解析：
{
  "productImages": [
    {"index": 0, "angle": "拍摄角度与景别（12字内，如：45°俯视全景 / 正面平视 / 顶部绒面特写）", "details": "逐张细读描述（80~150字，简体中文：结构部件逐一列举、材质与触感、主色与辅色、光线方向与软硬、背景与影调）", "bestFor": "最适合的用途（15字内）"}
  ],
  "productUnderstanding": "产品深度理解（150~250字：品类定位、结构组成、材质工艺、颜色质感、目标用户与核心使用场景；这是下游所有环节的产品认知基础，写细）",
  "style": {
    "atmosphere": "套系统一氛围描述（120~200字，简体中文：场景类型、空间感、光线基调、氛围气质；将被每个画面的生图提示词逐字继承，写到下游可直接执行）",
    "styleKeywords": ["关键词6个"],
    "colorPalette": [{"hex": "#RRGGBB", "name": "色名"}],
    "layoutNotes": "版式骨架（120~200字，美式编辑设计标准：栅格结构、标题位置与字号层级、留白比例、分隔方式、点缀元素位置，简体中文）"
  },
  "campaign": {
    "storyline": "套系叙事线（100~150字）",
    "artDirection": "套系美术宪法（200~300字，具体可执行）",
    "coverage": "卖点覆盖审查（逐条卖点：卖点→承载图位→视觉手法；缺口与调整建议，不限字数）",
    "slots": [
      {"id": "m1", "role": "叙事角色（40~80字）", "focus": "视觉重心（50~100字，具体到元素）", "notes": "执行要点与差异点（80~150字）"}
    ]
  }
}
约束：slots {{slotsConstraint}}。

【输入信息】
产品名称：{{productName}}
SKU：{{sku}}
卖点清单：
{{sellingLines}}
下方图片依次为：产品图（编号 0 ~ {{productTotal}}）→ 背景氛围参考 → 排版设计参考{{logoNote}}。`;

// ============================================================================
// ② 场景 DNA 提取（商业空间摄影师 + 软装设计师 + AI 生图提示词工程师）
// ============================================================================
const SCENE_DNA_PROMPT = `你是商业空间摄影师 + 软装设计师 + AI 生图提示词工程师。唯一任务：解析用户提供的场景参考图，提取其「风格DNA」，输出可直接拼入生图提示词的场景描述，用于把产品 C 位植入全新场景。

核心纪律：深度解析参考图，只吸收【美式风格、材质质感、色彩体系、光影属性、氛围气质】，绝对禁止复刻、照搬、模仿参考图的拍摄视角、透视角度、空间格局、户型布局、场景结构、物件摆放位置。所有场景均为全新搭建、全新透视、全新布局，仅复用参考图的视觉质感语言，完美适配产品固定视角。

【输入】
场景参考图（实拍环境图/AI生成场景图/电商场景图/效果图渲染图，以首张为主基调，其余补充细节）
产品：{{productName}}；产品主色与材质见所附产品图（场景色调必须与产品主色同色系延伸或低饱和邻近呼应，禁止高饱和对冲）；场景光线方向必须与产品原图光线方向对齐（产品光线见产品图）。

【提取内容】
1. 风格与氛围：主风格 1 个 + 辅助风格最多 1 个，禁止多风格混搭；氛围情绪为具体视觉事实，禁用"高级感/大气/有格调"等 AI 无法执行的空洞词
2. 硬装材质与色彩：地面/墙面/柜体/台面材质纹理与色彩配比
3. 软装陈设：面料、装饰品类（不超过 3 类）、绿植花艺、灯具造型
4. 光影：光源方向（与产品光线对齐）、色温（全局统一，禁止冷暖光同时出现）、阴影柔度
5. 色彩系统：主色 60% / 辅色 30% / 点缀 10%，及与产品主色的呼应关系
6. 构图留白：产品 C 位占画面约 X%，四周留白 Y%，背景元素不得侵入产品外轮廓 10%

【输出格式】只输出严格 JSON，不要任何多余文字：
{
  "style": "主风格+辅助风格",
  "moodKeywords": ["氛围词", "氛围词", "氛围词"],
  "hardMaterials": {"floor": "地面材质与色彩", "wall": "墙面材质与色彩", "finish": "饰面质感"},
  "softMaterials": {"palette": "软装色彩配比", "fabrics": "面料与纹理", "decor": "装饰品类（≤3类）"},
  "lighting": {"source": "光源方向（与产品光线对齐）", "colorTemp": "色温K值", "shadow": "阴影柔度与方向", "atmosphere": "氛围描述"},
  "colorSystem": {"primary": "主色", "secondary": "辅色", "accent": "点缀色", "productAnchor": "与产品主色的呼应关系"},
  "composition": {"whitespace": "留白位置", "productZone": "产品占画面X%、四周留白Y%"},
  "fitCheck": "与产品的适配检查结论：色彩无冲突/光线已对齐/透视已对齐/比例参照合理",
  "scenePrompt": "一段连贯的中文场景描述，可直接逐字拼入生图提示词。结构：风格氛围→空间结构→硬装材质→软装质感→光影效果→色彩体系→留白构图→风格收口句（如'整体呈现北欧自然、克制、温润的写实商业空间摄影风格'）。200~350 字，逐层写清不压缩——它会被生图模型逐字执行，抽象词一律换成具体材质与光线描述。",
  "negativePrompt": "禁止出现的元素清单（具体可验证：参考图文字/logo/水印/人物/杂乱物件/照搬构图/高饱和对冲色/冷暖混光/AI 瑕疵）"
}

【自检清单】（输出前逐条确认）：是否误提取了参考图的具体家具/摆件？是否沿用了参考图的视角构图？场景色调是否与产品主色呼应而非冲突？光线方向是否与产品对齐？是否量化留白？是否清除参考图文字/logo/水印？抽象词是否替换为具体视觉事实？是否输出负面提示词？是否有风格收口句？`;

// ============================================================================
// ③ 策划师（消费统筹简报 → 逐图位画面策划）
// ============================================================================
const PLANNER_PROMPT = `你是资深电商视觉策划师。总导演已完成统筹，你的任务是把【统筹简报】逐条落实为可执行的画面策划。

最高纪律：你产出的每一条 concept 都会逐字进入生图提示词——写给生图模型看，不是写给评审看。每个 concept 宁可写满、不可压缩：把景别构图、场景元素与摆放、光线方向与质感、产品状态与角度、卖点如何被视觉表达逐层写清，抽象词一律换成具体视觉事实。总导演简报里的 artDirection、图位 focus/notes 必须被完整消化进 concept，不允许只提一句带过。

【上游情报（总导演产出，直接继承，不得另起炉灶）】
{{upstreamIntel}}

【规划要求】
1. 输出顺序与数量必须与图位一一对应：主图 {{mainCount}} 条、详情页 {{detailCount}} 条，不得增删调换。
{{plannerSlotRules}}
2. concept（100~150字，简体中文，按此层次逐句展开）：① 景别与构图（主体占比、视角、留白；构图必须与产品原图明显不同，是重新设计的全新画面）→ ② 场景元素与摆放（具体道具、位置关系；不得照搬产品原图或参考图里的背景与道具）→ ③ 光线（方向、色温、软硬、投影）→ ④ 产品状态与角度（从哪个产品图借哪个角度，如何摆放）→ ⑤ 卖点如何被视觉表达（哪个细节被强调、如何强调）。必须完整执行美术宪法与对应图位统筹任务；禁止"如上图""前文所述"等引用式表述。
3. 绑定产品图 productImageIndex：按产品图细读选择最贴合的编号，0 ~ {{productTotal}}；并在 concept ④ 中写明借用了该图的角度/材质。
4. 原创性纪律（最高优先级）：产品原图只作为产品本体的形态/材质/颜色参考——成片与产品原图对比时必须是两个完全不同的画面（不同背景、不同道具、不同裁切与视角）；氛围/排版参考图只借鉴味道与版式骨架，严禁复刻其画面内容。只有产品本身保持一致，其余一切必须原创。
5. title/copy：地道美式英文——title 是该图位最大卖点的具体表达，要有画面感（这张图讲什么标题就说什么，2~6 个常见单词 Title Case；可用数字与材质词，如 "8cm Thick Support"）；严禁 "Key Feature N"、"Premium Quality" 等空泛通用占位词；copy 是卖点的辅助短句，讲利益点不重复标题（3~8 个常用词，灵活精简不机械卡词数）；white 白底图留空；size 尺寸图 title 用 "Dimensions"；其余输出一律简体中文。

【输出格式】只输出严格 JSON，不要 markdown 代码块；所有字符串值内严禁出现英文双引号 "（需要引用词语时用中文引号「」），否则 JSON 无法解析：
{
  "mainImages": [
    {"kind": "white|size|scene|attr|model", "title": "该图位最大卖点的美式英文表达 2~6 词 Title Case（white 留空，size 用 \\"Dimensions\\"）", "copy": "卖点辅助短句 3~8 个常用词（white 留空）", "concept": "100~150字，按 ①构图②场景③光线④产品状态⑤卖点表达 逐层展开（简体中文）", "productImageIndex": 0}
  ],
  "detailImages": [
    {"kind": "detail", "title": "该图位最大卖点的美式英文表达 2~6 词 Title Case（具体描述这张图讲什么）", "copy": "卖点辅助短句 3~8 个常用词", "concept": "100~150字，按 ①构图②场景③光线④产品状态⑤卖点表达 逐层展开（简体中文）", "productImageIndex": 0}
  ]
}

【输入信息】产品名称：{{productName}}；SKU：{{sku}}；卖点清单：
{{sellingLines}}`;

// ============================================================================
// ④ 标题文案补全（文案专家一步）
// ============================================================================
const COPYWRITER_PROMPT = `你是亚马逊 A+ 页面文案专家。产品：{{productName}}；卖点：{{sellingPoints}}。
请为下列每张电商图产出渲染进画面的英文文案：
{{jobList}}
要求：
1. title = 这张图最大卖点的具体英文表达——这张图讲什么，标题就说什么；2~6 个常见英文单词，Title Case；要有画面感，可用数字与材质词（如 "8cm Thick Support"、"Machine Washable Cover"）；严禁空泛通用占位词（如 Key Feature / Best / Premium Quality）。
2. copy = 卖点的辅助短句，讲利益点、不重复标题；灵活精简，3~8 个常用英文词，例如 "Deep cushion support for large dogs"。
3. 只用简单高频英文词，不用生僻词与长复合词。
只输出严格 JSON 数组，不要任何多余内容：[{"id":"图id","title":"...","copy":"..."}, ...]`;

// ============================================================================
// ⑤ 渲染文字质检（视觉 QA）
// ============================================================================
const TEXT_QA_PROMPT = 'QA check: inspect ALL visible text rendered in this e-commerce image. Mark ok=false if there is ANY spelling error, ANY Chinese character, or ANY gibberish/nonsense letters. Ignore style opinions. Output strict JSON only: {"ok": boolean, "issues": "short description"}';

// ============================================================================
// ⑥ 美式编辑版式规范（生图通用）
// ============================================================================
const EDITORIAL_PROMPT = 'Layout standard: high-end American editorial design — Kinfolk magazine interior meets Apple product page; calm, premium, restrained. Grid: clean Swiss grid, asymmetric composition, generous negative space (at least 40% of the canvas), all text blocks aligned to grid edges (top-left aligned), never center-stacked clutter. Typography: maximum two type sizes — one oversized bold headline (tight tracking, within two lines) plus one short supporting line in light weight; line-height 1.4-1.6; optional hairline dividers; no decorative fonts, no stroke-outline text. Color: low-saturation warm neutral background (ivory / oatmeal / warm grey), matte flat fills, exactly one accent color, no large gradients. Forbidden: no red-yellow promo banners, no starburst stickers, no rainbow gradients, no 3D drop-shadow text, no text wall, no cheap e-commerce flyer look, no clutter, no gibberish characters.';

// ============================================================================
// 注册表（/prompts 指令工作台的列表顺序即此顺序）
// ============================================================================
export const PROMPT_TEMPLATES: PromptTemplateMeta[] = [
  {
    key: 'scout',
    name: '① 总导演 · 细读与统筹',
    description: '逐张细读产品图、提炼套系风格、产出统筹简报（叙事线/美术宪法/卖点覆盖/逐图位任务）。第一轮理解调用。',
    vars: ['productImageCount', 'productTotal', 'slotIdNote', 'styleModeHint', 'slotsConstraint', 'productName', 'sku', 'sellingLines', 'logoNote'],
    defaultText: SCOUT_PROMPT,
  },
  {
    key: 'sceneDna',
    name: '② 场景 DNA · 背景风格提取',
    description: '解析背景氛围参考图，提取风格/材质/光影/色彩 DNA，输出 scenePrompt 与负面清单。与总导演并行调用。',
    vars: ['productName'],
    defaultText: SCENE_DNA_PROMPT,
  },
  {
    key: 'planner',
    name: '③ 策划师 · 逐图位画面策划',
    description: '消费统筹简报，产出逐图位画面策划与 title/copy 文案。第二轮理解调用。',
    vars: ['mainCount', 'detailCount', 'plannerSlotRules', 'productTotal', 'upstreamIntel', 'productName', 'sku', 'sellingLines'],
    defaultText: PLANNER_PROMPT,
  },
  {
    key: 'copywriter',
    name: '④ 文案专家 · 标题补全',
    description: '策划漏给或产出占位标题时，批量补全画面英文文案（title/copy）。仅兜底触发。',
    vars: ['productName', 'sellingPoints', 'jobList'],
    defaultText: COPYWRITER_PROMPT,
  },
  {
    key: 'textQa',
    name: '⑤ 质检 AI · 渲染文字检查',
    description: '检查成片画面中渲染文字的拼写/中文混入/乱码，不合格自动重采样一次。白底图跳过。',
    vars: [],
    defaultText: TEXT_QA_PROMPT,
  },
  {
    key: 'editorial',
    name: '⑥ 版式规范 · 美式 Editorial 标准',
    description: '生图提示词通用的版式骨架（瑞士网格/两档字号/低饱和暖中性/禁忌清单），随每张图注入。',
    vars: [],
    defaultText: EDITORIAL_PROMPT,
  },
];

/** 独立节点的输出约束，与原有统筹模板配合使用。 */
export const PRODUCT_NODE_INSTRUCTION = '本次只执行产品图片细读，不做总导演统筹。严格输出 JSON：{ "productUnderstanding": "详细产品理解", "productImages": [{ "index": 0, "angle": "角度", "details": "材质结构细节", "bestFor": "适合的图位" }] }。逐张描述，不要遗漏。';
export const LAYOUT_NODE_INSTRUCTION = '分析所附排版参考图，只提炼可复用的版式语言，不照搬内容。严格输出 JSON：{ "style": { "layoutNotes": "详细说明构图、网格、文字层级、留白与色彩布局" } }。';
