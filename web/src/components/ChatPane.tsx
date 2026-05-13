import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Send, Brain } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { MasterAgentMessage } from '@/types/domain';

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
  /** Avatar shown next to assistant messages (analyst or master agent). */
  counterparty: CounterpartyAvatar;
  /** Initial messages (mock for now; will be persistent in a later slice). */
  initialMessages: MasterAgentMessage[];
  /** Placeholder text in the composer textarea. */
  placeholder?: string;
  /** Optional right-rail content (Quick tasks, suggested prompts, etc.). */
  rightRail?: ReactNode;
  /** Mock reply text when the user sends a message (no backend yet). */
  mockReply?: string;
};

export function ChatPane({
  counterparty,
  initialMessages,
  placeholder,
  rightRail,
  mockReply,
}: Props) {
  const [messages, setMessages] = useState<MasterAgentMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [model, setModel] = useState<ChatModel>('claude-sonnet-4-6');
  const [thinking, setThinking] = useState<ThinkingMode>('standard');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset conversation if the initialMessages change (e.g. switching analysts).
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const pmMsg: MasterAgentMessage = {
      id: 'pm-' + Date.now(),
      role: 'pm',
      text: trimmed,
      ts: new Date().toISOString(),
    };
    setMessages((m) => [...m, pmMsg]);
    setInput('');
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: 'ag-' + Date.now(),
          role: 'master',
          text:
            mockReply ??
            `(mocked · model=${model} · thinking=${thinking}) backend wiring lands in a future slice.`,
          ts: new Date().toISOString(),
        },
      ]);
    }, 600);
  }

  return (
    <div className={cn('h-full grid', rightRail ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1')}>
      <div className="flex flex-col min-h-0">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4 max-w-3xl w-full mx-auto"
        >
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground italic mt-12 text-center">
              Start the conversation.
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} counterparty={counterparty} />
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
              <Button onClick={() => send(input)} disabled={!input.trim()} size="sm">
                <Send className="w-3.5 h-3.5" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>

      {rightRail && (
        <aside className="border-l border-border bg-background/40 overflow-y-auto scrollbar-thin">
          {rightRail}
        </aside>
      )}
    </div>
  );
}

function Bubble({
  msg,
  counterparty,
}: {
  msg: MasterAgentMessage;
  counterparty: CounterpartyAvatar;
}) {
  const isPM = msg.role === 'pm';
  return (
    <div className={cn('flex gap-3', isPM ? 'flex-row-reverse' : '')}>
      {isPM ? (
        <Avatar initials="PM" color="violet" size="sm" />
      ) : (
        <Avatar initials={counterparty.initials} color={counterparty.color} size="sm" />
      )}
      <div
        className={cn(
          'rounded-lg px-4 py-3 max-w-[80%] text-sm leading-relaxed border',
          isPM
            ? 'bg-primary text-primary-foreground border-primary'
            : 'bg-card text-card-foreground border-border'
        )}
      >
        <div className="whitespace-pre-line">{msg.text}</div>
      </div>
    </div>
  );
}
