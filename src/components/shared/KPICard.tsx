import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: string;
  subtext?: string;
  icon?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'gold';
  className?: string;
}

const toneStyles: Record<NonNullable<KPICardProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-h2mb-success',
  warning: 'text-h2mb-warning',
  danger: 'text-h2mb-danger',
  gold: 'text-h2mb-gold',
};

export function KPICard({
  label,
  value,
  subtext,
  icon,
  tone = 'default',
  className,
}: KPICardProps) {
  return (
    <Card className={cn('gap-2 py-4', className)}>
      <CardContent className="px-4">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </p>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', toneStyles[tone])}>
          {value}
        </p>
        {subtext && (
          <p className="text-muted-foreground mt-0.5 text-xs">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}
