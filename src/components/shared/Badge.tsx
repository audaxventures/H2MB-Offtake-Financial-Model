import { Badge as UIBadge } from '@/components/ui/badge';
import { formatDSCR } from '@/engine/formatters';
import { DSCR_DANGER, DSCR_TARGET } from '@/engine/calculations';

export function DSCRBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <UIBadge variant="outline">N/A</UIBadge>;
  }
  if (value >= DSCR_TARGET) {
    return <UIBadge variant="success">{formatDSCR(value)}</UIBadge>;
  }
  if (value >= DSCR_DANGER) {
    return <UIBadge variant="warning">{formatDSCR(value)}</UIBadge>;
  }
  return <UIBadge variant="danger">{formatDSCR(value)}</UIBadge>;
}

export function FundingStatusBadge({ isFullyFunded }: { isFullyFunded: boolean }) {
  return isFullyFunded ? (
    <UIBadge variant="success">Fully Funded</UIBadge>
  ) : (
    <UIBadge variant="danger">Funding Gap</UIBadge>
  );
}

export function ConstructionBadge() {
  return <UIBadge variant="construction">Construction</UIBadge>;
}

export function ITCBadge() {
  return <UIBadge variant="gold">⚡ ITC</UIBadge>;
}
