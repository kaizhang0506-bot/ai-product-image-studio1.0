/**
 * 生图提示词构建：按出图计划中每个任务拼装专业电商摄影提示词
 */
import { getPromptText } from './prompt-registry';
import type { GenerateRequestBody, PlanJob, StyleMode } from './studio-types';

/** 风格预设注入的整体画面基调（auto 时不额外干预，跟随 AI 策划与参考图氛围） */
export const STYLE_MODE_PROMPTS: Record<StyleMode, string> = {
  auto: '',
  studio:
    '画面风格统一为高级影棚产品摄影：纯色或渐变灰无缝背景，主光加轮廓光的专业布光，质感锐利、光比干净，商业静物摄影标准。',
  lifestyle:
    '画面风格统一为真实生活方式摄影：自然窗光，温馨居家氛围，浅景深，画面有生活气息与故事感，避免摆拍痕迹。',
  poster:
    '画面风格统一为简约商业海报设计：大色块背景，强排版构成，留白充足，平面设计感强，色彩克制高级。',
};

/**
 * 美式编辑设计（Editorial）版式标准（/prompts 指令工作台可在线编辑，key: editorial）。
 * 设计术语用英文表述——生图模型对 grid / negative space / tracking 等版式术语理解更精准；
 * 画面文字由 textRule 强制为美式英文（面向美国/英国市场）。
 * 每次构建提示词时实时读取（支持后台覆盖热生效）。
 */
export function getEditorialStandard(): string {
  return getPromptText('editorial');
}

function paletteText(palette: Array<{ hex: string; name: string }>): string {
  if (palette.length === 0) return '与产品气质协调的高级配色';
  return palette.map((p) => `${p.name}(${p.hex})`).join('、');
}

/**
 * 套系上下文块：每个画面的生图提示词都继承同一份"世界观"，
 * 保证整套成片像同一团队、同一组光线、同一套色板拍出来的连贯系列。
 */
function buildSeriesContext(input: GenerateRequestBody, job: PlanJob): string[] {
  const { productUnderstanding, style, campaign } = input;
  const lines: string[] = [];
  const understanding = productUnderstanding || '以参考图中的产品为准';
  // 防复刻纪律（最高优先级）：所有图位共享——产品只保本体，画面必须全新
  lines.push(
    '原创性纪律（最高优先级，必须遵守）：产品参考图只用于锁定产品本体的形态、材质、颜色与细节特征，严禁复刻产品原图的构图、背景、道具、光线、角度与裁切方式——成片与产品原图放在一起对比时，必须一眼看出是两个完全不同的画面；氛围/排版参考图只借鉴味道与版式骨架，严禁复刻其画面内容与配色。每张图都是重新构思的全新画面：只有产品本身与原图一致，其余一切元素都必须与参考素材明显不同。',
  );
  lines.push(`产品理解：${productNameLine(input)}。${understanding}`);
  const mood = style.atmosphere || '干净明亮的商业摄影氛围，主体突出';
  const keywords = style.styleKeywords.join(' / ');
  const palette = paletteText(style.colorPalette);
  lines.push(`套系风格（所有画面必须保持一致）：氛围基调「${mood}」；风格关键词 ${keywords || '高级 / 简洁'}；色彩体系 ${palette}。`);
  // 统筹 AI（总导演）的美术宪法与该图位的叙事任务：衔接策划→生图的统一指挥链
  if (campaign) {
    if (campaign.artDirection) {
      lines.push(`总导演美术宪法（本套图所有画面统一遵守）：${campaign.artDirection}。`);
    }
    const slotPlan = campaign.slots.find((s) => s.id === job.id);
    if (slotPlan) {
      lines.push(
        `本图统筹任务：叙事角色「${slotPlan.role}」；视觉重心「${slotPlan.focus}」；执行要点「${slotPlan.notes}」。画面必须落实以上要求。`,
      );
    }
    if (campaign.storyline && (job.kind === 'scene' || job.kind === 'model' || job.kind === 'detail')) {
      lines.push(`套系叙事线（本图在其中的位置需呼应）：${campaign.storyline}。`);
    }
  }
  // 绑定产品图的细读结果：让生图模型明确知道"参考的是哪张图、它的视角与细节是什么"
  const read = input.productImageReads?.find((r) => r.index === job.productImageIndex);
  if (read) {
    lines.push(
      `绑定产品图（编号 ${read.index}）：景别「${read.angle}」；画面细节「${read.details}」。生成时严格沿用该图的产品形态、材质与颜色特征。`,
    );
  }
  if (style.layoutNotes) {
    lines.push(`版式骨架（本套图统一遵循）：${style.layoutNotes}。`);
  }
  // 场景 DNA（背景风格提取 AI 产出）：场景/模特/细节图等带背景的画面统一消费
  const dna = style.sceneDna;
  if (dna && job.kind !== 'white' && job.kind !== 'size') {
    lines.push(
      `场景 DNA（全新搭建，仅复用质感语言）：${dna.scenePrompt}`,
      `场景光影纪律：${dna.lighting.source}；色温 ${dna.lighting.colorTemp}；${dna.lighting.shadow}。场景光线方向必须与产品原图光线方向对齐，禁止"双主光"；接触阴影自然真实。`,
      `场景色彩纪律：${dna.colorSystem.primary} 60% / ${dna.colorSystem.secondary} 30% / ${dna.colorSystem.accent} 10%；${dna.colorSystem.productAnchor}。背景元素不得侵入产品外轮廓 10%。`,
      `场景负面清单（必须规避）：${dna.negativePrompt || '参考图文字、logo、水印、人物、杂乱物件、照搬参考图构图与透视'}`,
    );
    if (dna.composition.productZone) {
      lines.push(`构图留白：${dna.composition.productZone}。`);
    }
  }
  return lines;
}

