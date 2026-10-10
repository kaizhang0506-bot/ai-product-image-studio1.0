'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

interface PromptTemplateItem {
  key: string;
  name: string;
  description: string;
  vars: string[];
  text: string;
  overridden: boolean;
}

type Feedback = { kind: 'ok' | 'err'; text: string } | null;

export default function PromptWorkbench() {
  const [templates, setTemplates] = useState<PromptTemplateItem[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Feedback>(null);

  const active = useMemo(
    () => templates.find((t) => t.key === activeKey) ?? null,
    [templates, activeKey],
  );
  const dirty = active !== null && draft !== active.text;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/prompts');
        const data = (await res.json()) as { templates: PromptTemplateItem[] };
        if (!alive) return;
        setTemplates(data.templates);
        setActiveKey((prev) => prev || data.templates[0]?.key || '');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 切换模板时同步草稿
  useEffect(() => {
    const current = templates.find((t) => t.key === activeKey);
    setDraft(current?.text ?? '');
    setMessage(null);
  }, [activeKey, templates]);

  const save = useCallback(async () => {
    if (!active || !dirty) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: active.key, text: draft }),
      });
      const data = (await res.json()) as {
        error?: string;
        text?: string;
        overridden?: boolean;
      };
      if (!res.ok || data.error) throw new Error(data.error || '保存失败');
      const nextText = data.text ?? draft;
      setTemplates((prev) =>
        prev.map((t) =>
          t.key === active.key
            ? { ...t, text: nextText, overridden: Boolean(data.overridden) }
            : t,
        ),
      );
      setDraft(nextText);
      setMessage({ kind: 'ok', text: '已保存，下次 AI 调用即生效' });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : '保存失败' });
    } finally {
      setBusy(false);
    }
  }, [active, dirty, draft]);

  const resetDefault = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/prompts?key=${encodeURIComponent(active.key)}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as { error?: string; text?: string };
      if (!res.ok || data.error) throw new Error(data.error || '恢复失败');
      const nextText = data.text ?? active.text;
      setTemplates((prev) =>
        prev.map((t) => (t.key === active.key ? { ...t, text: nextText, overridden: false } : t)),
      );
      setDraft(nextText);
      setMessage({ kind: 'ok', text: '已恢复内置默认指令' });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : '恢复失败' });
    } finally {
      setBusy(false);
    }
  }, [active]);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1C1917]">
      <header className="border-b border-[#E7E5E4] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C2410C]">
              Prompt Workbench
            </p>
            <h1 className="mt-0.5 text-lg font-bold">指令工作台</h1>
          </div>
          <Link
            href="/"
            className="rounded-md border border-[#E7E5E4] bg-white px-3 py-1.5 text-xs font-medium text-[#44403C] transition-colors hover:border-[#C2410C] hover:text-[#C2410C]"
          >
            ← 返回工作台
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-4">
        <p className="text-xs leading-relaxed text-[#78716C]">
          这里是流水线全部 AI 环节的指令源。修改并保存后，下一次 AI 调用立即使用新指令；
          <span className="mx-1 rounded bg-[#FDF0E7] px-1.5 py-0.5 text-[10px] font-medium text-[#C2410C]">
            已覆盖
          </span>
          标记表示该指令已偏离内置默认。<code className="font-mono">{`{{变量}}`}</code>
          占位符由流水线在调用时自动填充，删除占位符会丢失对应上下文，请谨慎操作。
        </p>
      </div>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 pb-10 lg:grid-cols-[320px_1fr]">
        {/* 模板列表 */}
        <aside className="h-fit rounded-xl border border-[#E7E5E4] bg-white p-2">
          {loading ? (
            <p className="p-4 text-xs text-[#78716C]">加载中…</p>
          ) : (
            <ul className="space-y-1">
              {templates.map((t) => {
                const isActive = t.key === activeKey;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => setActiveKey(t.key)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? 'bg-[#FDF0E7] ring-1 ring-[#C2410C]/30'
                          : 'hover:bg-[#FAFAF8]'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[13px] font-semibold ${
                            isActive ? 'text-[#C2410C]' : ''
                          }`}
                        >
                          {t.name}
                        </span>
                        {t.overridden && (
                          <span className="shrink-0 rounded bg-[#C2410C] px-1.5 py-0.5 text-[10px] font-medium text-white">
                            已覆盖
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] text-[#A8A29E]">
                        {t.key}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-[#78716C]">
                        {t.description}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* 编辑器 */}
        <section className="rounded-xl border border-[#E7E5E4] bg-white">
          {active ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E4] px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">{active.name}</h2>
                  <p className="mt-0.5 font-mono text-[10px] text-[#A8A29E]">
                    key: {active.key}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {active.overridden && (
                    <button
                      type="button"
                      onClick={resetDefault}
                      disabled={busy || !active.overridden}
                      className="rounded-md border border-[#E7E5E4] px-3 py-1.5 text-xs font-medium text-[#78716C] transition-colors hover:border-[#B91C1C] hover:text-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      恢复默认
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !dirty}
                    className={`rounded-md px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      dirty ? 'bg-[#1C1917] hover:bg-[#44403C]' : 'bg-[#1C1917]'
                    }`}
                  >
                    {busy ? '处理中…' : dirty ? '保存覆盖' : '无改动'}
                  </button>
                </div>
              </div>

              {active.vars.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E7E5E4] bg-[#FAFAF8] px-4 py-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#78716C]">
                    可用变量
                  </span>
                  {active.vars.map((v) => (
                    <code
                      key={v}
                      className="rounded border border-[#E7E5E4] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#44403C]"
                    >
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              )}

              <div className="p-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  spellCheck={false}
                  className="h-[62vh] w-full resize-y rounded-lg border border-[#E7E5E4] bg-[#FAFAF8] p-3 font-mono text-xs leading-relaxed text-[#1C1917] outline-none transition-colors focus:border-[#C2410C]/50 focus:bg-white"
                />
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] text-[#78716C]">
                    {dirty
                      ? '有未保存的修改'
                      : active.overridden
                        ? '当前为后台覆盖版本'
                        : '当前为内置默认版本'}
                  </p>
                  {message && (
                    <p
                      className={`text-[11px] font-medium ${
                        message.kind === 'ok' ? 'text-[#15803D]' : 'text-[#B91C1C]'
                      }`}
                    >
                      {message.text}
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-xs text-[#78716C]">
              {loading ? '加载中…' : '左侧选择一个指令开始编辑'}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
