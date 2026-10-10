'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Aperture,
  Check,
  CircleAlert,
  Images,
  Layers,
  Loader2,
  Lock,
  ScanSearch,
  SlidersHorizontal,
} from 'lucide-react';
import { AnalysisView } from '@/components/studio/analysis-view';
import { GenerationView } from '@/components/studio/generation-view';
import { NodeModelPanel } from '@/components/studio/node-model-panel';
import { InputPanel } from '@/components/studio/input-panel';
import {
  fetchQuota,
  getStoredImagenKey,
  requestAnalysis,
  streamGenerate,
  type QuotaInfo,
} from '@/lib/client-api';
import {
  DEMO_POINTS_TEXT,
  DEMO_PRODUCT_NAME,
  DEMO_SKU,
  loadDemoAssets,
} from '@/lib/demo-data';
import {
  DEFAULT_SETTINGS,
  parseSellingPoints,
  type AnalysisResult,
  type CampaignBrief,
  type InputState,
  type JobRuntime,
  type JobStatus,
  type PlanJob,
  type ProductImageRead,
  type StyleAnalysis,
} from '@/lib/studio-types';
import { cn } from '@/lib/utils';

type Stage = 'input' | 'analyzing' | 'plan' | 'generating';

const ANALYZE_STEPS = [
  { label: '解析背景氛围参考图', desc: '提炼场景、材质与光线基调' },
  { label: '解析产品风格与色彩', desc: '识别产品气质、配色与质感' },
  { label: '理解卖点清单', desc: '把每个卖点落到最合适的产品图' },
  { label: '总导演统筹排片', desc: '套系叙事线 + 逐图位任务分配' },
  { label: '策划出图方案', desc: '按统筹简报逐张规划画面' },
];

const STEP_DEFS = [
  { key: 'input', label: '素材' },
  { key: 'plan', label: 'AI 策划' },
  { key: 'generating', label: '批量出图' },
  { key: 'deliver', label: '成片交付' },
] as const;

function stageToStepIndex(stage: Stage, settled: boolean): number {
  switch (stage) {
    case 'input':
      return 0;
    case 'analyzing':
    case 'plan':
      return 1;
    case 'generating':
      return settled ? 3 : 2;
    default:
      return 0;
  }
}

