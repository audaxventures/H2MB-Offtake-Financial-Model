import { Download, FileSpreadsheet, FileText, Layers, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopNavProps {
  title: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenScenarios: () => void;
  onExportExcel: () => void;
  onExportPDF: () => void;
}

export function TopNav({
  title,
  darkMode,
  onToggleDarkMode,
  onOpenScenarios,
  onExportExcel,
  onExportPDF,
}: TopNavProps) {
  return (
    <header className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
      <h1 className="text-base font-semibold sm:text-lg">{title}</h1>

      <div className="flex items-center gap-2">
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
            <DropdownMenuItem onSelect={onExportPDF}>
              <FileText />
              Export to PDF (Summary)
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
      </div>
    </header>
  );
}
