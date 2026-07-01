import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnnualResult } from '@/engine/types';
import { DSCR_DANGER, DSCR_TARGET } from '@/engine/calculations';
import { formatDSCR } from '@/engine/formatters';

interface DSCRChartProps {
  annual: AnnualResult[];
}

function colorFor(dscr: number): string {
  if (dscr >= DSCR_TARGET) return '#3B6D11';
  if (dscr >= DSCR_DANGER) return '#854F0B';
  return '#A32D2D';
}

export function DSCRChart({ annual }: DSCRChartProps) {
  const data = annual
    .filter((a) => a.dscr !== null)
    .map((a) => ({ year: `Year ${a.year}`, DSCR: a.dscr as number }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 88, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="year" fontSize={12} />
        <YAxis fontSize={12} tickFormatter={(v) => `${v}x`} width={40} />
        <Tooltip formatter={(v) => formatDSCR(Number(v))} />
        <ReferenceLine
          y={DSCR_TARGET}
          stroke="#1F4E79"
          strokeDasharray="4 4"
          label={{ value: '1.25x target', position: 'right', fontSize: 11, fill: '#1F4E79' }}
        />
        <Bar dataKey="DSCR" radius={[4, 4, 0, 0]}>
          {data.map((d, index) => (
            <Cell key={index} fill={colorFor(d.DSCR)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
