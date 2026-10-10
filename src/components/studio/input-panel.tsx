'use client';

import { type ChangeEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { NotebookPen, Play, Settings2, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Uploader } from './uploader';
import {
  parseSellingPoints,
  parseSlotSpecs,
  STYLE_MODE_LABELS,
  type InputState,
  type StudioSettings,
  type StyleMode,
} from '@/lib/studio-types';

/** 图位示例：用户逐张指定每张图的类型与内容（AI 严格按此规划，不再自行分配） */
const EXAMPLE_POINTS = `图1 白底图
图2 场景图 大空间好放置
图3 细节图 绒面质感 亲肤柔软
图4 细节图 钢筋支架承重1000lbs
图5 模特图
详情页图1 模特图 摆放效果
详情页图2 细节图 加厚底板回弹支撑
详情页图3 场景图 多场景适用`;

interface InputPanelProps {
  value: InputState;
  onChange: (patch: Partial<InputState>) => void;
  onAnalyze: () => void;
  busy: boolean;
  onDemo: () => void;
  demoBusy: boolean;
  /** 测试版系统关闭后禁用全部输入 */
  disabled?: boolean;
  /** 测试版剩余生成额度 */
  quotaLeft?: { generated: number; max: number } | null;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

function SettingRow({
  title,
  desc,
  checked,
  onCheckedChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function InputPanel({
  value,
  onChange,
  onAnalyze,
  busy,
  onDemo,
  demoBusy,
  disabled = false,
  quotaLeft = null,
}: InputPanelProps) {
  const points = parseSellingPoints(value.sellingPointsText);
  const slotSpecs = parseSlotSpecs(value.sellingPointsText);
  const patchSettings = (patch: Partial<StudioSettings>) =>
    onChange({ settings: { ...value.settings, ...patch } });
  const ready =
    value.sku.trim().length > 0 &&
    value.productName.trim().length > 0 &&
    value.productImages.length > 0;

  return (
    <div className="flex h-full flex-col">
      {disabled && (
        <div className="border-b bg-destructive/5 px-5 py-2.5">
          <p className="text-[11.5px] font-medium leading-snug text-destructive">
            测试版权额已用尽，系统已自动关闭
          </p>
        </div>
      )}
      <fieldset
        disabled={disabled}
        className="m-0 flex min-w-0 flex-1 flex-col border-0 p-0"
      >
      <div className="thin-scrollbar min-w-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <SectionTitle>基础信息</SectionTitle>
          <div className="space-y-1.5">
            <Label htmlFor="sku" className="text-[13px] font-semibold">
              产品 SKU<span className="ml-0.5 text-studio">*</span>
            </Label>
            <Input
              id="sku"
              value={value.sku}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onChange({ sku: e.target.value })
              }
              placeholder="如 W636P535053"
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              成片将按 <span className="font-mono">{value.sku.trim() || 'SKU'}_1</span> 模式命名
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[13px] font-semibold">
              产品名称<span className="ml-0.5 text-studio">*</span>
            </Label>
            <Input
              id="name"
              value={value.productName}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                onChange({ productName: e.target.value })
              }
              placeholder="如 折叠沙发床"
            />
          </div>
          <Uploader
            label="品牌 Logo（非必填）"
            assets={value.logo ? [value.logo] : []}
            onChange={(assets) => onChange({ logo: assets[0] ?? null })}
            hint="用于属性海报版面，可不上传"
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <SectionTitle>素材上传</SectionTitle>
          <Uploader
            label="产品图片"
            requiredMark
            multiple
            assets={value.productImages}
            onChange={(assets) => onChange({ productImages: assets })}
            hint="建议 3~8 张：整体 + 局部 + 多角度，AI 会为每张画面挑选最合适的角度"
          />
          <Uploader
            label="背景氛围参考图"
            multiple
            assets={value.bgRefs}
            onChange={(assets) => onChange({ bgRefs: assets })}
            hint="建议 2~4 张，AI 模仿氛围味道而不是照搬"
          />
          <Uploader
            label="排版海报参考图"
            multiple
            assets={value.layoutRefs}
            onChange={(assets) => onChange({ layoutRefs: assets })}
            hint="建议 2~4 张，决定属性图与详情页的版式语言"
          />
        </section>

        <Separator />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>图位与卖点清单</SectionTitle>
            <button
              type="button"
              onClick={() => onChange({ sellingPointsText: EXAMPLE_POINTS })}
              className="inline-flex items-center gap-1 text-[11px] text-studio hover:underline"
            >
              <NotebookPen className="size-3" />
              填入示例
            </button>
          </div>
          <Textarea
            value={value.sellingPointsText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
              onChange({ sellingPointsText: e.target.value })
            }
            rows={7}
            placeholder={'逐张指定每张图的类型与内容（推荐），类型：白底图/尺寸图/场景图/细节图/模特图：\n图1 白底图\n图2 场景图 大空间好放置\n详情页图1 模特图\n详情页图2 细节图 绒面质感\n\n也可只写卖点（AI 自动规划图位）：\n图1: 尺寸+承重+安装'}
            className="text-[13px] leading-relaxed"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {slotSpecs.specs.length > 0 ? (
              <>
                已识别 <span className="font-semibold text-foreground">{slotSpecs.specs.length}</span>{' '}
                个图位（主图 {slotSpecs.specs.filter((s) => s.slot === 'main').length} + 详情页{' '}
                {slotSpecs.specs.filter((s) => s.slot === 'detail').length}）·
                AI 将严格按图位类型逐张出图，编号与你的清单一一对应
              </>
            ) : (
              <>
                已识别 <span className="font-semibold text-foreground">{points.length}</span> 条卖点 ·
                一行内多个卖点自动拆分 · 未指定图位时由 AI 自动规划每张图的类型
              </>
            )}
            <br />
            中文内容会自动翻译成地道美式英文渲染进图（面向美国/英国客户）
          </p>
        </section>

        <Separator />

        <section className="space-y-3.5">
          <SectionTitle>出图设置</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">主图数量</Label>
              <Select
                value={String(value.settings.mainCount)}
                onValueChange={(v) => patchSettings({ mainCount: Number(v) })}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 6, 7].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} 张（2000×2000）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">详情页数量</Label>
              <Select
                value={String(value.settings.detailCount)}
                onValueChange={(v) => patchSettings({ detailCount: Number(v) })}
              >
                <SelectTrigger className="w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 4, 5, 6, 7].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} 张（1940×1200）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">画面风格</Label>
            <Select
              value={value.settings.styleMode}
              onValueChange={(v) => patchSettings({ styleMode: v as StyleMode })}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STYLE_MODE_LABELS) as StyleMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {STYLE_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              主图与详情页整体画面基调；「AI 自动」按产品与参考图氛围决定
            </p>
          </div>
          <SettingRow
            title="精修产品图"
            desc="务必把产品质感与纹理协调精修：真实材质、自然光泽，消除建模感；产品怕修坏时可关闭"
            checked={value.settings.refine}
            onCheckedChange={(v) => patchSettings({ refine: v })}
          />
          <SettingRow
            title="高清增强"
            desc="成片二次锐化增强，并精确输出 2000×2000 / 1940×1200 规范尺寸"
            checked={value.settings.hdEnhance}
            onCheckedChange={(v) => patchSettings({ hdEnhance: v })}
          />
          <SettingRow
            title="生成尺寸图"
            desc="一般已有尺寸图可不开；需要重做尺寸图时开启"
            checked={value.settings.includeSizeChart}
            onCheckedChange={(v) => patchSettings({ includeSizeChart: v })}
          />
          <div className="rounded-md border border-border bg-studio-soft px-3 py-2.5">
            <p className="text-[11.5px] font-semibold text-foreground/90">算力与费用（公开）</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
              各环节使用右侧节点中选择的模型。调用费用按对应服务商账户计费；平台模型需要有效的平台凭证。测试版成片额度为 50 张。
            </p>
          </div>
        </section>

        <Separator />

        <section className="space-y-2">
          <SectionTitle>流程配置</SectionTitle>
          <Link
            href="/prompts"
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-studio/50 hover:bg-studio-soft"
          >
            <span>
              <span className="block text-[13px] font-semibold">指令工作台</span>
              <span className="block text-[11px] leading-relaxed text-muted-foreground">
                在线编辑流水线各环节 AI 指令（细读/统筹/策划/文案/质检/版式），保存后下次调用即生效
              </span>
            </span>
            <Settings2 className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      </div>

      <div className="border-t bg-card/80 p-4 backdrop-blur">
        <Button
          className="w-full"
          size="lg"
          disabled={!ready || busy || demoBusy || disabled}
          onClick={onAnalyze}
        >
          {busy ? (
            <Sparkles className="size-4" />
          ) : (
            <Wand2 className="size-4" />
          )}
          {busy ? 'AI 解析中…' : '开始 AI 解析与策划'}
        </Button>
        <Button
          className="mt-2 w-full"
          size="lg"
          variant="outline"
          disabled={busy || demoBusy || disabled}
          onClick={onDemo}
        >
          {demoBusy ? <Sparkles className="size-4 animate-pulse" /> : <Play className="size-4" />}
          {demoBusy ? '演示运行中，请稍候…' : '一键演示：自动填充并跑通全流程'}
        </Button>
        {!ready && !disabled && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            需填写 SKU、产品名称并至少上传 1 张产品图
          </p>
        )}
        {quotaLeft && !disabled && (
          <p className="mt-2 text-center text-[11px] tabular-nums text-muted-foreground">
            测试版额度：已生成{' '}
            <span className="font-semibold text-foreground">{quotaLeft.generated}</span>
            {' / '}
            {quotaLeft.max} 张，耗尽后系统自动关闭
          </p>
        )}
      </div>
      </fieldset>
    </div>
  );
}
