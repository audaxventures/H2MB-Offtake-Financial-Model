import { forwardRef } from 'react';
import {
  CapexPage,
  CoverPage,
  ExpensesPage,
  RevenuePage,
  SourcesUsesPage,
  StatementPage,
  type PDFSectionId,
} from '@/export/pdfSections';
import type { StatementDetail } from '@/lib/statementRows';
import type { ModelOutputs, Scenario } from '@/engine/types';

interface PDFExportLayoutProps {
  scenario: Scenario;
  outputs: ModelOutputs;
  sections: PDFSectionId[];
  detail: StatementDetail;
}

/**
 * Renders one direct child <div> per PDF page (always a Cover page, plus one
 * per selected section) into a single hidden container. pdfExport.ts walks
 * this container's children and captures each as its own landscape page.
 */
export const PDFExportLayout = forwardRef<HTMLDivElement, PDFExportLayoutProps>(
  function PDFExportLayout({ scenario, outputs, sections, detail }, ref) {
    return (
      <div ref={ref}>
        <CoverPage scenario={scenario} outputs={outputs} />
        {sections.includes('sourcesUses') && <SourcesUsesPage scenario={scenario} outputs={outputs} />}
        {sections.includes('pnl') && (
          <StatementPage scenario={scenario} outputs={outputs} statement="pnl" detail={detail} />
        )}
        {sections.includes('cashflow') && (
          <StatementPage scenario={scenario} outputs={outputs} statement="cashflow" detail={detail} />
        )}
        {sections.includes('revenue') && <RevenuePage scenario={scenario} outputs={outputs} detail={detail} />}
        {sections.includes('expenses') && <ExpensesPage scenario={scenario} outputs={outputs} detail={detail} />}
        {sections.includes('capex') && <CapexPage scenario={scenario} outputs={outputs} detail={detail} />}
      </div>
    );
  },
);
