import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatementTable } from '@/components/shared/StatementTable';
import { RevenueEBITDAChart } from '@/components/charts/RevenueEBITDAChart';
import { buildProfitAndLossRows } from '@/lib/statementRows';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

export function ProfitAndLoss() {
  const current = useScenarioStore((s) => s.current);
  const outputs = useModelOutputs();
  const { annual } = outputs;

  const rows = useMemo(() => buildProfitAndLossRows(current, annual), [current, annual]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{annual.length}-Year Profit &amp; Loss Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <StatementTable annual={annual} rows={rows} />
          <p className="text-muted-foreground mt-2 text-xs">
            Revenue, cost of goods, operating expenses, and net profit (loss) only — capital
            expenditures, debt principal, and cash movement are on the Cash Flow Statement.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Revenue &amp; EBITDA vs. Total Costs</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueEBITDAChart
            annual={annual}
            itcReceivedYear={outputs.periods.find((p) => p.itcReceived > 0)?.year ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
