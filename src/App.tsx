import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { ViewId } from '@/components/layout/Sidebar';
import { AssumptionsDashboard } from '@/components/views/AssumptionsDashboard';
import { RevenueStreams } from '@/components/views/RevenueStreams';
import { ExpenseItems } from '@/components/views/ExpenseItems';
import { ProfitAndLoss } from '@/components/views/ProfitAndLoss';
import { CashFlowStatement } from '@/components/views/CashFlowStatement';
import { SourcesAndUses } from '@/components/views/SourcesAndUses';
import { ScenarioManager } from '@/components/views/ScenarioManager';
import { PDFExportLayout } from '@/components/export/PDFExportLayout';
import { PDFExportDialog } from '@/components/export/PDFExportDialog';
import { GlobalValidationBanners } from '@/components/shared/GlobalValidationBanners';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';
import { useAuthStore } from '@/store/authStore';
import { useCloudSync } from '@/lib/cloudSync';
import type { PDFSectionId } from '@/export/pdfSections';
import type { StatementDetail } from '@/lib/statementRows';

interface PDFExportConfig {
  sections: PDFSectionId[];
  detail: StatementDetail;
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>('assumptions');
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [pdfConfig, setPdfConfig] = useState<PDFExportConfig | null>(null);
  const pdfLayoutRef = useRef<HTMLDivElement>(null);

  const token = useAuthStore((s) => s.token);
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const syncStatus = useCloudSync();

  const current = useScenarioStore((s) => s.current);
  const outputs = useModelOutputs();

  const handleExportExcel = async () => {
    const { exportToExcel } = await import('@/export/excelExport');
    exportToExcel(current, outputs);
  };

  const handleGeneratePDF = (sections: PDFSectionId[], detail: StatementDetail) => {
    setIsExportingPDF(true);
    setPdfConfig({ sections, detail });
  };

  // Runs after PDFExportLayout has re-rendered with the chosen sections/detail
  // (React commits the DOM before this effect fires), so the hidden layout
  // reflects pdfConfig by the time we capture it.
  useEffect(() => {
    if (!pdfConfig || !pdfLayoutRef.current) return;
    let cancelled = false;
    (async () => {
      const { exportToPDF } = await import('@/export/pdfExport');
      const pages = Array.from(pdfLayoutRef.current?.children ?? []) as HTMLElement[];
      try {
        await exportToPDF(pages, `H2MB_Finance_Model_${current.name.replace(/\s+/g, '_')}.pdf`);
      } finally {
        if (!cancelled) {
          setIsExportingPDF(false);
          setPdfConfig(null);
          setPdfDialogOpen(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfConfig]);

  if (!token) {
    return <LoginScreen />;
  }

  return (
    <>
      <AppShell
        activeView={activeView}
        onNavigate={setActiveView}
        onOpenScenarios={() => setScenariosOpen(true)}
        onExportExcel={handleExportExcel}
        onOpenPDFExport={() => setPdfDialogOpen(true)}
        bannerSlot={<GlobalValidationBanners />}
        email={email}
        syncStatus={syncStatus}
        onSignOut={logout}
      >
        {activeView === 'assumptions' && <AssumptionsDashboard />}
        {activeView === 'revenue' && <RevenueStreams />}
        {activeView === 'expenses' && <ExpenseItems />}
        {activeView === 'pnl' && <ProfitAndLoss />}
        {activeView === 'cashflow' && <CashFlowStatement />}
        {activeView === 'sources' && <SourcesAndUses />}
      </AppShell>
      <ScenarioManager open={scenariosOpen} onOpenChange={setScenariosOpen} />
      <PDFExportDialog
        open={pdfDialogOpen}
        onOpenChange={setPdfDialogOpen}
        onGenerate={handleGeneratePDF}
        isGenerating={isExportingPDF}
      />

      <div style={{ position: 'fixed', top: 0, left: -100000 }} aria-hidden="true">
        <PDFExportLayout
          ref={pdfLayoutRef}
          scenario={current}
          outputs={outputs}
          sections={pdfConfig?.sections ?? []}
          detail={pdfConfig?.detail ?? 'detailed'}
        />
      </div>
    </>
  );
}

export default App;
