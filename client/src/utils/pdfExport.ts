import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface PdfExportOptions {
  filename: string;
  removeSelector?: string;
  margin?: number;
  scale?: number;
}

export const exportElementAsPdf = async (
  source: HTMLElement,
  options: PdfExportOptions
) => {
  const margin = options.margin ?? 32;
  const scale = options.scale ?? (window.devicePixelRatio > 1 ? window.devicePixelRatio : 2);

  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  clone.style.height = 'auto';
  clone.style.width = `${source.offsetWidth}px`;
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.backgroundColor = '#ffffff';

  const hiddenElements = clone.querySelectorAll('[data-export-hidden="true"]');
  hiddenElements.forEach((element) => element.remove());

  if (options.removeSelector) {
    const extra = clone.querySelectorAll(options.removeSelector);
    extra.forEach((element) => element.remove());
  }

  document.body.appendChild(clone);

  try {
    const canvas = await html2canvas(clone, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true
    });

    const pdf = new jsPDF('p', 'pt', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const pdfScale = usableWidth / canvas.width;
    const sliceHeight = usableHeight / pdfScale;
    const totalHeight = canvas.height;

    for (let offset = 0, pageIndex = 0; offset < totalHeight; offset += sliceHeight, pageIndex++) {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      const pageHeightPx = Math.min(sliceHeight, totalHeight - offset);
      pageCanvas.height = Math.max(1, Math.floor(pageHeightPx));
      const pageContext = pageCanvas.getContext('2d');
      if (!pageContext) {
        continue;
      }

      pageContext.drawImage(
        canvas,
        0,
        offset,
        canvas.width,
        pageHeightPx,
        0,
        0,
        canvas.width,
        pageCanvas.height
      );

      const imgHeight = pageCanvas.height * pdfScale;
      if (pageIndex > 0) {
        pdf.addPage();
      }
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, usableWidth, imgHeight);
    }

    pdf.save(options.filename);
  } finally {
    if (clone.parentNode) {
      clone.parentNode.removeChild(clone);
    }
  }
};
