import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnnualResult } from '@/engine/types';
import { formatCurrencyCompact } from '@/engine/formatters';

interface DebtWaterfallChartProps {
  annual: AnnualResult[];
}

export function DebtWaterfallChart({ annual }: DebtWaterfallChartProps) {
  const data = annual.map((a) => ({
    year: `Year ${a.year}`,
    'Debt Balance': a.closingDebtBalance,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => formatCurrencyCompact(v)} width={64} />
        <Tooltip formatter={(v) => formatCurrencyCompact(Number(v))} />
        <Bar dataKey="Debt Balance" radius={[4, 4, 0, 0]}>
          {data.map((_, index) => (
            <Cell key={index} fill="#1F4E79" fillOpacity={1 - index * 0.13} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
