import { Sparkles, Brain } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { ChatPane } from '@/components/ChatPane';
import { mockSuggestedPrompts } from '@/mocks/data';

export function MasterAgentView() {
  return (
    <div className="h-full flex flex-col">
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

      <div className="flex-1 min-h-0">
        <ChatPane
          ownerKey="master"
          counterparty={{ initials: 'MA', color: 'cyan' }}
          counterpartyName="the master agent"
          placeholder="Ask the master agent anything — your pod, your memos, your notes."
          rightRail={
            <div className="p-4 space-y-4">
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Suggested prompts
                  </CardTitle>
                  <CardDescription className="text-xs">Click to drop into the box.</CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ul className="space-y-1">
                    {mockSuggestedPrompts.map((p) => (
                      <li key={p}>
                        <div className="text-xs px-2 py-1.5 rounded hover:bg-accent transition-colors cursor-pointer">
                          {p}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                    What it can do
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 text-xs text-muted-foreground space-y-2">
                  <p>• Synthesize across analysts (morning brief, week-in-review).</p>
                  <p>• Route ideas to the analyst best positioned to research them.</p>
                  <p>• Read your knowledge base; pull relevant notes into answers.</p>
                  <p>• Save new ideas you raise as notes in the knowledge base.</p>
                  <p className="italic pt-2">Wired up in a later slice.</p>
                </CardContent>
              </Card>
            </div>
          }
        />
      </div>
    </div>
  );
}
