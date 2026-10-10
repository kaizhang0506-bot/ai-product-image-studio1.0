'use client';

import { useCallback, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Images,
  Loader2,
  PackageCheck,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadAsset } from '@/lib/client-api';
import type { JobRuntime, PlanJob } from '@/lib/studio-types';
import { cn } from '@/lib/utils';

/** 算力费用公开：单张成品 = 生成（gemini-2.5-flash-image 约 $0.034）+ 画质增强（Imagen 约 $0.04） */
const COST_PER_IMAGE_USD = 0.074;

interface GenerationViewProps {
  jobs: PlanJob[];
  runtimes: Record<string, JobRuntime>;
  phaseMessage: string;
  summary: { total: number; succeeded: number; failed: number } | null;
  error: string;
  onRetryFailed: () => void;
  onReset: () => void;
}

function StatusBadge({ runtime }: { runtime: JobRuntime | undefined }) {
  if (!runtime) return null;
  switch (runtime.status) {
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-muted-foreground/50" />
          排队中
        </span>
      );
    case 'generating':
      return (
        <span className="studio-breathe inline-flex items-center gap-1 text-[11px] font-medium text-studio">
          <Loader2 className="size-3 animate-spin" />
          AI 生成中
        </span>
      );
    case 'enhancing':
      return (
        <span className="studio-breathe inline-flex items-center gap-1 text-[11px] font-medium text-studio">
          <Loader2 className="size-3 animate-spin" />
          高清增强中
        </span>
      );
    case 'done':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-studio-success">
          <CheckCircle2 className="size-3" />
          已交付
        </span>
      );
    case 'error':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
          <AlertTriangle className="size-3" />
          失败
        </span>
      );
    default:
      return null;
  }
}

/** 从文件名提取 SKU_N 连续编号（W636P535053_5.jpg → _5） */
function seqBadge(filename: string | undefined): string {
  if (!filename) return '';
  const m = filename.match(/_(\d+)\.jpe?g$/i);
  return m ? `_${m[1]}` : '';
}

interface JobCardProps {
  job: PlanJob;
  runtime: JobRuntime | undefined;
  onOpen?: () => void;
}

