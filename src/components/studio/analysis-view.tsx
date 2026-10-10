'use client';

import type { ChangeEvent } from 'react';
import { Camera, Check, CircleAlert, Clapperboard, ImageIcon, Palette, RotateCcw, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  MAIN_KIND_LABELS,
  type AnalysisResult,
  type JobKind,
  type MainKind,
  type PlanJob,
  type SceneDna,
  type UploadedAsset,
} from '@/lib/studio-types';
import { cn } from '@/lib/utils';

interface AnalysisViewProps {
  analysis: AnalysisResult;
  jobs: PlanJob[];
  productImages: UploadedAsset[];
  busy: boolean;
  onJobsChange: (jobs: PlanJob[]) => void;
  onConfirm: () => void;
  onReplan: () => void;
}

function JobRow({
  job,
  productImages,
  sceneDna,
  onPatch,
}: {
  job: PlanJob;
  productImages: UploadedAsset[];
  sceneDna?: SceneDna;
  onPatch: (patch: Partial<PlanJob>) => void;
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 transition-colors duration-200',
        job.enabled
          ? 'border-border bg-card'
          : 'border-border/60 bg-muted/40 opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
          {job.label}
        </span>
        {job.slot === 'main' && (
          <Select
            value={job.kind}
            onValueChange={(v) => onPatch({ kind: v as JobKind })}
          >
            <SelectTrigger size="sm" className="w-[112px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MAIN_KIND_LABELS) as MainKind[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {MAIN_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          参与生成
          <Switch
            checked={job.enabled}
            onCheckedChange={(v) => onPatch({ enabled: v })}
          />
        </label>
      </div>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">画面标题 / 卖点（英文）</p>
          <Input
            value={job.title}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onPatch({ title: e.target.value })
            }
            placeholder="画面主标题（渲染进画面）"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">辅助文案 / 标注（英文）</p>
          <Input
            value={job.copy}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onPatch({ copy: e.target.value })
            }
            placeholder="辅助短句或尺寸标注内容"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_170px]">
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">画面策划</p>
          <Textarea
            value={job.concept}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              onPatch({ concept: e.target.value })
            }
            rows={2}
            className="min-h-[52px] text-xs leading-relaxed"
          />
          {sceneDna && job.kind !== 'white' && job.kind !== 'size' && (
            <div className="space-y-0.5 rounded border border-studio/25 bg-studio-soft/30 px-2 py-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
              <p>
                <span className="font-semibold text-studio">场景纪律已注入</span>
                {' · '}光影 {sceneDna.lighting.source}·{sceneDna.lighting.colorTemp}
                {' · '}色彩 {sceneDna.colorSystem.primary}/{sceneDna.colorSystem.secondary}/{sceneDna.colorSystem.accent}
                {' · '}{sceneDna.composition.whitespace}
              </p>
              {sceneDna.negativePrompt && (
                <p className="truncate" title={sceneDna.negativePrompt}>
                  负面 {sceneDna.negativePrompt}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">绑定产品图</p>
          <Select
            value={String(job.productImageIndex)}
            onValueChange={(v) => onPatch({ productImageIndex: Number(v) })}
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {productImages.length === 0 && (
                <SelectItem value="0" className="text-xs">
                  无产品图（按文字策划）
                </SelectItem>
              )}
              {productImages.map((img, i) => (
                <SelectItem key={img.id} value={String(i)} className="text-xs">
                  {`图${i} · ${img.name.slice(0, 14)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export function AnalysisView({
  analysis,
  jobs,
  productImages,
  busy,
  onJobsChange,
  onConfirm,
  onReplan,
}: AnalysisViewProps) {
  const { style, productUnderstanding, productImages: aiImageReads } = analysis;
  const enabledCount = jobs.filter((j) => j.enabled).length;
  const mains = jobs.filter((j) => j.slot === 'main');
  const details = jobs.filter((j) => j.slot === 'detail');
  const imageReads =
    aiImageReads.length > 0
      ? aiImageReads
      : productImages.map((_, i) => ({
          index: i,
          angle: `产品图 ${i + 1}`,
          details: '（本次分析未提供逐张细读）',
          bestFor: '通用出图参考',
        }));

  const patchJob = (id: string, patch: Partial<PlanJob>) =>
    onJobsChange(jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      {/* 场景 DNA（背景风格提取 AI 产出） */}
      {style.sceneDna && (
        <div className="rounded-lg border border-studio/30 bg-studio-soft/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Camera className="size-4 text-studio" />
              <p className="text-[13px] font-bold">场景 DNA · 背景风格提取</p>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">{style.sceneDna.style}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{style.sceneDna.scenePrompt}</p>
          <div className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] text-foreground/80 sm:grid-cols-2">
            <p>光影纪律：{style.sceneDna.lighting.source} · {style.sceneDna.lighting.colorTemp}</p>
            <p>色彩体系：{style.sceneDna.colorSystem.primary} / {style.sceneDna.colorSystem.secondary} / {style.sceneDna.colorSystem.accent}</p>
            <p>硬装材质：{style.sceneDna.hardMaterials.floor} · {style.sceneDna.hardMaterials.wall}</p>
            <p>软装陈设：{style.sceneDna.softMaterials.fabrics} · {style.sceneDna.softMaterials.decor}</p>
            <p>构图留白：{style.sceneDna.composition.productZone}</p>
            <p>适配检查：{style.sceneDna.fitCheck}</p>
          </div>
          {style.sceneDna.negativePrompt && (
            <p className="mt-2.5 rounded-md bg-background/70 px-2.5 py-1.5 text-[11px] leading-relaxed text-studio">
              负面清单：{style.sceneDna.negativePrompt}
            </p>
          )}
        </div>
      )}
      {/* 风格解析结果 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Check className="size-4 text-studio-success" />
            <p className="text-[13px] font-bold">产品理解</p>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">
            {productUnderstanding}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {style.styleKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Palette className="size-4 text-studio" />
            <p className="text-[13px] font-bold">氛围与色彩</p>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">氛围：</span>
            {style.atmosphere}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">版式：</span>
            {style.layoutNotes}
          </p>
          {style.colorPalette.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {style.colorPalette.map((c) => (
                <div key={c.hex} className="flex items-center gap-1.5">
                  <span
                    className="size-4 rounded-full border border-black/10"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {c.name}
                    <span className="ml-1 font-mono text-[10px]">{c.hex}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 产品图逐张细读 */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-studio" />
          <p className="text-[13px] font-bold">产品图逐张细读</p>
          <span className="text-[11px] text-muted-foreground">
            AI 已逐张分析角度、材质与适用场景
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {imageReads.map((img) => {
            const asset = productImages[img.index];
            return (
              <div
                key={img.index}
                className="overflow-hidden rounded-md border bg-background"
              >
                {asset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={`产品图 ${img.index + 1}`}
                    className="h-28 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-muted/40 text-[11px] text-muted-foreground">
                    图 {img.index}
                  </div>
                )}
                <div className="space-y-1.5 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] tabular-nums">
                      图 {img.index}
                    </span>
                    <span className="truncate text-[11px] font-semibold text-foreground">
                      {img.angle}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {img.details}
                  </p>
                  <p className="text-[11px] leading-relaxed text-studio">
                    <span className="font-semibold">适合：</span>
                    {img.bestFor}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI 统筹（总导演简报） */}
      {(() => {
        const campaign = analysis.campaign;
        if (!campaign) return null;
        return (
          <div className="rounded-lg border border-studio/25 bg-studio-soft/60 p-4">
            <div className="flex items-center gap-2">
              <Clapperboard className="size-4 text-studio" />
              <p className="text-[13px] font-bold">AI 统筹 · 总导演简报</p>
              <span className="text-[11px] text-muted-foreground">
                全链路的创作宪法：叙事线与美术约束将注入每一张图的生成
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border bg-card/80 p-3">
                <p className="text-[11px] font-semibold text-studio">套系叙事线</p>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">
                  {campaign.storyline}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-studio">套系美术宪法</p>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">
                  {campaign.artDirection}
                </p>
                <p className="mt-2 text-[11px] font-semibold text-studio">卖点覆盖审查</p>
                <p className="mt-1 text-[12px] leading-relaxed text-foreground/90">
                  {campaign.coverage}
                </p>
              </div>
              <div className="rounded-md border bg-card/80 p-3">
                <p className="text-[11px] font-semibold text-studio">逐图位任务分配</p>
                <div className="mt-1.5 space-y-2">
                  {campaign.slots.map((slot) => {
                    const job = jobs.find((j) => j.id === slot.id);
                    return (
                      <div key={slot.id} className="rounded border bg-background px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px] tabular-nums">
                            {slot.id}
                          </span>
                          <span className="truncate text-[11px] font-semibold text-foreground">
                            {job?.label ?? slot.id}
                          </span>
                          <span className="ml-auto truncate text-[10.5px] text-muted-foreground">
                            {slot.role}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-semibold text-foreground/80">看：</span>
                          {slot.focus}
                          <span className="mx-1 text-border">|</span>
                          <span className="font-semibold text-foreground/80">要点：</span>
                          {slot.notes}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 出图计划 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold">出图计划（人工可控，可直接编辑）</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              共 {jobs.length} 项 · 已选 {enabledCount} 项 ·
              类型、标题文案、绑定产品图均可修改 · 交付编号 SKU_N 与本清单一一对应
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onJobsChange(jobs.map((j) => ({ ...j, enabled: true })))}
              disabled={busy || enabledCount === jobs.length}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              全部参与
            </button>
            <button
              type="button"
              onClick={() => onJobsChange(jobs.map((j) => ({ ...j, enabled: false })))}
              disabled={busy || enabledCount === 0}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            >
              全部暂停
            </button>
            <Button
              variant="outline"
              size="sm"
              onClick={onReplan}
              disabled={busy}
            >
              <RotateCcw className="size-3.5" />
              重新策划
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {mains.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              productImages={productImages}
              sceneDna={style.sceneDna}
              onPatch={(patch) => patchJob(job.id, patch)}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            详情页 · 按卖点逐张出图
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-2">
          {details.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              productImages={productImages}
              sceneDna={style.sceneDna}
              onPatch={(patch) => patchJob(job.id, patch)}
            />
          ))}
        </div>

        {productImages.length > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleAlert className="size-3.5" />
            绑定产品图仅作为构图与形态参考；成片会模仿参考图的风格味道而不是抄袭
          </p>
        )}
      </div>

      {/* 底部操作条 */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur md:left-[400px]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-6 py-3">
          <p className="text-[12px] text-muted-foreground">
            将生成 <span className="font-bold text-foreground">{enabledCount}</span> 张
            （主图 {mains.filter((j) => j.enabled).length} + 详情页{' '}
            {details.filter((j) => j.enabled).length}）
          </p>
          <Button onClick={onConfirm} disabled={busy || enabledCount === 0}>
            <Wand2 className="size-4" />
            确认计划，批量出图
          </Button>
        </div>
      </div>
    </div>
  );
}
