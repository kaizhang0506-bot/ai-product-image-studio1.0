/**
 * 指令工作台 API：GET 列表（当前生效文本 + overridden 标记）/ PUT 保存覆盖 / DELETE 恢复默认。
 * 覆盖文本持久化在 /tmp/studio-prompt-overrides.json，所有 AI 环节下次调用即生效。
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  PROMPT_TEMPLATES,
  getPromptText,
  hasPromptOverride,
  resetPromptOverride,
  savePromptOverride,
} from '@/lib/prompt-registry';

export const runtime = 'nodejs';

export async function GET() {
  const templates = PROMPT_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    vars: t.vars,
    text: getPromptText(t.key),
    overridden: hasPromptOverride(t.key),
  }));
  return NextResponse.json({ templates });
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { key?: unknown; text?: unknown };
    const key = typeof body.key === 'string' ? body.key : '';
    const text = typeof body.text === 'string' ? body.text : '';
    if (!key) return NextResponse.json({ error: '缺少指令 key' }, { status: 400 });
    savePromptOverride(key, text);
    return NextResponse.json({
      ok: true,
      text: getPromptText(key),
      overridden: hasPromptOverride(key),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '保存失败' },
      { status: 400 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!key) return NextResponse.json({ error: '缺少指令 key' }, { status: 400 });
  try {
    resetPromptOverride(key);
    return NextResponse.json({ ok: true, text: getPromptText(key), overridden: false });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '恢复失败' },
      { status: 400 },
    );
  }
}
