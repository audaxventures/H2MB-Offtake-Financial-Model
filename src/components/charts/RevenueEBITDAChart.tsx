import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnnualResult } from '@/engine/types';
import { formatCurrencyCompact } from '@/engine/formatters';

interface RevenueEBITDAChartProps {
  annual: AnnualResult[];
  itcReceivedYear: number | null;
}

export function RevenueEBITDAChart({ annual, itcReceivedYear }: RevenueEBITDAChartProps) {
  const data = annual.map((a) => ({
    year: `Year ${a.year}`,
    Revenue: a.revenue,
    EBITDA: a.ebitda,
    'Total Costs': a.cogs + a.totalOperatingExpenses + a.interest + a.principal,
  }));

  const itcPoint = data.find((_, idx) => annual[idx].year === itcReceivedYear);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => formatCurrencyCompact(v)} width={64} />
        <Tooltip formatter={(v) => formatCurrencyCompact(Number(v))} />
        <Legend />
        <Bar dataKey="Revenue" fill="#2E75B6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="EBITDA" fill="#3B6D11" radius={[4, 4, 0, 0]} />
        <Line type="monotone" dataKey="Total Costs" stroke="#A32D2D" strokeWidth={2} dot={{ r: 3 }} />
        {itcPoint && (
          <ReferenceDot
            x={itcPoint.year}
            y={itcPoint.Revenue}
            r={0}
            ifOverflow="extendDomain"
            label={{ value: '★ ITC', position: 'top', fill: '#C9A227', fontSize: 13, fontWeight: 700 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
