import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface AlertBannerProps {
  variant: 'success' | 'warning' | 'danger';
  title: string;
  description?: ReactNode;
}

const icons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function AlertBanner({ variant, title, description }: AlertBannerProps) {
  const Icon = icons[variant];
  return (
    <Alert variant={variant}>
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
    </Alert>
  );
}
