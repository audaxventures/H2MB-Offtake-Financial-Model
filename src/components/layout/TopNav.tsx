import { Cloud, CloudOff, Download, FileSpreadsheet, FileText, Layers, LogOut, Moon, RefreshCw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SyncStatus } from '@/lib/cloudSync';
import { cn } from '@/lib/utils';

interface TopNavProps {
  title: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenScenarios: () => void;
  onExportExcel: () => void;
  onOpenPDFExport: () => void;
  email?: string | null;
  syncStatus?: SyncStatus;
  onSignOut?: () => void;
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  loading: 'Loading…',
  syncing: 'Syncing…',
  synced: 'Synced',
  error: 'Sync error',
  offline: 'Offline',
};

function SyncIndicator({ status }: { status: SyncStatus }) {
  const Icon = status === 'error' || status === 'offline' ? CloudOff : status === 'syncing' || status === 'loading' ? RefreshCw : Cloud;
  return (
    <span
      className={cn(
        'text-muted-foreground hidden items-center gap-1.5 text-xs sm:flex',
        status === 'error' && 'text-h2mb-danger',
      )}
      title={SYNC_LABEL[status]}
    >
      <Icon className={cn('size-3.5', (status === 'syncing' || status === 'loading') && 'animate-spin')} />
      {SYNC_LABEL[status]}
    </span>
  );
}

export function TopNav({
  title,
  darkMode,
  onToggleDarkMode,
  onOpenScenarios,
  onExportExcel,
  onOpenPDFExport,
  email,
  syncStatus,
  onSignOut,
}: TopNavProps) {
  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
      <h1 className="text-base font-semibold sm:text-lg">{title}</h1>

      <div className="flex items-center gap-2">
        {syncStatus && <SyncIndicator status={syncStatus} />}

        <Button variant="outline" size="sm" onClick={onOpenScenarios}>
          <Layers />
          Scenarios
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onExportExcel}>
              <FileSpreadsheet />
              Export to Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenPDFExport}>
              <FileText />
              Export to PDF…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="icon"
          aria-label="Toggle dark mode"
          onClick={onToggleDarkMode}
        >
          {darkMode ? <Sun /> : <Moon />}
        </Button>

        {onSignOut && (
          <Button variant="outline" size="icon" aria-label={email ? `Sign out (${email})` : 'Sign out'} onClick={onSignOut}>
            <LogOut />
          </Button>
        )}
      </div>
    </header>
  );
}
