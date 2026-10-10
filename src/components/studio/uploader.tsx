'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ImagePlus, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { enhanceImage, uploadFiles } from '@/lib/client-api';
import type { UploadedAsset } from '@/lib/studio-types';
import { cn } from '@/lib/utils';

/** 优化方向快捷预设 */
const ENHANCE_PRESETS: Array<{ label: string; prompt: string }> = [
  { label: '提亮增清', prompt: '提亮画面，增强清晰度与细节' },
  { label: '增强质感', prompt: '增强材质纹理与质感表现' },
  { label: '干净背景', prompt: '背景更干净整洁，去除杂乱元素' },
  { label: '暖调氛围', prompt: '光线更自然柔和，暖调居家氛围' },
];

interface UploaderProps {
  label: string;
  hint?: string;
  multiple?: boolean;
  assets: UploadedAsset[];
  onChange: (assets: UploadedAsset[]) => void;
  disabled?: boolean;
  requiredMark?: boolean;
}

export function Uploader({
  label,
  hint,
  multiple = false,
  assets,
  onChange,
  disabled = false,
  requiredMark = false,
}: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  /** 正在 AI 优化的素材 id */
  const [enhancingId, setEnhancingId] = useState<string | null>(null);
  /** 优化对话框目标素材 */
  const [enhanceTarget, setEnhanceTarget] = useState<UploadedAsset | null>(null);
  /** 用户自定义优化提示词 */
  const [enhancePrompt, setEnhancePrompt] = useState('');

  /** AI 画质优化：优化完成后替换原素材 URL（可带人工提示词） */
  const runEnhance = async (asset: UploadedAsset, prompt: string) => {
    if (enhancingId || disabled) return;
    setEnhancingId(asset.id);
    setEnhanceTarget(null);
    setError('');
    try {
      const optimizedUrl = await enhanceImage(
        asset.url,
        prompt.trim() || undefined,
      );
      onChange(
        assets.map((a) =>
          a.id === asset.id ? { ...a, url: optimizedUrl, optimized: true } : a,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI 优化失败');
    } finally {
      setEnhancingId(null);
    }
  };

  /** 打开优化对话框（可自定义提示词） */
  const openEnhance = (asset: UploadedAsset) => {
    if (enhancingId || disabled) return;
    setEnhancePrompt('');
    setEnhanceTarget(asset);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (files.length === 0) {
      setError('仅支持图片文件（JPG / PNG / WebP）');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const uploaded = await uploadFiles(multiple ? files : files.slice(0, 1));
      onChange(multiple ? [...assets, ...uploaded] : uploaded.slice(0, 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAsset = (id: string) =>
    onChange(assets.filter((a) => a.id !== id));

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-semibold tracking-wide">
          {label}
          {requiredMark && <span className="ml-0.5 text-studio">*</span>}
        </span>
        {hint && (
          <span className="max-w-[220px] text-right text-[11px] leading-tight text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <div
        className={cn(
          'rounded-md border border-dashed transition-colors duration-200',
          dragging
            ? 'border-studio bg-studio-soft'
            : 'border-input bg-background',
          disabled && 'pointer-events-none opacity-60',
        )}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void handleFiles(e.dataTransfer.files);
        }}
      >
        {assets.length === 0 ? (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1 px-3 py-4 text-muted-foreground transition-colors hover:text-foreground"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            <span className="text-xs">
              {busy ? '上传中…' : '点击或拖拽图片到此处'}
            </span>
          </button>
        ) : (
          <div className="flex flex-wrap gap-2 p-2">
            {assets.map((asset) => {
              const isEnhancing = enhancingId === asset.id;
              return (
                <div
                  key={asset.id}
                  className="group bg-checkerboard relative size-16 overflow-hidden rounded border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className={cn(
                      'size-full object-cover transition-opacity duration-200',
                      isEnhancing && 'opacity-40',
                    )}
                  />
                  {asset.optimized && !isEnhancing && (
                    <span
                      title="已 AI 优化"
                      className="absolute left-0.5 top-0.5 rounded-full bg-studio-soft p-0.5 text-studio ring-1 ring-studio/30"
                    >
                      <Sparkles className="size-2.5" />
                    </span>
                  )}
                  {isEnhancing ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="size-3.5 animate-spin text-studio" />
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openEnhance(asset)}
                        disabled={disabled || Boolean(enhancingId)}
                        aria-label={`AI 优化 ${asset.name}`}
                        title="AI 优化：可自定义提示词"
                        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/60 py-[3px] text-[9px] font-medium text-white opacity-0 transition-opacity duration-200 hover:bg-black/80 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                      >
                        <Sparkles className="size-2.5" />
                        AI 优化
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAsset(asset.id)}
                        disabled={disabled}
                        aria-label={`移除 ${asset.name}`}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            {multiple && (
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => inputRef.current?.click()}
                className="flex size-16 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-input text-muted-foreground transition-colors hover:border-studio hover:text-studio"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                <span className="text-[10px]">添加</span>
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          void handleFiles(e.target.files)
        }
      />

      {/* AI 优化对话框：支持人工自定义提示词 */}
      <Dialog
        open={Boolean(enhanceTarget)}
        onOpenChange={(open: boolean) => {
          if (!open) setEnhanceTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5 text-[15px]">
              <Wand2 className="size-4 text-studio" />
              AI 优化素材
            </DialogTitle>
            <DialogDescription>
              可选：用一句话描述想要的优化效果；留空则自动进行画质增强（提清晰、调光影，内容构图不变）。
            </DialogDescription>
          </DialogHeader>

          {enhanceTarget && (
            <div className="flex items-start gap-3">
              <div className="bg-checkerboard size-20 shrink-0 overflow-hidden rounded border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enhanceTarget.url}
                  alt={enhanceTarget.name}
                  className="size-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Textarea
                  value={enhancePrompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setEnhancePrompt(e.target.value)
                  }
                  maxLength={300}
                  rows={3}
                  placeholder="例如：背景更干净，突出主体；绒面质感更强；整体提亮并增强清晰度…"
                  className="min-h-[72px] resize-none text-[13px]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {ENHANCE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setEnhancePrompt(p.prompt)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors duration-200',
                        enhancePrompt === p.prompt
                          ? 'border-studio bg-studio-soft text-studio'
                          : 'border-border text-muted-foreground hover:border-studio/50 hover:text-studio',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="items-center gap-2 sm:justify-between">
            <span className="text-[11px] text-muted-foreground">
              {enhancePrompt.length}/300 字 · 约 10~30 秒
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEnhanceTarget(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-studio text-white hover:bg-studio/90"
                onClick={() => {
                  if (enhanceTarget) void runEnhance(enhanceTarget, enhancePrompt);
                }}
              >
                <Sparkles className="size-3.5" />
                开始优化
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
