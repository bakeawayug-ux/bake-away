// Lays out the Business report as a real PDF file (A4), made on the phone or laptop itself, so it
// can go straight to WhatsApp, Mail or Files. Loaded only when a PDF is asked for, so the app
// stays small. It only lays out what businessReport.ts worked out.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ReportDoc, ReportTable } from './businessReport';

type RGB = [number, number, number];
const INK: RGB = [63, 31, 16];
const MUTED: RGB = [135, 106, 92];
const LINE: RGB = [240, 227, 215];
const PINK: RGB = [214, 48, 123];
const PINK_DARK: RGB = [179, 34, 95];
const PINK_SOFT: RGB = [252, 232, 241];
const BROWN_DARK: RGB = [109, 63, 39];
const BROWN_SOFT: RGB = [246, 236, 228];
const GOOD: RGB = [37, 122, 74];
const BAD: RGB = [201, 39, 31];

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // side margin, mm
const BOTTOM = PAGE_H - 18;

async function imageData(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildReportPdf(doc: ReportDoc, logoUrl: string): Promise<Blob> {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await imageData(logoUrl);
  let y = M;

  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      pdf.addPage();
      y = M;
    }
  };
  const text = (s: string, x: number, yy: number, size: number, color: RGB, style: 'normal' | 'bold' = 'normal', align: 'left' | 'right' | 'center' = 'left') => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(s, x, yy, { align });
  };
  const paragraph = (s: string, size: number, color: RGB) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(s, PAGE_W - 2 * M) as string[];
    const h = lines.length * size * 0.42;
    ensure(h + 1);
    pdf.setTextColor(...color);
    pdf.text(lines, M, y + size * 0.35);
    y += h + 1.5;
  };

  // ---------- header ----------
  if (logo) pdf.addImage(logo, 'JPEG', M, y, 22, 22);
  const tx = logo ? M + 27 : M;
  text(doc.title, tx, y + 7, 20, INK, 'bold');
  text(doc.owner, tx, y + 12.5, 9.5, MUTED);
  text(doc.periodLabel, tx, y + 17.5, 10.5, PINK_DARK, 'bold');
  text(`Made on ${doc.prepared}`, tx, y + 22, 8.5, MUTED);
  y += 26;
  pdf.setDrawColor(...PINK);
  pdf.setLineWidth(0.9);
  pdf.line(M, y, PAGE_W - M, y);
  y += 5;

  const drawTable = (t: ReportTable) => {
    const twoCol = !t.head.some(Boolean);
    ensure(14);
    text(t.title, M, y + 3.5, 10.5, INK, 'bold');
    y += 5.5;
    const columnStyles: Record<number, { halign: 'left' | 'right' }> = {};
    t.align.forEach((a, i) => (columnStyles[i] = { halign: a }));
    const body = t.rows.length ? t.rows : [[t.empty ?? 'Nothing to show.', ...t.head.slice(1).map(() => '')]];
    autoTable(pdf, {
      startY: y,
      margin: { left: M, right: M, bottom: PAGE_H - BOTTOM + 2 },
      head: twoCol ? undefined : [t.head],
      body,
      foot: t.foot ? [t.foot] : undefined,
      theme: 'plain',
      showHead: 'everyPage',
      showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 8.6, textColor: INK, cellPadding: { top: 1.4, bottom: 1.4, left: 1.8, right: 1.8 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fontStyle: 'bold', textColor: MUTED, fontSize: 7.8, lineWidth: { bottom: 0.45 }, lineColor: [230, 207, 191] },
      footStyles: { fontStyle: 'bold', textColor: INK, lineWidth: { top: 0.45, bottom: 0 }, lineColor: [230, 207, 191] },
      columnStyles,
      didParseCell: (data) => {
        // keep the header and total cells aligned with their columns
        data.cell.styles.halign = t.align[data.column.index] ?? 'left';
        if (data.section === 'body' && t.strong?.includes(data.row.index)) data.cell.styles.fontStyle = 'bold';
        if (data.section === 'body' && !t.rows.length) {
          data.cell.styles.textColor = MUTED;
          data.cell.styles.fontStyle = 'italic';
        }
      },
    });
    y = ((pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 2;
    if (t.note) paragraph(t.note, 7.6, MUTED);
    y += 2.5;
  };

  for (const s of doc.sections) {
    ensure(40);
    // section band
    const [bg, fg]: [RGB, RGB] = s.key === 'hardware' ? [BROWN_SOFT, BROWN_DARK] : [PINK_SOFT, PINK_DARK];
    pdf.setFillColor(...bg);
    pdf.roundedRect(M, y, PAGE_W - 2 * M, 9, 2, 2, 'F');
    text(s.title, M + 3, y + 6.3, 13, fg, 'bold');
    y += 12;
    if (s.intro) paragraph(s.intro, 8.4, MUTED);

    // cards: four across
    const gap = 3;
    const w = (PAGE_W - 2 * M - gap * 3) / 4;
    ensure(19);
    s.cards.forEach((c, i) => {
      const x = M + i * (w + gap);
      pdf.setDrawColor(...LINE);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(x, y, w, 17, 2, 2, 'S');
      text(c.label, x + 2.5, y + 4.8, 7.8, MUTED);
      const color = c.tone === 'good' ? GOOD : c.tone === 'bad' ? BAD : INK;
      pdf.setFont('helvetica', 'bold');
      let size = 11;
      pdf.setFontSize(size);
      while (pdf.getTextWidth(c.value) > w - 5 && size > 7) pdf.setFontSize((size -= 0.5));
      text(c.value, x + 2.5, y + 10.5, size, color, 'bold');
      if (c.sub) {
        pdf.setFontSize(6.8);
        const sub = pdf.splitTextToSize(c.sub, w - 5)[0] as string;
        text(sub, x + 2.5, y + 14.6, 6.8, [183, 162, 151]);
      }
    });
    y += 21;
    for (const t of s.tables) drawTable(t);
    y += 2;
  }

  // notes, kept together on one page
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.8);
  const notesHeight = 4 + sum(doc.notes.map((n) => (pdf.splitTextToSize(n, PAGE_W - 2 * M) as string[]).length * 7.8 * 0.42 + 1.5));
  ensure(notesHeight);
  pdf.setDrawColor(...LINE);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, PAGE_W - M, y);
  y += 3;
  for (const n of doc.notes) paragraph(n, 7.8, MUTED);

  // page numbers
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    text(`${doc.title} · ${doc.periodLabel}`, M, PAGE_H - 9, 7.5, [183, 162, 151]);
    text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 9, 7.5, [183, 162, 151], 'normal', 'right');
  }
  return pdf.output('blob');
}