function productNameLine(input: GenerateRequestBody): string {
  return `产品「${input.productName}」`;
}

export function buildJobPrompt(
  input: GenerateRequestBody,
  job: PlanJob,
): string {
  const { style, settings } = input;
  const palette = paletteText(style.colorPalette);
  const refineLine = settings.refine
    ? '精修要求：务必把产品的质感与纹理协调精修——真实材质细节、自然光泽过渡、边缘干净利落，严禁塑料感与廉价建模感。'
    : '质感要求：忠实还原参考产品图的原始材质与光影，不做过度修饰。';
  const noWatermark = '画面中不得出现任何水印、二维码或无意义乱码文字。';
  const textRule =
    'Text rule: ALL text rendered in the image must be in natural American English, matching the quoted copy word-for-word with LETTER-PERFECT spelling; use a modern sans-serif font (Helvetica / Inter style), precise kerning, crisp and legible; render the headline in ALL CAPS and keep total text minimal (only the quoted words, nothing else); strictly NO Chinese characters, NO pinyin, NO gibberish, NO misspelled words, NO other languages.';
  const refTextRule =
    'Originality note (STRICT): the layout reference image is ONLY for borrowing grid structure and visual mood — do NOT recreate its composition, colors, props or content. The product photo is product-appearance reference ONLY: keep the product itself identical, but compose a completely NEW picture with a different background, different arrangement and different crop from the original photo. NEVER reproduce any reference image as-is. All on-image text must be the English copy given below.';
  const seriesContext = buildSeriesContext(input, job);
  const styleModeLine = STYLE_MODE_PROMPTS[settings.styleMode] ?? '';

  switch (job.kind) {
    case 'white':
      return [
        `电商主图（白底图），正方形 1:1 构图。`,
        ...seriesContext,
        '要求：纯白色无缝背景，产品居中占画面约 80%，单一产品主体，商业级产品摄影，柔和均匀的影棚布光，轻微自然投影，产品轮廓清晰锐利。',
        '严格禁止出现任何文字、logo、标注或装饰元素。',
        refineLine,
        noWatermark,
      ].join('\n');
    case 'size':
      return [
        `电商主图（尺寸标注图），正方形 1:1 构图。`,
        ...seriesContext,
        `要求：产品居中，极简工程制图风格，细线引出标注线与箭头，标注内容为"${job.copy || job.title}"（英文，数字用阿拉伯数字，长度/重量单位使用英寸 inch / 磅 lb，符合美国市场习惯），浅暖灰纯净底色，画面顶部小标题"${job.title}"（英文）。`,
        '标注文字务必清晰可读，字体现代简洁，排版对齐严谨。',
        textRule,
        noWatermark,
      ].join('\n');
    case 'scene':
      return [
        `电商主图（场景变更图），正方形 1:1 构图。`,
        ...seriesContext,
        `画面策划：${job.concept || '将产品置入与套系氛围一致的场景环境，产品保持视觉中心且清晰，场景自然不抢主体'}。`,
        styleModeLine,
        `标题排版：主标题"${job.title || 'PREMIUM QUALITY'}"（英文）置于画面上方或侧边的留白处，字号克制、紧贴网格对齐，与场景色彩呼应，保持呼吸感。`,
        `版式遵循以下编辑设计标准：${getEditorialStandard()}`,
        textRule,
        refineLine,
        noWatermark,
      ].join('\n');
    case 'attr':
      return [
        `电商主图（属性海报图），正方形 1:1 构图，杂志级版式设计。`,
        ...seriesContext,
        `画面策划：${job.concept || '产品或产品局部特写占画面约 45%~55%（置于一侧，材质纹理清晰），另一侧为干净的文字排版区'}。`,
        `文字区（自上而下）：超大粗体英文主标题"${job.title}"，一条细线分隔，一行细体英文辅助句"${job.copy}"，底部可放一个极简线性图标或一处小色块；强调色 ${palette}。若参考图中包含品牌 logo，则将其小尺寸置于版面右上角。`,
        styleModeLine,
        getEditorialStandard(),
        refTextRule,
        textRule,
        refineLine,
        noWatermark,
      ].join('\n');
    case 'model':
      return [
        `电商主图（模特场景图），正方形 1:1 构图。`,
        ...seriesContext,
        `画面策划：${job.concept || '一位真实感模特正在自然地使用该产品，自然光影，生活方式摄影质感，模特与产品互动真实可信'}。`,
        styleModeLine,
        `标题排版：文案"${job.title || 'LIFESTYLE'}"（英文）置于画面留白处，字号克制、与网格对齐，不遮挡主体。`,
        `版式遵循以下编辑设计标准：${getEditorialStandard()}`,
        textRule,
        refineLine,
        noWatermark,
      ].join('\n');
    case 'combine':
      return buildCombineMergePrompt(input, job);
    case 'detail':
    default:
      return [
        `商品详情页设计图，横版 1940:1200 宽屏构图，杂志级版式设计。`,
        ...seriesContext,
        `画面策划：${job.concept || '围绕该卖点组织产品特写与场景元素'}。本页重点展示卖点：主标题"${job.title}"，辅助文案"${job.copy}"（均为英文文案，原样渲染进画面）。`,
        `构图建议：产品占画面约 60% 并保持清晰锐利，文字区不超过 40%；超大粗体英文主标题落在上三分之一的网格线上，辅助句紧随其下，行距舒展，留白充足；色彩体系 ${palette}。`,
        styleModeLine,
        getEditorialStandard(),
        refTextRule,
        textRule,
        refineLine,
        noWatermark,
      ].join('\n');
  }
}

