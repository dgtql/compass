import { useState } from 'react';
import { Brain } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { ChatPane } from '@/components/ChatPane';
import { cn } from '@/lib/utils';

type Tab = 'chat' | 'deliverables' | 'tasks' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'deliverables', label: 'Deliverables' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'profile', label: 'Profile' },
];

export function MasterAgentView() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <div className="h-full flex flex-col">
      {/* Header (matches AnalystDetailView's compact header + tab bar) */}
      <div className="px-8 pt-5 pb-3 border-b border-border bg-background/60">
        <div className="flex items-start gap-3">
          <Avatar initials="MA" color="cyan" size="md" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Master agent</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              The PM's right hand. Reads everything; routes work; synthesizes across analysts.
            </p>
          </div>
        </div>

        <div className="flex gap-1 mt-3 -mb-3">
          {TABS.map((t) => {
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-2 rounded-t-md text-sm font-medium transition-colors -mb-px border-b-2',
                  isActive
                    ? 'text-foreground border-primary bg-background'
                    : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-accent/50',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {tab === 'chat' && (
          <ChatPane
            ownerKey="master"
            counterparty={{ initials: 'MA', color: 'cyan' }}
            counterpartyName="the master agent"
            placeholder="Ask the master agent anything — your pod, your memos, your notes."
            rightRailTabs={[
              {
                id: 'tasks',
                label: 'Tasks',
                content: (
                  <div className="p-4 text-xs text-muted-foreground italic">
                    The master agent doesn't run dispatcher tasks of its own —
                    it routes work to analysts. Cross-pod task aggregation lands in a later slice.
                  </div>
                ),
              },
              {
                id: 'files',
                label: 'Files',
                content: (
                  <div className="p-4 text-xs text-muted-foreground italic">
                    The master agent reads files across every analyst's engagements,
                    but doesn't keep its own corpus. A unified view lands in a later slice.
                  </div>
                ),
              },
            ]}
          />
        )}

        {tab === 'deliverables' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Deliverables</h2>
              <p className="text-xs text-muted-foreground">
                Cross-pod outputs the master agent produces — morning briefs, week-in-review syntheses.
              </p>
            </div>
            <div className="text-sm text-muted-foreground italic mt-8 text-center">
              No deliverables yet. Wired up in a later slice.
            </div>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-5xl mx-auto">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Tasks</h2>
              <p className="text-xs text-muted-foreground">
                Every task routed or scheduled by the master agent across the pod.
              </p>
            </div>
            <div className="text-sm text-muted-foreground italic mt-8 text-center">
              No tasks yet. Wired up in a later slice.
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="overflow-y-auto scrollbar-thin h-full p-6 max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  What the master agent does
                </CardTitle>
                <CardDescription>
                  The PM's right hand — not a single-ticker analyst.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>• Synthesize across analysts (morning brief, week-in-review).</p>
                <p>• Route ideas to the analyst best positioned to research them.</p>
                <p>• Read your knowledge base; pull relevant notes into answers.</p>
                <p>• Save new ideas you raise as notes in the knowledge base.</p>
                <p className="italic pt-2">Wired up in a later slice.</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
