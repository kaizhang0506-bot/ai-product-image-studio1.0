/**
 * 测试版限量配额（服务端）：
 * - 累计成功生成图片张数上限 50 张
 * - 计数持久化到 /tmp（跨进程重启保留；生产环境唯一可写目录）
 * - 达到上限后系统自动关闭：上传 / 解析 / 生图全部拒绝，仅保留查询与下载
 */
import { readFile, writeFile } from 'node:fs/promises';

export const MAX_QUOTA = 50;


const QUOTA_FILE = '/tmp/studio-quota.json';

export interface QuotaState {
  generated: number;
  closed: boolean;
  closedAt: string | null;
}

let cached: QuotaState | null = null;
/** 串行化写入，避免并发累加丢失 */
let writeChain: Promise<void> = Promise.resolve();

function normalize(raw: unknown): QuotaState {
  const obj = (raw ?? {}) as Partial<QuotaState>;
  const generated =
    typeof obj.generated === 'number' && Number.isFinite(obj.generated)
      ? Math.max(0, Math.floor(obj.generated))
      : 0;
  return {
    generated: Math.min(generated, MAX_QUOTA),
    closed: obj.closed === true || generated >= MAX_QUOTA,
    closedAt: typeof obj.closedAt === 'string' ? obj.closedAt : null,
  };
}

export async function readQuota(): Promise<QuotaState> {
  if (cached) return cached;
  try {
    const text = await readFile(QUOTA_FILE, 'utf8');
    cached = normalize(JSON.parse(text));
  } catch {
    cached = { generated: 0, closed: false, closedAt: null };
  }
  return cached;
}

async function persist(state: QuotaState): Promise<void> {
  cached = state;
  try {
    await writeFile(QUOTA_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // 持久化失败时保留内存计数（进程存活期间仍然生效）
  }
}

/** 累计成功生成张数；达到上限自动关闭 */
export function addGenerated(count: number): Promise<QuotaState> {
  const task = writeChain.then(async () => {
    const state = await readQuota();
    const generated = Math.min(state.generated + count, MAX_QUOTA);
    const closed = generated >= MAX_QUOTA;
    const next: QuotaState = {
      generated,
      closed,
      closedAt: closed ? state.closedAt ?? new Date().toISOString() : null,
    };
    await persist(next);
    return next;
  });
  writeChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

export async function getRemaining(): Promise<number> {
  const state = await readQuota();
  return Math.max(0, MAX_QUOTA - state.generated);
}

export const QUOTA_CLOSED_MESSAGE =
  '测试版权额已用尽（50 张），系统已自动关闭。感谢试用。';

/** 关闭检查：系统已关闭时返回 403 响应，否则返回 null */
export async function assertOpen(): Promise<Response | null> {
  const state = await readQuota();
  if (!state.closed) return null;
  return Response.json({ error: QUOTA_CLOSED_MESSAGE }, { status: 403 });
}
