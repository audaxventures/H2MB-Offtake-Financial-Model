import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

/** Renders each element in `pages` as its own landscape letter page in one PDF, in order. */
export async function exportToPDF(pages: HTMLElement[], fileName: string): Promise<void> {
  if (pages.length === 0) return;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'letter',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    const imgData = canvas.toDataURL('image/png');
    const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const renderWidth = canvas.width * scale;
    const renderHeight = canvas.height * scale;
    const x = (pageWidth - renderWidth) / 2;
    const y = margin;

    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', x, y, renderWidth, renderHeight, undefined, 'FAST');
  }

  pdf.save(fileName);
}
