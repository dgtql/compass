/**
 * Infer the ticker a chat conversation is "about" by scanning messages
 * for any symbol in the analyst's coverage list.
 *
 * Used by AnalystDetailView's right rail when the chat task itself
 * doesn't carry a coverageTicker (free-form chats — the PM typed
 * "write me a pitch for SOC" without going through a workflow chip).
 * Lets the Tasks / Files panes attach to the matching engagement so
 * the rail stops looking empty.
 *
 * Newest message wins, so a follow-up "actually look at NVDA" steers
 * the rail away from the SOC mentioned at the top of the conversation.
 */

import type { ApiChatMessage } from '@/lib/api';

export function inferTickerFromMessages(
  messages: Pick<ApiChatMessage, 'text'>[] | null | undefined,
  coverage: string[] | null | undefined,
): string | null {
  if (!messages?.length || !coverage?.length) return null;

  // Longest-first so `AKSO.OL` wins over a stray `AKSO` if both are in
  // coverage — JS alternation picks the first matching branch, not the
  // longest, so the ordering matters.
  const ordered = [...coverage].sort((a, b) => b.length - a.length);
  const escaped = ordered.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Boundary chars allow `.` inside the ticker (AKSO.OL) but not as a
  // boundary, so "AKSO.OLD" doesn't get matched as AKSO.OL.
  const pattern = new RegExp(
    `(?:^|[^A-Za-z0-9.])(${escaped.join('|')})(?:[^A-Za-z0-9.]|$)`,
    'i',
  );
  const bySymbol = new Map(ordered.map((c) => [c.toLowerCase(), c] as const));

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = pattern.exec(messages[i].text || '');
    if (m) return bySymbol.get(m[1].toLowerCase()) ?? null;
  }
  return null;
}
