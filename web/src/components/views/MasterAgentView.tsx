import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Brain } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { mockMasterMessages, mockSuggestedPrompts } from '@/mocks/data';
import type { MasterAgentMessage } from '@/types/domain';

export function MasterAgentView() {
  const [messages, setMessages] = useState<MasterAgentMessage[]>(mockMasterMessages);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: MasterAgentMessage = {
      id: 'pm-' + Date.now(),
      role: 'pm',
      text: trimmed,
      ts: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    // Mock reply
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: 'mm-' + Date.now(),
          role: 'master',
          text: '(mocked) I will route this to the right analyst once the master agent is wired in slice 13.',
          ts: new Date().toISOString(),
        },
      ]);
    }, 600);
  }

  return (
    <div className="h-full grid grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex flex-col h-full">
        <div className="px-6 pt-5 pb-3 border-b border-border bg-background/60">
          <div className="flex items-center gap-3">
            <Avatar initials="MA" color="cyan" />
            <div>
              <h1 className="text-lg font-semibold">Master agent</h1>
              <p className="text-xs text-muted-foreground">
                The PM's right hand. Reads everything; routes work; synthesizes across analysts.
              </p>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4 max-w-3xl mx-auto w-full">
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
        </div>

        <div className="border-t border-border p-4 bg-background/80">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <Textarea
              placeholder="Ask anything. Shift+Enter for newline."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="min-h-[44px] max-h-[140px]"
            />
            <Button onClick={() => send(input)} disabled={!input.trim()}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <aside className="border-l border-border bg-background/40 overflow-y-auto scrollbar-thin">
        <Card className="m-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              Suggested prompts
            </CardTitle>
            <CardDescription className="text-xs">Click to fill the box.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {mockSuggestedPrompts.map((p) => (
                <li key={p}>
                  <button
                    onClick={() => setInput(p)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="mx-4 mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="w-3.5 h-3.5 text-primary" />
              What it can do
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p>• Synthesize across analysts (morning brief, week-in-review).</p>
            <p>• Route ideas to the analyst best positioned to research them.</p>
            <p>• Read your knowledge base; pull relevant notes into answers.</p>
            <p>• Save new ideas you raise as notes in the knowledge base.</p>
            <p className="italic pt-2">Wired up in slice 13.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Bubble({ msg }: { msg: MasterAgentMessage }) {
  const isPM = msg.role === 'pm';
  return (
    <div className={cn('flex gap-3', isPM ? 'flex-row-reverse' : '')}>
      {isPM ? (
        <Avatar initials="PM" color="violet" size="sm" />
      ) : (
        <Avatar initials="MA" color="cyan" size="sm" />
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
