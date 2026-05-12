import { useEffect, useState } from 'react';
import { Download, LineChart, Sparkles, FileText, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { MemoListItem } from '@/types/api';

type Props = {
  ticker: string | null;
  onStartTask: (type: string, params?: Record<string, unknown>) => Promise<void>;
  refreshNonce: number;
  onOpenMemo: (type: string, date: string) => void;
};

export function DashboardTab({ ticker, onStartTask, refreshNonce, onOpenMemo }: Props) {
  const [memos, setMemos] = useState<MemoListItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) {
      setMemos([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .listMemos(ticker)
      .then((rows) => {
        if (!cancelled) setMemos(rows);
      })
      .catch(() => {
        if (!cancelled) setMemos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, refreshNonce]);

  if (!ticker) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>No project selected</CardTitle>
            <CardDescription>
              Add a ticker in the left sidebar, or pick an existing one to see its dashboard.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const latestMemo = memos[0];

  return (
    <div className="p-6 space-y-4 max-w-6xl">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticker}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Project dashboard — start an ingestion task or open a memo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Actions card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Run a task
            </CardTitle>
            <CardDescription>Background work runs on the server.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onStartTask('fetch_filing', { form: '10-K' })}
            >
              <Download className="w-3.5 h-3.5" />
              Fetch 10-K
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onStartTask('fetch_filing', { form: '10-Q' })}
            >
              <Download className="w-3.5 h-3.5" />
              Fetch 10-Q
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onStartTask('snapshot')}
            >
              <LineChart className="w-3.5 h-3.5" />
              Yahoo snapshot
            </Button>
            <Button
              variant="default"
              className="w-full justify-start"
              onClick={() => onStartTask('research', { memo_type: 'pitch' })}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate pitch memo
              <span className="ml-auto text-[10px] text-primary-foreground/70">~4 min</span>
            </Button>
          </CardContent>
        </Card>

        {/* Latest memo card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Latest memo
            </CardTitle>
            <CardDescription>
              {loading ? 'Loading…' : memos.length ? `${memos.length} memo${memos.length === 1 ? '' : 's'} on file.` : 'None yet.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latestMemo ? (
              <button
                onClick={() => onOpenMemo(latestMemo.type, latestMemo.date)}
                className="w-full text-left p-3 rounded-md border border-border bg-background hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium capitalize text-sm">{latestMemo.type}</span>
                  <Badge variant="outline" className="text-[10px]">{latestMemo.date}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {(latestMemo.size_bytes / 1024).toFixed(1)} KB
                </div>
              </button>
            ) : (
              <div className="text-sm text-muted-foreground">
                <AlertCircle className="inline-block w-4 h-4 -translate-y-0.5 mr-1" />
                Run “Generate pitch memo” to create one.
              </div>
            )}
          </CardContent>
        </Card>

        {/* All memos card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> All memos
            </CardTitle>
            <CardDescription>Click a row to open it.</CardDescription>
          </CardHeader>
          <CardContent>
            {memos.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Empty.</div>
            ) : (
              <ul className="space-y-1">
                {memos.map((m) => (
                  <li key={`${m.type}-${m.date}`}>
                    <button
                      onClick={() => onOpenMemo(m.type, m.date)}
                      className="w-full text-left text-sm py-1.5 px-2 rounded hover:bg-accent flex justify-between items-center"
                    >
                      <span className="capitalize">{m.type}</span>
                      <span className="text-xs text-muted-foreground">{m.date}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
