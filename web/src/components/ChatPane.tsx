import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Send, Brain, Plus, MessageCircle } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { mockSessions } from '@/mocks/data';
import { InlineTodoList } from '@/components/chat/InlineTodoList';
import { AskUserQuestionPanel } from '@/components/chat/AskUserQuestionPanel';
import { OnboardingBanner } from '@/components/chat/OnboardingBanner';
import type { AskAnswers, ChatSession, MasterAgentMessage } from '@/types/domain';

export type RightRailTab = {
  id: string;
  label: string;
  /** Optional small badge (e.g. open-task count) rendered next to the label. */
  badge?: string | number;
  content: ReactNode;
};

export type ChatModel = 'claude-sonnet-4-6' | 'claude-haiku-4-5' | 'claude-opus-4-7';
export type ThinkingMode = 'standard' | 'extended';

const MODEL_LABEL: Record<ChatModel, string> = {
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-haiku-4-5': 'Haiku 4.5',
  'claude-opus-4-7': 'Opus 4.7',
};

type CounterpartyAvatar = {
  initials: string;
  color: string;
};

type Props = {
  /** 'maria-chen' | 'master' — selects which sessions belong here. */
  ownerKey: string;
  counterparty: CounterpartyAvatar;
  placeholder?: string;
  /** Right rail content as a single panel (no tabs). */
  rightRail?: ReactNode;
  /** Right rail content split across tabs. Mutually exclusive with rightRail. */
  rightRailTabs?: RightRailTab[];
  /** Initial right-rail tab id (defaults to first). */
  initialRailTab?: string;
};

