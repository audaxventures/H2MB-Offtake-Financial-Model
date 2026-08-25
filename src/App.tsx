import { useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import type { ViewId } from '@/components/layout/Sidebar';
import { AssumptionsDashboard } from '@/components/views/AssumptionsDashboard';
import { RevenueStreams } from '@/components/views/RevenueStreams';
import { ExpenseItems } from '@/components/views/ExpenseItems';
import { AnnualSummary } from '@/components/views/AnnualSummary';
import { SourcesAndUses } from '@/components/views/SourcesAndUses';
import { ScenarioManager } from '@/components/views/ScenarioManager';
import { PDFExportLayout } from '@/components/export/PDFExportLayout';
import { GlobalValidationBanners } from '@/components/shared/GlobalValidationBanners';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { useScenarioStore } from '@/store/scenarioStore';
import { useModelOutputs } from '@/store/useModelOutputs';
import { useAuthStore } from '@/store/authStore';
import { useCloudSync } from '@/lib/cloudSync';

function App() {
  const [activeView, setActiveView] = useState<ViewId>('assumptions');
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
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

  const handleExportPDF = async () => {
    if (!pdfLayoutRef.current || isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const { exportToPDF } = await import('@/export/pdfExport');
      await exportToPDF(
        pdfLayoutRef.current,
        `H2MB_Finance_Model_${current.name.replace(/\s+/g, '_')}.pdf`,
      );
    } finally {
      setIsExportingPDF(false);
    }
  };

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
        onExportPDF={handleExportPDF}
        bannerSlot={<GlobalValidationBanners />}
        email={email}
        syncStatus={syncStatus}
        onSignOut={logout}
      >
        {activeView === 'assumptions' && <AssumptionsDashboard />}
        {activeView === 'revenue' && <RevenueStreams />}
        {activeView === 'expenses' && <ExpenseItems />}
        {activeView === 'annual' && <AnnualSummary />}
        {activeView === 'sources' && <SourcesAndUses />}
      </AppShell>
      <ScenarioManager open={scenariosOpen} onOpenChange={setScenariosOpen} />

      <div style={{ position: 'fixed', top: 0, left: -100000 }} aria-hidden="true">
        <PDFExportLayout ref={pdfLayoutRef} scenario={current} outputs={outputs} />
      </div>
    </>
  );
}

export default App;
