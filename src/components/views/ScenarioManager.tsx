import { useMemo, useState } from 'react';
import { Copy, Save, Trash2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { runModel } from '@/engine/calculations';
import {
  formatCurrencyCompact,
  formatDSCR,
  formatPercent,
} from '@/engine/formatters';
import { MAX_SAVED_SCENARIOS, useScenarioStore } from '@/store/scenarioStore';
import { cn } from '@/lib/utils';

interface ScenarioManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toneForName(name: string): 'bear' | 'base' | 'bull' | 'neutral' {
  const lower = name.toLowerCase();
  if (lower.includes('bear')) return 'bear';
  if (lower.includes('bull')) return 'bull';
  if (lower.includes('base')) return 'base';
  return 'neutral';
}

const toneStyles: Record<ReturnType<typeof toneForName>, string> = {
  bear: 'bg-h2mb-danger-bg',
  base: 'bg-h2mb-success-bg',
  bull: 'bg-h2mb-blue-bg',
  neutral: 'bg-muted/50',
};

export function ScenarioManager({ open, onOpenChange }: ScenarioManagerProps) {
  const current = useScenarioStore((s) => s.current);
  const savedScenarios = useScenarioStore((s) => s.savedScenarios);
  const compareIds = useScenarioStore((s) => s.compareIds);
  const saveScenario = useScenarioStore((s) => s.saveScenario);
  const loadScenario = useScenarioStore((s) => s.loadScenario);
  const duplicateScenario = useScenarioStore((s) => s.duplicateScenario);
  const deleteScenario = useScenarioStore((s) => s.deleteScenario);
  const toggleCompare = useScenarioStore((s) => s.toggleCompare);
  const setCurrentName = useScenarioStore((s) => s.setCurrentName);

  const [saveError, setSaveError] = useState<string | null>(null);

  const compareScenarios = useMemo(
    () => savedScenarios.filter((s) => compareIds.includes(s.id)),
    [savedScenarios, compareIds],
  );

  const comparisonRows = useMemo(
    () =>
      compareScenarios.map((scenario) => {
        const outputs = runModel(scenario);
        return { scenario, outputs };
      }),
    [compareScenarios],
  );

  const handleSave = () => {
    const result = saveScenario();
    if (!result.ok) {
      setSaveError(result.message ?? 'Could not save scenario.');
    } else {
      setSaveError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Scenario Manager</DialogTitle>
          <DialogDescription>
            Save, load, and compare up to {MAX_SAVED_SCENARIOS} named scenarios (e.g. "Bear
            Case", "Base Case", "Bull Case").
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex items-end gap-2">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="scenario-name">Current scenario name</Label>
              <Input
                id="scenario-name"
                value={current.name}
                onChange={(e) => setCurrentName(e.target.value)}
              />
            </div>
            <Button onClick={handleSave} disabled={savedScenarios.length >= MAX_SAVED_SCENARIOS && !savedScenarios.some((s) => s.id === current.id)}>
              <Save />
              Save Scenario
            </Button>
          </div>
          {saveError && <p className="text-h2mb-danger text-sm">{saveError}</p>}

          <div className="grid gap-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Saved Scenarios ({savedScenarios.length}/{MAX_SAVED_SCENARIOS})
            </p>
            {savedScenarios.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No scenarios saved yet. Name your current inputs above and click "Save Scenario".
              </p>
            )}
            <div className="grid gap-2">
              {savedScenarios.map((scenario) => {
                const isCurrent = scenario.id === current.id;
                const isComparing = compareIds.includes(scenario.id);
                return (
                  <Card key={scenario.id} className={cn('py-3', isCurrent && 'border-primary')}>
                    <CardContent className="flex items-center justify-between gap-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCompare(scenario.id)}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
                            isComparing
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'text-muted-foreground hover:bg-accent',
                          )}
                        >
                          {isComparing ? 'Comparing' : 'Compare'}
                        </button>
                        <div>
                          <p className="text-sm font-medium">
                            {scenario.name}
                            {isCurrent && <Badge className="ml-2 align-middle">Current</Badge>}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Saved {new Date(scenario.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => loadScenario(scenario.id)}>
                          <Upload />
                          Load
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Duplicate"
                          onClick={() => duplicateScenario(scenario.id)}
                          disabled={savedScenarios.length >= MAX_SAVED_SCENARIOS}
                        >
                          <Copy />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Delete"
                          onClick={() => deleteScenario(scenario.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {comparisonRows.length > 0 && (
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Comparison
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-h2mb-navy text-white">
                      <th className="p-2 text-left font-medium">Metric</th>
                      {comparisonRows.map(({ scenario }) => (
                        <th key={scenario.id} className="p-2 text-right font-medium">
                          {scenario.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <ComparisonRow
                      label="Revenue (5yr)"
                      rows={comparisonRows}
                      render={(o) => formatCurrencyCompact(o.totalRevenue5yr)}
                    />
                    <ComparisonRow
                      label="EBITDA (5yr)"
                      rows={comparisonRows}
                      render={(o) => formatCurrencyCompact(o.annual.reduce((acc, a) => acc + a.ebitda, 0))}
                    />
                    <ComparisonRow
                      label="Net Cash (5yr)"
                      rows={comparisonRows}
                      render={(o) => formatCurrencyCompact(o.totalNetCash5yr)}
                    />
                    <ComparisonRow
                      label="Equity IRR"
                      rows={comparisonRows}
                      render={(o) => (o.equityIRR !== null ? formatPercent(o.equityIRR, 1) : 'N/A')}
                    />
                    <ComparisonRow
                      label="Min DSCR"
                      rows={comparisonRows}
                      render={(o) => formatDSCR(o.minDSCR)}
                    />
                    <ComparisonRow
                      label="Payback Year"
                      rows={comparisonRows}
                      render={(o) => (o.equityPaybackYear ? `Year ${o.equityPaybackYear}` : 'N/A')}
                    />
                    <ComparisonRow
                      label="Funding Status"
                      rows={comparisonRows}
                      render={(o) => (o.sourcesAndUses.isFullyFunded ? 'Funded' : 'Gap')}
                    />
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComparisonRow({
  label,
  rows,
  render,
}: {
  label: string;
  rows: { scenario: { id: string; name: string }; outputs: ReturnType<typeof runModel> }[];
  render: (outputs: ReturnType<typeof runModel>) => string;
}) {
  return (
    <tr className="border-t">
      <td className="text-muted-foreground p-2">{label}</td>
      {rows.map(({ scenario, outputs }) => (
        <td
          key={scenario.id}
          className={cn('p-2 text-right font-medium tabular-nums', toneStyles[toneForName(scenario.name)])}
        >
          {render(outputs)}
        </td>
      ))}
    </tr>
  );
}
