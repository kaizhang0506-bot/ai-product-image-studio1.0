import { NextResponse } from 'next/server';
import { MAX_QUOTA, readQuota } from '@/lib/quota-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 测试版配额查询 */
export async function GET() {
  const state = await readQuota();
  return NextResponse.json({
    generated: state.generated,
    max: MAX_QUOTA,
    remaining: Math.max(0, MAX_QUOTA - state.generated),
    closed: state.closed,
    closedAt: state.closedAt,
  });
}