/** 为任务挑选参考图：产品图（形准）+ 氛围/排版参考 + 可选 logo */
export function buildJobRefs(input: GenerateRequestBody, job: PlanJob): string[] {
  const refs: string[] = [];
  // 合成图（第一步）：需要两张不同的产品图作为合并对象
  if (job.kind === 'combine') {
    for (const url of input.productImages) {
      if (refs.length >= 2) break;
      if (!refs.includes(url)) refs.push(url);
    }
    return refs;
  }
  const productImage =
    input.productImages[job.productImageIndex] ?? input.productImages[0];
  if (productImage) refs.push(productImage);
  if (job.kind === 'scene' || job.kind === 'model') {
    if (input.bgRefs[0]) refs.push(input.bgRefs[0]);
  }
  if (job.kind === 'attr' || job.kind === 'detail') {
    if (input.layoutRefs[0]) refs.push(input.layoutRefs[0]);
  }
  if (job.kind === 'attr' && input.logoUrl) refs.push(input.logoUrl);
  return refs.slice(0, 4);
}

/**
 * 合成图第二步 prompt：以第一步"产品合拢底图"为唯一主体参照，只生成场景背景。
 * 衔接关系：第一步输出的产品布局被严格锁定，第二步只负责环境（背景 DNA + 套系风格）。
 */
