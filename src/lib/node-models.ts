export type ModelProvider = 'auto' | 'builtin' | 'kimi' | 'gemini';
export interface NodeModel { provider: ModelProvider; model: string }
export const MODEL_NODES = [
  { id: 'product', label: '产品图片分析', kind: 'text', desc: '识别产品外观、材质和各张图片的角度' },
  { id: 'background', label: '背景参考分析', kind: 'text', desc: '读取参考图的场景、光线与氛围' },
  { id: 'layout', label: '排版参考分析', kind: 'text', desc: '提取海报的版式与文字层级' },
  { id: 'director', label: '总导演统筹', kind: 'text', desc: '汇总素材分析，安排整套图的任务' },
  { id: 'planner', label: '逐图策划', kind: 'text', desc: '规划每张图片的内容与构图' },
  { id: 'copywriter', label: '文案补全', kind: 'text', desc: '补全缺失的英文标题与卖点文案' },
  { id: 'productImage', label: '产品图片生成', kind: 'image', desc: '白底、尺寸、海报、详情图及双产品合成底图' },
  { id: 'backgroundImage', label: '背景与场景生成', kind: 'image', desc: '场景图、模特图及双产品合成的背景环节' },
  { id: 'enhance', label: '素材画质优化', kind: 'image', desc: '点击素材上的 AI 优化时使用' },
  { id: 'textQa', label: '成片文字质检', kind: 'text', desc: '检查成片中的英文拼写与乱码' },
] as const;
export type ModelNodeId = typeof MODEL_NODES[number]['id'];
export type NodeModels = Partial<Record<ModelNodeId, NodeModel>>;
export const NODE_MODELS_STORAGE = 'studio_node_models_v1';

export function validateNodeModel(value: unknown, kind: 'text' | 'image'): NodeModel {
  if (value === undefined) return { provider: 'auto', model: '' };
  if (!value || typeof value !== 'object') throw new Error('节点模型配置无效');
  const { provider, model } = value as Record<string, unknown>;
  const allowed = kind === 'text' ? ['auto', 'builtin', 'kimi'] : ['auto', 'builtin', 'gemini'];
  if (typeof provider !== 'string' || !allowed.includes(provider) || typeof model !== 'string' || model.length > 150 || (model && !/^[a-zA-Z0-9._:/-]+$/.test(model))) {
    throw new Error('节点模型不匹配或模型 ID 无效');
  }
  return { provider: provider as ModelProvider, model: model.trim() };
}

export function validateNodeModels(value: unknown): NodeModels {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('节点模型配置无效');
  const result: NodeModels = {};
  for (const node of MODEL_NODES) {
    result[node.id] = validateNodeModel((value as Record<string, unknown>)[node.id], node.kind);
  }
  return result;
}
