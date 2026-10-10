// Starter page: shows the mock fleet so we know the wiring works.
// Kalin replaces this with the real fleet overview (C1/C2).

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { mockMachines } from "@/mocks";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Vending AI Agent</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Starter page with mock data. API contract: <code>api.md</code>.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {mockMachines.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>{m.name}</CardTitle>
              <CardDescription>
                {m.locationType} · {m.id} {!m.online && <Badge variant="destructive">offline</Badge>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Progress value={m.stockPercent} />
              <div>
                Stock {m.stockPercent}% · Today {m.salesToday.units} sold, €{m.salesToday.revenue.toFixed(2)}
              </div>
              {m.alerts.map((a) => (
                <div key={a.message} className="text-muted-foreground">⚠ {a.message}</div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
