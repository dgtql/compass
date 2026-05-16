/**
 * Helpers for the master agent's theme-keyed engagement model.
 *
 * The master-agent idea/academic-exploration workflows file engagements
 * under a synthetic ``house`` analyst with an ``IDEA-<slug>`` "ticker"
 * derived from the PM's framing message. The frontend regenerates the
 * same slug to look up engagement files for a given chat session.
 *
 * Keep this in sync with ``compass.chat_skills.theme_key_from_text``.
 */

const THEME_PREFIX = 'IDEA-';
const THEME_MAX_LEN = 40;

/** Mirror of ``compass.chat_skills.theme_key_from_text``. Idempotent for
 *  the same input so the engagement directory stays stable across
 *  re-runs of the same theme. */
export function themeKeyFromText(text: string, maxLen = THEME_MAX_LEN): string {
  const cleaned = (text || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const body = (cleaned || 'UNTITLED').slice(0, maxLen).replace(/-+$/, '');
  return `${THEME_PREFIX}${body}`;
}

export function isThemeTicker(ticker: string | null | undefined): boolean {
  return !!ticker && ticker.startsWith(THEME_PREFIX);
}

/** Reverse a chat task into the IDEA-<slug> engagement it ran against.
 *
 *  Precedence:
 *  1. ``task.coverageTicker`` if it's already a theme key (modern flow).
 *  2. Heal old tasks by parsing the title — ``Trading ideas — <message>``
 *     or ``Academic ideas — <message>`` was the format the chat task
 *     was created with; running ``themeKeyFromText`` on the trailing
 *     message yields the same slug the backend computed at the time.
 *  3. ``null`` — caller decides how to handle (typically: show empty
 *     state, don't auto-pick a different engagement).
 */
export function ideaTickerFromChatTask(task: {
  coverageTicker?: string | null;
  title?: string | null;
} | null | undefined): string | null {
  if (!task) return null;
  if (isThemeTicker(task.coverageTicker ?? null)) {
    return task.coverageTicker ?? null;
  }
  const title = task.title ?? '';
  // ``—`` (em-dash) is what ``sendMemo`` writes, but be lenient — strip
  // either em-dash or hyphen with optional whitespace.
  const m = title.match(/^(?:Trading ideas|Academic ideas)\s*[—-]\s*(.+)$/i);
  if (!m) return null;
  return themeKeyFromText(m[1]);
}
