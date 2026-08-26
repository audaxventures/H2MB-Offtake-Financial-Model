import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatementTable } from '@/components/shared/StatementTable';
import { DebtWaterfallChart } from '@/components/charts/DebtWaterfallChart';
import { DSCRChart } from '@/components/charts/DSCRChart';
import { buildCashFlowRows } from '@/lib/statementRows';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';

export function CashFlowStatement() {
  const current = useScenarioStore((s) => s.current);
  const outputs = useModelOutputs();
  const { annual, equityPaybackYear } = outputs;

  const rows = useMemo(() => buildCashFlowRows(current, annual), [current, annual]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{annual.length}-Year Cash Flow Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <StatementTable annual={annual} rows={rows} equityPaybackYear={equityPaybackYear} />
          {equityPaybackYear && (
            <p className="text-muted-foreground mt-2 text-xs">
              Equity payback occurs in <span className="text-h2mb-success font-semibold">Year {equityPaybackYear}</span> (highlighted above).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Debt Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <DebtWaterfallChart annual={annual} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">DSCR by Year</CardTitle>
          </CardHeader>
          <CardContent>
            <DSCRChart annual={annual} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