function JobCard({ job, runtime, onOpen }: JobCardProps) {
  const [downloading, setDownloading] = useState(false);
  const isDetail = job.slot === 'detail';
  const done = runtime?.status === 'done' && runtime.url;

  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!done || !runtime?.url || !runtime.filename) return;
    setDownloading(true);
    try {
      await downloadAsset(runtime.url, runtime.filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <figure
      className={cn(
        'group rounded-xl border bg-card p-2 transition-all duration-300',
        'shadow-[0_1px_2px_rgba(28,25,23,0.04)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-12px_rgba(28,25,23,0.18)]',
        done
          ? 'border-studio-success/40 hover:border-studio-success/60'
          : runtime?.status === 'error'
            ? 'border-destructive/50'
            : 'border-border',
        done && onOpen && 'cursor-zoom-in',
      )}
      onClick={done && onOpen ? onOpen : undefined}
    >
      {/* 画框：图区再包一层 hairline 内框 */}
      <div
        className={cn(
          'bg-checkerboard relative overflow-hidden rounded-md ring-1 ring-black/[0.06]',
          isDetail ? 'aspect-[1940/1200]' : 'aspect-square',
        )}
      >
        {done ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={runtime?.url}
              alt={job.label}
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
            {/* 底片编号角标 */}
            <span className="absolute left-2.5 top-2.5 rounded border border-border/80 bg-card/95 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground/70">
              {seqBadge(runtime?.filename) || job.label}
            </span>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-end bg-gradient-to-t from-black/30 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1 text-xs"
                disabled={downloading}
                onClick={(e) => void handleDownload(e)}
              >
                <Download className="size-3" />
                {downloading ? '下载中…' : '下载'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2">
            {runtime?.status === 'error' ? (
              <>
                <AlertTriangle className="size-5 text-destructive" />
                <p className="max-w-[85%] text-center text-[11px] leading-snug text-destructive">
                  {runtime.error || '生成失败'}
                </p>
              </>
            ) : (
              <>
                {runtime?.status === 'queued' ? (
                  <Images className="size-5 text-muted-foreground/50" />
                ) : (
                  <Loader2 className="size-5 animate-spin text-studio" />
                )}
                <span className="text-[11px] text-muted-foreground">
                  {runtime?.status === 'queued'
                    ? '排队等待'
                    : runtime?.status === 'enhancing'
                      ? '高清增强 / 精确尺寸输出'
                      : '正在按策划出图…'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* 美术馆标签条 */}
      <figcaption className="flex items-center justify-between gap-2 px-1.5 pb-0.5 pt-2.5">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold leading-tight">{job.label}</p>
          <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
            {(runtime?.filename ?? job.id).replace(/\.jpe?g$/i, '')}
            {runtime?.width ? ` · ${runtime.width}×${runtime.height}` : ''}
          </p>
        </div>
        <StatusBadge runtime={runtime} />
      </figcaption>
    </figure>
  );
}

/** 大图预览（灯箱）：左右切换 + 键盘导航 */
function Lightbox({
  items,
  index,
  onIndexChange,
  onOpenChange,
  open,
}: {
  items: Array<{ job: PlanJob; runtime: JobRuntime }>;
  index: number;
  onIndexChange: (next: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const current = items[index];
  const [downloading, setDownloading] = useState(false);

  const prev = useCallback(() => {
    if (items.length > 0) onIndexChange((index - 1 + items.length) % items.length);
  }, [index, items.length, onIndexChange]);
  const next = useCallback(() => {
    if (items.length > 0) onIndexChange((index + 1) % items.length);
  }, [index, items.length, onIndexChange]);

  const handleDownload = async () => {
    if (!current?.runtime.url || !current.runtime.filename) return;
    setDownloading(true);
    try {
      await downloadAsset(current.runtime.url, current.runtime.filename);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="max-w-none w-[min(94vw,1400px)] border-none bg-black/90 p-0 shadow-none rounded-xl overflow-hidden [&>button]:bg-white/10 [&>button]:rounded-full [&>button]:p-1 [&>button]:top-3 [&>button]:right-3"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'ArrowLeft') prev();
          if (e.key === 'ArrowRight') next();
        }}
      >
        {current ? (
          <div className="flex flex-col">
            <div className="relative flex min-h-[40vh] items-center justify-center p-4 sm:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.runtime.url}
                alt={current.job.label}
                className="max-h-[74vh] w-auto max-w-full rounded-sm object-contain shadow-2xl"
              />
              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="上一张"
                    onClick={prev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/90 transition-colors hover:bg-white/20"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="下一张"
                    onClick={next}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/90 transition-colors hover:bg-white/20"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-[13px] font-semibold text-white">
                  {current.job.label}
                </DialogTitle>
                <p className="truncate font-mono text-[11px] tabular-nums text-white/60">
                  {(current.runtime.filename ?? '').replace(/\.jpe?g$/i, '')}
                  {current.runtime.width ? ` · ${current.runtime.width}×${current.runtime.height}` : ''}
                  {items.length > 1 ? ` · ${index + 1} / ${items.length}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 shrink-0 gap-1.5 text-xs"
                disabled={downloading}
                onClick={() => void handleDownload()}
              >
                <Download className="size-3.5" />
                {downloading ? '下载中…' : '下载原图'}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function GenerationView({
  jobs,
  runtimes,
  phaseMessage,
  summary,
  error,
  onRetryFailed,
  onReset,
}: GenerationViewProps) {
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [lightbox, setLightbox] = useState<{ tab: 'main' | 'detail'; index: number } | null>(null);

  const mains = jobs.filter((j) => j.slot === 'main');
  const details = jobs.filter((j) => j.slot === 'detail');
  const total = jobs.length;
  const finished = jobs.filter(
    (j) => runtimes[j.id]?.status === 'done' || runtimes[j.id]?.status === 'error',
  ).length;
  const succeeded = jobs.filter((j) => runtimes[j.id]?.status === 'done').length;
  const failedCount = jobs.filter((j) => runtimes[j.id]?.status === 'error').length;
  const allSettled = finished === total && total > 0;
  const allDone = succeeded === total && total > 0;

  const doneItemsOf = useCallback(
    (list: PlanJob[]) =>
      list
        .map((job) => ({ job, runtime: runtimes[job.id] }))
        .filter((x): x is { job: PlanJob; runtime: JobRuntime } => x.runtime?.status === 'done' && Boolean(x.runtime.url)),
    [runtimes],
  );

  const lightboxItems =
    lightbox?.tab === 'main' ? doneItemsOf(mains) : doneItemsOf(details);

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      for (const job of jobs) {
        const rt = runtimes[job.id];
        if (rt?.status === 'done' && rt.url && rt.filename) {
          await downloadAsset(rt.url, rt.filename);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-20">
      {/* ── 交付栏：眉题 + 大数字完成度 + 操作 ───────────────── */}
      <section className="rounded-xl border bg-card px-5 py-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Delivery · 成片交付
            </p>
            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  'text-[26px] font-bold leading-none tabular-nums tracking-tight',
                  allDone && 'text-studio-success',
                )}
              >
                {succeeded}
              </span>
              <span className="text-[13px] tabular-nums text-muted-foreground">
                / {total} 张
              </span>
              {succeeded > 0 && (
                <span className="ml-2 text-[11px] tabular-nums text-muted-foreground">
                  算力 ≈ ${(succeeded * COST_PER_IMAGE_USD).toFixed(2)}
                </span>
              )}
              {failedCount > 0 && (
                <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-destructive">
                  失败 {failedCount}
                </span>
              )}
              {allDone && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-studio-success/10 px-2 py-0.5 text-[11px] font-semibold text-studio-success">
                  <PackageCheck className="size-3" />
                  交付完成
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => void handleDownloadAll()}
              disabled={succeeded === 0 || downloadingAll}
              className="gap-1.5"
            >
              <FileDown className="size-3.5" />
              {downloadingAll ? '打包下载中…' : `下载全部（${succeeded} 张）`}
            </Button>
            {failedCount > 0 && allSettled && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onRetryFailed}>
                <RotateCcw className="size-3.5" />
                重试失败项
              </Button>
            )}
            {allSettled && (
              <Button size="sm" variant="ghost" onClick={onReset}>
                新的一轮
              </Button>
            )}
          </div>
        </div>
        <Progress
          value={total > 0 ? (finished / total) * 100 : 0}
          className={cn(
            'mt-4 h-1',
            allDone ? '[&>div]:bg-studio-success' : '[&>div]:bg-studio',
          )}
        />
        <p className="mt-2.5 text-[11.5px] text-muted-foreground">
          {error || phaseMessage || '…'}
        </p>
      </section>

      {/* ── 画廊：下划线分栏 + 画框陈列 ─────────────────────── */}
      <Tabs defaultValue="main">
        <TabsList className="h-auto w-full justify-start gap-7 rounded-none border-b border-border bg-transparent p-0">
          {(
            [
              { value: 'main', label: '主图 Main', count: mains.length },
              { value: 'detail', label: '详情页 Detail', count: details.length },
            ] as const
          ).map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="gap-1.5 rounded-none border-0 border-b-2 border-transparent px-0 pb-2.5 pt-1 shadow-none transition-colors data-[state=active]:border-studio data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <span className="text-[12.5px] font-semibold tracking-wide">{tab.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {tab.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="main" className="mt-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {mains.map((job) => {
              const idx = doneItemsOf(mains).findIndex((x) => x.job.id === job.id);
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  runtime={runtimes[job.id]}
                  onOpen={
                    idx >= 0
                      ? () => setLightbox({ tab: 'main', index: idx })
                      : undefined
                  }
                />
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="detail" className="mt-6">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {details.map((job) => {
              const idx = doneItemsOf(details).findIndex((x) => x.job.id === job.id);
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  runtime={runtimes[job.id]}
                  onOpen={
                    idx >= 0
                      ? () => setLightbox({ tab: 'detail', index: idx })
                      : undefined
                  }
                />
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── 大图预览 ───────────────────────────────────────── */}
      <Lightbox
        open={lightbox !== null}
        items={lightboxItems}
        index={lightbox?.index ?? 0}
        onIndexChange={(next) =>
          setLightbox((prev) => (prev ? { ...prev, index: next } : prev))
        }
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
      />
    </div>
  );
}
