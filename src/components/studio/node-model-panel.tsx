'use client';

import { useEffect, useState } from 'react';
import { MODEL_NODES, NODE_MODELS_STORAGE, validateNodeModels, type NodeModels, type ModelProvider } from '@/lib/node-models';
import { getStoredImagenKey, getStoredKimiKey, storeImagenKey, storeKimiKey } from '@/lib/client-api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function NodeModelPanel({ disabled }: { disabled: boolean }) {
  const [models, setModels] = useState<NodeModels>({});
  const [kimiKey, setKimiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    try { setModels(validateNodeModels(JSON.parse(localStorage.getItem(NODE_MODELS_STORAGE) || '{}'))); }
    catch { setNotice('已保存的模型配置无法读取，请重新选择。'); }
    setKimiKey(getStoredKimiKey());
    setGeminiKey(getStoredImagenKey());
  }, []);
  const save = (next: NodeModels) => {
    setModels(next);
    try { localStorage.setItem(NODE_MODELS_STORAGE, JSON.stringify(next)); setNotice('已保存，下次运行对应节点时生效'); }
    catch { setNotice('浏览器无法保存配置，请允许本地存储后重试。'); }
  };
  return (
    <section className="mx-auto mb-6 max-w-5xl rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-base font-bold">每个节点，单独选择模型</h2><p className="mt-1 text-xs text-muted-foreground">按流程分别配置；未上传背景或排版参考图时，跳过相应分析节点。</p></div>
        <span className="rounded-full bg-studio-soft px-3 py-1 text-xs text-studio">10 个 AI 节点</span>
      </div>
      <fieldset disabled={disabled} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODEL_NODES.map((node, index) => {
          const value = models[node.id] || { provider: 'auto', model: '' };
          const presets = value.provider === 'builtin' && node.kind === 'text'
            ? [{ id: 'doubao-seed-2-0-pro-260215', label: '豆包 Seed 2.0 Pro' }, { id: 'doubao-seed-2-0-lite-260215', label: '豆包 Seed 2.0 Lite' }]
            : value.provider === 'gemini' ? [{ id: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' }] : [];
          return <div key={node.id} className="space-y-2 rounded-lg border p-3">
            <Label htmlFor={`model-${node.id}`} className="text-sm font-semibold"><span className="mr-2 font-mono text-studio">{String(index + 1).padStart(2, '0')}</span>{node.label}</Label>
            <p className="min-h-8 text-[11px] text-muted-foreground">{node.desc}</p>
            <Select disabled={disabled} value={value.provider} onValueChange={(provider) => save({ ...models, [node.id]: { provider: provider as ModelProvider, model: '' } })}>
              <SelectTrigger id={`model-${node.id}`} className="w-full" aria-label={`${node.label}模型`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动（沿用原配置）</SelectItem>
                <SelectItem value="builtin">{node.kind === 'text' ? '豆包 · 平台模型' : 'Seedream · 平台生图'}</SelectItem>
                {node.kind === 'text' ? <SelectItem value="kimi">Kimi · Moonshot</SelectItem> : <SelectItem value="gemini">Gemini · Google 生图</SelectItem>}
              </SelectContent>
            </Select>
            {value.provider !== 'auto' && <>
              {presets.length > 0 && <Select disabled={disabled} value={presets.some((p) => p.id === value.model) ? value.model : 'custom'} onValueChange={(model) => save({ ...models, [node.id]: { ...value, model: model === 'custom' ? '' : model } })}>
                <SelectTrigger className="w-full" aria-label={`${node.label}具体模型`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="custom">服务端默认 / 自定义 ID</SelectItem>{presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
              </Select>}
              <Input aria-label={`${node.label}模型 ID`} placeholder="模型 ID（留空使用服务端默认）" value={value.model} onChange={(e) => save({ ...models, [node.id]: { ...value, model: e.target.value } })} />
            </>}
          </div>;
        })}
      </fieldset>
      <details className="mt-4 rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">模型连接设置</summary>
        <p className="mt-2 text-xs text-muted-foreground">豆包与 Seedream 需要扣子平台凭证；本地运行不会自动获得平台权限。Kimi 与 Gemini 可填写自己的 Key，或使用服务端已配置的 Key。下方 Key 保存在当前浏览器。</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor="node-kimi-key">Kimi API Key</Label><Input id="node-kimi-key" type="password" autoComplete="off" disabled={disabled} value={kimiKey} onChange={(e) => { setKimiKey(e.target.value); storeKimiKey(e.target.value); }} /></div>
          <div><Label htmlFor="node-gemini-key">Gemini API Key</Label><Input id="node-gemini-key" type="password" autoComplete="off" disabled={disabled} value={geminiKey} onChange={(e) => { setGeminiKey(e.target.value); storeImagenKey(e.target.value); }} /></div>
        </div>
      </details>
      <p className="mt-3 text-xs text-muted-foreground" role="status">{notice || '选择会自动保存在当前浏览器。指定模型失败时会报错；自动模式沿用原来的备用模型逻辑。'} · 尺寸调整与成片锐化由本地图片处理完成。</p>
    </section>
  );
}
