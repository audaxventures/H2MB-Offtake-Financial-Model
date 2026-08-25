import { useEffect, type ReactNode } from 'react';
import { Sidebar, type ViewId } from './Sidebar';
import { TopNav } from './TopNav';
import { useScenarioStore } from '@/store/scenarioStore';

const VIEW_TITLES: Record<ViewId, string> = {
  assumptions: 'Assumptions Dashboard',
  revenue: 'Revenue Streams',
  expenses: 'Expense Items',
  annual: 'Annual Summary',
  sources: 'Sources & Uses / ITC Analysis',
};

interface AppShellProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onOpenScenarios: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
  bannerSlot?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  activeView,
  onNavigate,
  onOpenScenarios,
  onExportExcel,
  onExportPDF,
  bannerSlot,
  children,
}: AppShellProps) {
  const darkMode = useScenarioStore((s) => s.darkMode);
  const toggleDarkMode = useScenarioStore((s) => s.toggleDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <div className="bg-background flex h-svh w-full overflow-hidden">
      <Sidebar active={activeView} onNavigate={onNavigate} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          title={VIEW_TITLES[activeView]}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          onOpenScenarios={onOpenScenarios}
          onExportExcel={onExportExcel}
          onExportPDF={onExportPDF}
        />
        {bannerSlot && <div className="flex flex-col gap-2 px-4 pt-4 sm:px-6">{bannerSlot}</div>}
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6" id="model-export-root">
          {children}
        </main>
      </div>
    </div>
  );
}
