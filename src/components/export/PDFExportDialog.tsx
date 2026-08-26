import { useState } from 'react';
import { FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PDF_SECTION_LABELS, PDF_SECTION_ORDER, type PDFSectionId } from '@/export/pdfSections';
import type { StatementDetail } from '@/lib/statementRows';

interface PDFExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (sections: PDFSectionId[], detail: StatementDetail) => void;
  isGenerating: boolean;
}

const DEFAULT_SECTIONS: PDFSectionId[] = ['sourcesUses', 'pnl', 'cashflow'];

export function PDFExportDialog({ open, onOpenChange, onGenerate, isGenerating }: PDFExportDialogProps) {
  const [sections, setSections] = useState<Set<PDFSectionId>>(new Set(DEFAULT_SECTIONS));
  const [detail, setDetail] = useState<StatementDetail>('detailed');

  const toggleSection = (id: PDFSectionId, checked: boolean) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to PDF</DialogTitle>
          <DialogDescription>
            Choose which reports to include and how much detail to show. Always includes a cover
            page with headline KPIs and charts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">Include</Label>
          {PDF_SECTION_ORDER.map((id) => (
            <div key={id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label className="text-sm font-normal">{PDF_SECTION_LABELS[id]}</Label>
              <Switch
                checked={sections.has(id)}
                onCheckedChange={(checked) => toggleSection(id, checked)}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          <Label className="text-muted-foreground text-xs tracking-wide uppercase">Detail Level</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={detail}
            onValueChange={(v) => v && setDetail(v as StatementDetail)}
          >
            <ToggleGroupItem value="summary">Summary</ToggleGroupItem>
            <ToggleGroupItem value="detailed">Detailed</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            Summary shows headline totals only; Detailed shows every line item, year by year.
          </p>
        </div>

        <DialogFooter>
          <Button
            onClick={() => onGenerate(Array.from(sections), detail)}
            disabled={isGenerating}
          >
            <FileText />
            {isGenerating ? 'Generating…' : 'Generate PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