function Stepper({ active, running }: { active: number; running: boolean }) {
  return (
    <ol className="hidden items-center gap-1 md:flex">
      {STEP_DEFS.map((step, i) => {
        const done = i < active;
        const isActive = i === active;
        return (
          <li key={step.key} className="flex items-center gap-1">
            {i > 0 && <span className="mx-1 h-px w-6 bg-border" />}
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors duration-200',
                done && 'text-studio-success',
                isActive && 'bg-studio-soft font-semibold text-studio',
                !done && !isActive && 'text-muted-foreground',
              )}
            >
              {done ? (
                <Check className="size-3.5" />
              ) : isActive && running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    isActive ? 'bg-studio' : 'bg-muted-foreground/40',
                  )}
                />
              )}
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AnalyzingPanel({ currentStep }: { currentStep: number }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <div className="flex items-center gap-2">
        <ScanSearch className="size-4 text-studio" />
        <p className="text-[13px] font-bold">AI 正在解析素材并策划出图方案</p>
      </div>
      <ol className="space-y-2">
        {ANALYZE_STEPS.map((step, i) => (
          <li
            key={step.label}
            className={cn(
              'flex items-start gap-3 rounded-lg border bg-card p-3 transition-all duration-300',
              i <= currentStep ? 'opacity-100' : 'opacity-40',
            )}
          >
            <span className="mt-0.5">
              {i < currentStep ? (
                <Check className="size-4 text-studio-success" />
              ) : i === currentStep ? (
                <Loader2 className="size-4 animate-spin text-studio" />
              ) : (
                <span className="block size-4 rounded-full border border-input" />
              )}
            </span>
            <div>
              <p className="text-[13px] font-medium">{step.label}</p>
              <p className="text-[11px] text-muted-foreground">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        解析遵循「模仿参考图的味道而不是抄袭」原则：背景参考只取氛围基调，排版参考只取版式语言。
      </p>
    </div>
  );
}

function IdleGuide({
  onDemo,
  demoBusy,
}: {
  onDemo: () => void;
  demoBusy: boolean;
}) {
  const guides = [
    {
      icon: Images,
      title: '上传素材',
      desc: '产品图（整体/局部/多角度）、背景氛围参考、排版海报参考、品牌 Logo（可选）',
    },
    {
      icon: SlidersHorizontal,
      title: '填写卖点与设置',
      desc: '按「图N：卖点」逐行填写；选择主图 5~7 张、详情页 3~7 张，精修与高清增强可随时开关',
    },
    {
      icon: ScanSearch,
      title: 'AI 解析与策划',
      desc: '理解参考图氛围与版式语言，产出可人工编辑的出图计划',
    },
    {
      icon: Layers,
      title: '批量出图与交付',
      desc: '主图 2000×2000、详情页 1940×1200，高清增强后按 SKU_1 规范命名下载',
    },
  ];
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-lg border bg-card p-6">
        <p className="text-[15px] font-bold">从素材到成片，一条流水线</p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          左侧填写产品信息后点击「开始 AI 解析与策划」。卖点写得越具体（如「图1：尺寸+承重+安装」），出图越贴合需求。
        </p>
        <div className="mt-5 space-y-3">
          {guides.map((g, i) => (
            <div key={g.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-studio-soft text-studio">
                <g.icon className="size-3.5" />
              </span>
              <div>
                <p className="text-[13px] font-semibold">
                  <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                    0{i + 1}
                  </span>
                  {g.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {g.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-md bg-studio-soft p-3">
          <p className="text-[11px] font-semibold text-studio">参考图给多少张更好？</p>
          <p className="mt-1 text-[11px] leading-relaxed text-studio/90">
            背景氛围参考 2~4 张、排版设计参考 2~4 张、产品图 3~8 张（覆盖整体、局部与各角度）时出图最稳定；
            参考图只用来给 AI「味道」，不会被照搬。
          </p>
        </div>
        <button
          type="button"
          onClick={onDemo}
          disabled={demoBusy}
          className="mt-4 text-[12px] text-studio underline underline-offset-4 hover:text-foreground disabled:opacity-60"
        >
          {demoBusy ? '演示运行中…' : '不想手动填写？点这里一键演示全流程 →'}
        </button>
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <CircleAlert className="size-3.5" />
        生成图片由 AI 产出，请核对产品形态与卖点文字后再上架使用
      </p>
    </div>
  );
}

interface GenerationContext {
  productUnderstanding: string;
  style: StyleAnalysis;
  /** 统筹 AI 简报：生图提示词继承美术宪法与逐图位任务，衔接统筹→策划→生图 */
  campaign?: CampaignBrief;
  /** 产品图细读结果：生图提示词继承其视角与细节，保证策划→生图衔接连贯 */
  productImageReads?: ProductImageRead[];
}

/** 测试版封版面板：50 张限量用尽后展示 */
function ClosedPanel({ quota }: { quota: QuotaInfo | null }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="rounded-xl border bg-card p-8 text-center shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Lock className="size-5 text-muted-foreground" />
        </span>
        <p className="mt-4 text-[15px] font-bold">测试版已结束</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          本系统为测试版本，{quota?.max ?? 50} 张图片限量已全部生成完毕，系统已自动关闭。
        </p>
        <div className="mx-auto mt-4 w-fit rounded-md bg-muted px-3 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          已生成 {quota?.generated ?? 50} / {quota?.max ?? 50} 张
        </div>
        <p className="mt-5 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground">
          感谢试用「AI 产品图工作台」。如需继续批量出图，请升级正式版。
        </p>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [stage, setStage] = useState<Stage>('input');
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [inputs, setInputs] = useState<InputState>({
    sku: '',
    productName: '',
    logo: null,
    productImages: [],
    bgRefs: [],
    layoutRefs: [],
    sellingPointsText: '',
    settings: { ...DEFAULT_SETTINGS },
  });
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [jobs, setJobs] = useState<PlanJob[]>([]);
  const [runtimes, setRuntimes] = useState<Record<string, JobRuntime>>({});
  const [phaseMessage, setPhaseMessage] = useState('');
  const [summary, setSummary] = useState<{
    total: number;
    succeeded: number;
    failed: number;
  } | null>(null);
  const [genError, setGenError] = useState('');
  const [analyzeError, setAnalyzeError] = useState('');
  const [analyzeNotice, setAnalyzeNotice] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const refreshQuota = () => {
    fetchQuota()
      .then(setQuota)
      .catch(() => {
        // 配额接口不可用时不阻塞主流程
      });
  };

  // 挂载时拉取测试版配额
  useEffect(() => {
    refreshQuota();
  }, []);

  const patchInputs = (patch: Partial<InputState>) =>
    setInputs((prev) => ({ ...prev, ...patch }));

  // 解析阶段的步骤推进动画
  useEffect(() => {
    if (stage !== 'analyzing') return;
    setAnalyzeStep(0);
    const timer = setInterval(() => {
      setAnalyzeStep((s) => Math.min(s + 1, ANALYZE_STEPS.length - 1));
    }, 1600);
    return () => clearInterval(timer);
  }, [stage]);

  // 右侧工作流滚动容器：策划完成后回到顶部，让用户直接看到计划区
  const workflowRef = useRef<HTMLElement>(null);

  const runAnalysis = async (
    data: InputState,
  ): Promise<{ analysis: AnalysisResult; jobs: PlanJob[] } | null> => {
    if (quota?.closed) {
      setAnalyzeError('测试版权额已用尽，系统已自动关闭');
      return null;
    }
    setAnalyzeError('');
    setAnalyzeNotice('');
    setStage('analyzing');
    try {
      const result = await requestAnalysis({
        sku: data.sku,
        productName: data.productName,
        sellingPoints: parseSellingPoints(data.sellingPointsText),
        slotSpecText: data.sellingPointsText,
        productImages: data.productImages.map((a) => a.url),
        bgRefs: data.bgRefs.map((a) => a.url),
        layoutRefs: data.layoutRefs.map((a) => a.url),
        logoUrl: data.logo?.url,
        settings: data.settings,
      });
      setAnalysis(result);
      setJobs(result.jobs);
      if (result.engine === 'kimi-fallback') {
        setAnalyzeNotice('Kimi 通道暂不可用，已自动切换内置旗舰模型完成本次策划');
      }
      setStage('plan');
      requestAnimationFrame(() => {
        workflowRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return { analysis: result, jobs: result.jobs };
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'AI 解析失败');
      setStage('input');
      return null;
    }
  };

  const handleAnalyze = () => void runAnalysis(inputs);

  const runGeneration = async (
    data: InputState,
    context: GenerationContext,
    runJobs: PlanJob[],
    filenameOverrides?: Record<string, string>,
  ) => {
    if (quota?.closed) {
      setGenError('测试版权额已用尽，系统已自动关闭');
      return;
    }
    setGenError('');
    setSummary(null);
    setPhaseMessage('');
    setRuntimes(
      Object.fromEntries(
        runJobs.map((j) => [j.id, { status: 'queued' as JobStatus }]),
      ),
    );
    setStage('generating');
    try {
      await streamGenerate(
        {
          sku: data.sku,
          productName: data.productName,
          productImages: data.productImages.map((a) => a.url),
          bgRefs: data.bgRefs.map((a) => a.url),
          layoutRefs: data.layoutRefs.map((a) => a.url),
          logoUrl: data.logo?.url,
          settings: data.settings,
          productUnderstanding: context.productUnderstanding,
          style: context.style,
          campaign: context.campaign,
          productImageReads: context.productImageReads,
          jobs: runJobs,
          apiKey: getStoredImagenKey(),
          filenameOverrides,
        },
        (event) => {
          switch (event.type) {
            case 'phase':
              setPhaseMessage(event.message);
              break;
            case 'job-start':
              setRuntimes((prev) => ({
                ...prev,
                [event.id]: {
                  ...(prev[event.id] ?? { status: 'queued' }),
                  status: 'generating',
                  filename: event.filename,
                },
              }));
              break;
            case 'job-stage':
              setRuntimes((prev) => ({
                ...prev,
                [event.id]: {
                  ...(prev[event.id] ?? { status: 'queued' }),
                  status: event.stage,
                },
              }));
              break;
            case 'job-done':
              setRuntimes((prev) => ({
                ...prev,
                [event.id]: {
                  status: 'done',
                  url: event.url,
                  filename: event.filename,
                  width: event.width,
                  height: event.height,
                },
              }));
              break;
            case 'job-error':
              setRuntimes((prev) => ({
                ...prev,
                [event.id]: {
                  ...(prev[event.id] ?? { status: 'queued' }),
                  status: 'error',
                  error: event.message,
                },
              }));
              break;
            case 'done':
              setSummary({
                total: event.total,
                succeeded: event.succeeded,
                failed: event.failed,
              });
              break;
            case 'error':
              setGenError(event.message);
              break;
          }
        },
      );
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '生成失败');
    } finally {
      refreshQuota();
    }
  };

  const handleRetryFailed = () => {
    const failedJobs = jobs.filter((j) => runtimes[j.id]?.status === 'error');
    if (failedJobs.length === 0 || !analysis) return;
    const overrides: Record<string, string> = {};
    for (const job of failedJobs) {
      const original = runtimes[job.id]?.filename;
      if (original) {
        overrides[job.id] = original.replace(/\.jpg$/i, '');
      }
    }
    void runGeneration(
      inputs,
      {
        productUnderstanding: analysis.productUnderstanding,
        style: analysis.style,
        campaign: analysis.campaign,
        productImageReads: analysis.productImages,
      },
      failedJobs,
      overrides,
    );
  };

  /** 一键演示：自动填充示例数据并跑通「上传 → AI 策划 → 批量出图」全流程 */
  const handleDemo = async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    setAnalyzeError('');
    try {
      const demoAssets = await loadDemoAssets();
      const demoInputs: InputState = {
        sku: DEMO_SKU,
        productName: DEMO_PRODUCT_NAME,
        logo: demoAssets.logo,
        productImages: demoAssets.productImages,
        bgRefs: demoAssets.bgRefs,
        layoutRefs: demoAssets.layoutRefs,
        sellingPointsText: DEMO_POINTS_TEXT,
        settings: {
          refine: true,
          hdEnhance: true,
          includeSizeChart: false,
          styleMode: 'auto',
          mainCount: 5,
          detailCount: 3,
        },
      };
      setInputs(demoInputs);
      const result = await runAnalysis(demoInputs);
      if (!result) return;
      await runGeneration(
        demoInputs,
        {
          productUnderstanding: result.analysis.productUnderstanding,
          style: result.analysis.style,
          campaign: result.analysis.campaign,
          productImageReads: result.analysis.productImages,
        },
        result.jobs,
      );
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : '演示流程失败');
      setStage('input');
    } finally {
      setDemoBusy(false);
    }
  };

  const handleReset = () => {
    setStage('input');
    setAnalysis(null);
    setJobs([]);
    setRuntimes({});
    setSummary(null);
    setPhaseMessage('');
    setGenError('');
  };

  const stepIndex = stageToStepIndex(stage, summary !== null);
  const quotaClosed = quota?.closed ?? false;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* 顶部工具条 */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
              <Aperture className="size-4.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[14px] font-bold">AI 产品图工作台</p>
              <p className="text-[11px] text-muted-foreground">
                主图 × 详情页 · 一站式批量出图
              </p>
            </div>
            {/* 测试版徽标 */}
            <span
              className={cn(
                'ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide',
                quotaClosed
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-studio-amber-soft text-studio-amber',
              )}
            >
              测试版
            </span>
          </div>
          {/* 配额指示 */}
          {quota && (
            <div className="mr-2 hidden items-center gap-2 sm:flex">
              <span className="text-[11px] text-muted-foreground">
                测试版图片额度
              </span>
              <span className="font-mono text-[12px] font-semibold tabular-nums">
                {quota.generated}
                <span className="text-muted-foreground"> / {quota.max}</span>
              </span>
              <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-300',
                    quotaClosed
                      ? 'bg-destructive'
                      : quota.generated / quota.max > 0.8
                        ? 'bg-studio-amber'
                        : 'bg-studio-success',
                  )}
                  style={{ width: `${Math.min(100, (quota.generated / quota.max) * 100)}%` }}
                />
              </span>
            </div>
          )}
          <Stepper active={stepIndex} running={stage === 'analyzing' || (stage === 'generating' && summary === null)} />
        </div>
        {/* 封版横幅 */}
        {quotaClosed && (
          <div className="border-t border-destructive/20 bg-destructive/5 px-5 py-1.5 text-center text-[12px] font-medium text-destructive">
            测试版 {quota?.max ?? 50} 张限量已用尽，系统已自动关闭，感谢试用
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* 左侧输入面板 */}
        <aside className="w-full shrink-0 border-b bg-card/40 lg:h-[calc(100vh-3.5rem)] lg:w-[400px] lg:border-b-0 lg:border-r">
          <InputPanel
            value={inputs}
            onChange={patchInputs}
            disabled={quotaClosed}
            quotaLeft={quota ? { generated: quota.generated, max: quota.max } : null}
            onAnalyze={() => void handleAnalyze()}
            busy={stage === 'analyzing'}
            onDemo={() => void handleDemo()}
            demoBusy={demoBusy}
          />
          {analyzeError && (
            <p className="flex items-start justify-between gap-2 border-t bg-destructive/5 px-5 py-2.5 text-[12px] text-destructive">
              <span className="min-w-0 break-words">{analyzeError}</span>
              <button
                type="button"
                onClick={() => setAnalyzeError('')}
                className="shrink-0 rounded px-1 leading-none text-destructive/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="关闭错误提示"
              >
                ✕
              </button>
            </p>
          )}
          {analyzeNotice && (
            <p className="flex items-start justify-between gap-2 border-t bg-studio-soft px-5 py-2.5 text-[12px] text-studio">
              <span className="min-w-0 break-words">{analyzeNotice}</span>
              <button
                type="button"
                onClick={() => setAnalyzeNotice('')}
                className="shrink-0 rounded px-1 leading-none text-studio/60 transition-colors hover:bg-studio/10 hover:text-studio"
                aria-label="关闭提示"
              >
                ✕
              </button>
            </p>
          )}
        </aside>

        {/* 右侧工作流区 */}
        <main
          ref={workflowRef}
          className="thin-scrollbar min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:h-[calc(100vh-3.5rem)]"
        >
          <NodeModelPanel disabled={quotaClosed || stage === 'analyzing' || (stage === 'generating' && summary === null) || demoBusy} />
          {stage === 'input' &&
            (quotaClosed ? (
              <ClosedPanel quota={quota} />
            ) : (
              <IdleGuide onDemo={() => void handleDemo()} demoBusy={demoBusy} />
            ))}
          {stage === 'analyzing' && <AnalyzingPanel currentStep={analyzeStep} />}
          {stage === 'plan' && analysis && (
            <AnalysisView
              analysis={analysis}
              jobs={jobs}
              productImages={inputs.productImages}
              busy={false}
              onJobsChange={setJobs}
              onConfirm={() => {
                if (analysis) {
                  void runGeneration(
                    inputs,
                    {
                      productUnderstanding: analysis.productUnderstanding,
                      style: analysis.style,
                      campaign: analysis.campaign,
                      productImageReads: analysis.productImages,
                    },
                    jobs,
                  );
                }
              }}
              onReplan={handleAnalyze}
            />
          )}
          {stage === 'generating' && (
            <GenerationView
              jobs={jobs}
              runtimes={runtimes}
              phaseMessage={phaseMessage}
              summary={summary}
              error={genError}
              onRetryFailed={handleRetryFailed}
              onReset={handleReset}
            />
          )}
        </main>
      </div>
    </div>
  );
}
