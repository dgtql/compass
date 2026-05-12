import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function AuditTab() {
  return (
    <div className="p-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>
            Coming in a later slice. The SQLite ``audit`` table already records every tool call
            (run <code className="text-primary">compass evidence audit</code> in the terminal to
            see it). A live UI for this lands when sessions / multi-user arrive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground">
            For now, every tool call your tasks fire is also visible in the Tasks panel in the
            sidebar (expand a task to see its event stream).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