export function buildCombineScenePrompt(input: GenerateRequestBody, job: PlanJob): string {
  const { style, settings } = input;
  const mood = style.atmosphere || '干净明亮的商业摄影氛围';
  const keywords = style.styleKeywords.join(' / ');
  const palette = paletteText(style.colorPalette);
  const campaign = input.campaign;
  const slotPlan = campaign?.slots.find((s) => s.id === job.id);
  const sceneBrief = job.concept || '与套系氛围一致的实景使用环境';
  return [
    `电商主图（双产品合成场景图），正方形 1:1 构图。参考图即已完成的产品合拢底图——画面中的两款产品布局、比例、角度与外观必须 100% 保持不变，一个像素都不允许改动产品本体。`,
    input.productUnderstanding ? `产品背景：${input.productUnderstanding}。` : '',
    `本步骤唯一任务：为合拢后的产品生成真实自然的场景背景与环境光影——${sceneBrief}。`,
    `背景要求：氛围基调「${mood}」；风格关键词 ${keywords || '高级 / 简洁'}；色彩体系 ${palette}；产品与环境的接触面要有真实阴影、反射与比例关系，地面/台面材质清晰可信。`,
    campaign?.artDirection ? `总导演美术宪法（必须遵守）：${campaign.artDirection}。` : '',
    slotPlan ? `本图统筹任务：${slotPlan.role}；视觉重心「${slotPlan.focus}」；要点「${slotPlan.notes}」。` : '',
    `严禁：改变产品位置/角度/数量、增删产品部件、出现文字或水印、出现第三件产品。`,
    STYLE_MODE_PROMPTS[settings.styleMode] ?? '',
    '场景不得出现任何文字。',
  ].filter(Boolean).join('\n');
}

/** 合成图第一步 prompt：将两款产品自然合拢至同一画面（纯中性底，布局方案明确） */
function buildCombineMergePrompt(input: GenerateRequestBody, job: PlanJob): string {
  const seriesContext = buildSeriesContext(input, job);
  return [
    `产品摄影合成任务（第一步：双产品合拢），正方形 1:1 构图。`,
    ...seriesContext,
    `要求：将参考的两张产品图中的产品（产品A、产品B）自然合拢到同一个画面中，构成一组真实可信的双产品组合陈列。`,
    `合成规范：1）识别每张参考图中的产品类型、拍摄角度与光源方向，统一两者透视与光源（左上 45° 柔光为准）；2）两产品按主次关系摆放——主产品稍大居前，副产品稍小居后偏侧，间距自然不重叠、不悬空；3）两产品均与地面/台面产生一致的真实投影；4）产品本体外观、颜色、材质、logo 严格锁定不变，不得增删部件、不得变形。`,
    `输出：纯净浅中性灰无缝背景，无任何道具、文字、水印，仅双产品组合与自然投影；商业级产品摄影质感。`,
    `若两张参考图实为同一产品的不同角度，则保留信息量最大的一张，避免重复陈列。`,
    `画面中严禁出现任何文字。`,
  ].join('\n');
}
