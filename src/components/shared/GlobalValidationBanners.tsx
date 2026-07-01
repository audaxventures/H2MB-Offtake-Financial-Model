import { AlertBanner } from '@/components/shared/AlertBanner';
import { formatCurrency } from '@/engine/formatters';
import { useModelOutputs } from '@/store/useModelOutputs';

export function GlobalValidationBanners() {
  const outputs = useModelOutputs();
  const { validation } = outputs;

  const banners: React.ReactNode[] = [];

  if (validation.isOvercapitalized) {
    banners.push(
      <AlertBanner
        key="overcapitalized"
        variant="danger"
        title="Overcapitalised — reduce debt or increase CapEx"
        description="Total debt exceeds total uses. Reduce the debt facility or increase project costs on the Assumptions Dashboard before relying on these results."
      />,
    );
  }

  if (validation.fundingGap !== null) {
    banners.push(
      <AlertBanner
        key="funding-gap"
        variant="danger"
        title={`⚠ Funding gap of ${formatCurrency(validation.fundingGap)} — cannot close as structured`}
      />,
    );
  }

  if (validation.dscrDangerYears.length > 0) {
    banners.push(
      <AlertBanner
        key="dscr-danger"
        variant="danger"
        title={`DSCR falls below 0.8x in Year${validation.dscrDangerYears.length > 1 ? 's' : ''} ${validation.dscrDangerYears.join(', ')}`}
      />,
    );
  }

  if (validation.dscrWarningYears.length > 0) {
    banners.push(
      <AlertBanner
        key="dscr-warning"
        variant="warning"
        title={`DSCR is below the 1.25x covenant in Year${validation.dscrWarningYears.length > 1 ? 's' : ''} ${validation.dscrWarningYears.join(', ')}`}
      />,
    );
  }

  if (validation.irrBelowThreshold) {
    banners.push(
      <AlertBanner
        key="irr-warning"
        variant="warning"
        title="Equity IRR is below the minimum 8% investor threshold"
      />,
    );
  }

  if (banners.length === 0) return null;

  return <>{banners}</>;
}