export function ChatPane({
  ownerKey,
  counterparty,
  placeholder,
  rightRail,
  rightRailTabs,
  initialRailTab,
}: Props) {
  // Snapshot of mock sessions for this owner, sorted most-recent first.
  // Local mutations (new sessions, new messages) stay in component state.
  const initialSessions = useMemo(
    () =>
      mockSessions
        .filter((s) => s.ownerKey === ownerKey)
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [ownerKey],
  );

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [activeId, setActiveId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ChatModel>('claude-sonnet-4-6');
  const [thinking, setThinking] = useState<ThinkingMode>('standard');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset sessions when ownerKey changes (switching analysts).
  useEffect(() => {
    setSessions(initialSessions);
    setActiveId(initialSessions[0]?.id ?? null);
  }, [ownerKey, initialSessions]);

  const active = sessions.find((s) => s.id === activeId);

  const [railTab, setRailTab] = useState<string | null>(
    initialRailTab ?? rightRailTabs?.[0]?.id ?? null,
  );
  useEffect(() => {
    // If the consumer re-shapes the rail (e.g. switching analysts changed
    // the available tabs), make sure the selected tab still exists.
    if (rightRailTabs && !rightRailTabs.find((t) => t.id === railTab)) {
      setRailTab(rightRailTabs[0]?.id ?? null);
    }
  }, [rightRailTabs, railTab]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [active?.messages.length, activeId]);

  const hasRail = Boolean(rightRail) || Boolean(rightRailTabs && rightRailTabs.length > 0);

  function handleAskSubmit(qid: string, answers: AskAnswers) {
    if (!active) return;
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== active.id
          ? s
          : {
              ...s,
              messages: s.messages.map((m) =>
                m.ask?.requestId === qid ? { ...m, answers } : m,
              ),
            },
      ),
    );
  }

  function newSession() {
    const fresh: ChatSession = {
      id: 'new-' + Date.now(),
      ownerKey,
      title: 'New session',
      lastMessageAt: new Date().toISOString(),
      preview: '',
      messages: [],
    };
    setSessions([fresh, ...sessions]);
    setActiveId(fresh.id);
    setInput('');
  }

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !active) return;
    const userMsg: MasterAgentMessage = {
      id: 'pm-' + Date.now(),
      role: 'pm',
      text: trimmed,
      ts: new Date().toISOString(),
    };
    const reply: MasterAgentMessage = {
      id: 'r-' + Date.now(),
      role: 'master',
      text: `(mocked · model=${model} · thinking=${thinking}) backend wiring lands in a future slice.`,
      ts: new Date(Date.now() + 500).toISOString(),
    };
    // Update active session with new messages + title (if empty)
    setSessions((prev) =>
      prev.map((s) =>
        s.id !== active.id
          ? s
          : {
              ...s,
              title: s.messages.length === 0 ? trimmed.slice(0, 40) : s.title,
              messages: [...s.messages, userMsg],
              lastMessageAt: userMsg.ts,
              preview: trimmed.slice(0, 90),
            },
      ),
    );
    setInput('');
    // Simulate reply
    setTimeout(() => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== active.id
            ? s
            : {
                ...s,
                messages: [...s.messages, reply],
                lastMessageAt: reply.ts,
                preview: reply.text.slice(0, 90),
              },
        ),
      );
    }, 600);
  }

  return (
    <div
      className={cn(
        'h-full grid',
        hasRail ? 'grid-cols-[200px_minmax(0,1fr)_300px]' : 'grid-cols-[200px_minmax(0,1fr)]',
      )}
    >
      {/* Sessions list */}
      <aside className="border-r border-border bg-background/40 flex flex-col">
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Sessions
          </div>
          <button
            onClick={newSession}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="New session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <ul className="px-2 pb-3 flex-1 overflow-y-auto scrollbar-thin space-y-0.5">
          {sessions.length === 0 && (
            <li className="px-2 py-2 text-[11px] text-muted-foreground italic">No sessions.</li>
          )}
          {sessions.map((s) => {
            const isActive = s.id === activeId;
            return (
              <li key={s.id}>
                <button
                  onClick={() => setActiveId(s.id)}
                  className={cn(
                    'w-full text-left px-2 py-2 rounded-md transition-colors',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/40 text-foreground',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <MessageCircle className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium truncate">{s.title}</span>
                  </div>
                  {s.preview && (
                    <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5 pl-4">
                      {s.preview}
                    </div>
                  )}
                  <div className="text-[9px] text-muted-foreground mt-0.5 pl-4 uppercase tracking-wider">
                    {fmtRelative(s.lastMessageAt)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Conversation + composer */}
      <div className="flex flex-col min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4 max-w-3xl w-full mx-auto"
        >
          {!active && (
            <div className="text-sm text-muted-foreground italic mt-12 text-center">
              Pick a session, or start a new one.
            </div>
          )}
          {active && active.messages.length === 0 && (
            <OnboardingBanner
              title="New session"
              body="Drop a question, paste a snippet, or pick a Quick task on the right. The analyst will pick it up from there."
              cta="Try: morning thesis sweep"
              template="Run a 1-minute thesis sweep across your covered names. For each: is the thesis intact, what's the single most important data point this week, and is there an action item?"
              onInject={(t) => setInput(t)}
            />
          )}
          {active?.messages.map((m) => (
            <Bubble
              key={m.id}
              msg={m}
              counterparty={counterparty}
              onAskSubmit={handleAskSubmit}
            />
          ))}
        </div>

        <div className="border-t border-border bg-background/80 px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-2">
            <Textarea
              placeholder={placeholder ?? 'Ask anything. Shift+Enter for newline.'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="min-h-[56px] max-h-[160px] resize-none"
              disabled={!active}
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Select
                  value={model}
                  onChange={(e) => setModel(e.target.value as ChatModel)}
                  aria-label="Model"
                >
                  {(Object.keys(MODEL_LABEL) as ChatModel[]).map((m) => (
                    <option key={m} value={m}>
                      {MODEL_LABEL[m]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={thinking}
                  onChange={(e) => setThinking(e.target.value as ThinkingMode)}
                  aria-label="Thinking mode"
                >
                  <option value="standard">Standard</option>
                  <option value="extended">Extended thinking</option>
                </Select>
                {thinking === 'extended' && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Brain className="w-3 h-3 text-primary" />
                    higher latency · higher cost
                  </span>
                )}
              </div>
              <Button onClick={() => send(input)} disabled={!input.trim() || !active} size="sm">
                <Send className="w-3.5 h-3.5" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>

      {hasRail && (
        <aside className="border-l border-border bg-background/40 overflow-y-auto scrollbar-thin flex flex-col">
          {rightRailTabs && rightRailTabs.length > 0 ? (
            <>
              {rightRailTabs.length > 1 && (
                <div className="flex border-b border-border bg-background/60 sticky top-0 z-10">
                  {rightRailTabs.map((t) => {
                    const isActive = t.id === railTab;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setRailTab(t.id)}
                        className={cn(
                          'flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px flex items-center justify-center gap-1.5',
                          isActive
                            ? 'text-foreground border-primary'
                            : 'text-muted-foreground hover:text-foreground border-transparent',
                        )}
                      >
                        {t.label}
                        {t.badge != null && t.badge !== '' && (
                          <Badge
                            variant={isActive ? 'default' : 'secondary'}
                            className="text-[9px] h-4 px-1.5"
                          >
                            {t.badge}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {rightRailTabs.find((t) => t.id === railTab)?.content ?? null}
              </div>
            </>
          ) : (
            rightRail
          )}
        </aside>
      )}
    </div>
  );
}

function Bubble({
  msg,
  counterparty,
  onAskSubmit,
}: {
  msg: MasterAgentMessage;
  counterparty: CounterpartyAvatar;
  onAskSubmit: (requestId: string, answers: AskAnswers) => void;
}) {
  const isPM = msg.role === 'pm';
  return (
    <div className={cn('flex gap-3', isPM ? 'flex-row-reverse' : '')}>
      {isPM ? (
        <Avatar initials="PM" color="violet" size="sm" />
      ) : (
        <Avatar initials={counterparty.initials} color={counterparty.color} size="sm" />
      )}
      <div className="flex-1 min-w-0 max-w-[85%]">
        <div
          className={cn(
            'rounded-lg px-4 py-3 text-sm leading-relaxed border',
            isPM
              ? 'bg-primary text-primary-foreground border-primary inline-block'
              : 'bg-card text-card-foreground border-border',
          )}
        >
          <div className="whitespace-pre-line">{msg.text}</div>
          {!isPM && msg.todos && msg.todos.length > 0 && (
            <InlineTodoList todos={msg.todos} />
          )}
        </div>
        {!isPM && msg.ask && (
          <AskUserQuestionPanel
            requestId={msg.ask.requestId}
            questions={msg.ask.questions}
            answers={msg.answers}
            onSubmit={onAskSubmit}
          />
        )}
      </div>
    </div>
  );
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = (now - t) / 60000;
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${Math.floor(diffMin)}m ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.floor(diffHr)}h ago`;
  const diffDay = diffHr / 24;
  if (diffDay < 7) return `${Math.floor(diffDay)}d ago`;
  return new Date(iso).toLocaleDateString();
}
