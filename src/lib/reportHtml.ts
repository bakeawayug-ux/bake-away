// Lays out the Business report as a printable page (A4), for the preview inside the app and for
// Print. It only lays out what businessReport.ts worked out.
import type { ReportDoc, ReportTable } from './businessReport';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function table(t: ReportTable): string {
  const cls = (i: number) => (t.align[i] === 'right' ? ' class="r"' : '');
  const twoCol = !t.head.some(Boolean);
  const head = twoCol ? '' : `<thead><tr>${t.head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('')}</tr></thead>`;
  const body = t.rows.length
    ? t.rows.map((r, ri) => `<tr${t.strong?.includes(ri) ? ' class="strong"' : ''}>${r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${t.head.length}">${esc(t.empty ?? 'Nothing to show.')}</td></tr>`;
  const foot = t.foot ? `<tfoot><tr>${t.foot.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join('')}</tr></tfoot>` : '';
  const wide = t.head.length >= 5 ? ' wide' : '';
  return `<div class="block"><h3>${esc(t.title)}</h3><div class="scroll"><table class="${twoCol ? 'kv' : ''}${wide}">${head}<tbody>${body}</tbody>${foot}</table></div>${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}</div>`;
}

export function buildReportHtml(doc: ReportDoc, logoUrl: string): string {
  const sections = doc.sections
    .map(
      (s) => `
<section class="sec ${s.key}">
  <h2>${esc(s.title)}</h2>
  ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ''}
  <div class="cards">${s.cards
    .map((c) => `<div class="card ${c.tone ?? ''}"><div class="cl">${esc(c.label)}</div><div class="cv">${esc(c.value)}</div>${c.sub ? `<div class="cs">${esc(c.sub)}</div>` : ''}</div>`)
    .join('')}</div>
  ${s.tables.map(table).join('')}
</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} · ${esc(doc.periodLabel)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #3f1f10; font: 10.5pt/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #fff; }
  .page { max-width: 186mm; margin: 0 auto; padding: 8mm 0; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 10px; border-bottom: 3px solid #d6307b; }
  header img { width: 64px; height: 64px; object-fit: contain; border-radius: 12px; border: 1px solid #f0e3d7; }
  header h1 { margin: 0; font-size: 20pt; letter-spacing: -0.01em; }
  header .meta { color: #876a5c; font-size: 9.5pt; }
  header .period { margin-top: 2px; font-weight: 600; color: #b3225f; }
  .sec { margin-top: 16px; }
  .sec h2 { margin: 0 0 4px; font-size: 14pt; padding: 6px 10px; border-radius: 8px; background: #fce8f1; color: #b3225f; }
  .sec.hardware h2 { background: #f6ece4; color: #6d3f27; }
  .intro { margin: 4px 2px 8px; color: #876a5c; font-size: 9.5pt; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 4px; }
  .card { border: 1px solid #f0e3d7; border-radius: 10px; padding: 8px 10px; break-inside: avoid; }
  .cl { color: #876a5c; font-size: 8.5pt; }
  .cv { font-size: 12.5pt; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 2px; }
  .cs { color: #b7a297; font-size: 8pt; }
  .card.good .cv { color: #257a4a; }
  .card.bad .cv { color: #c9271f; }
  .block { margin-top: 12px; break-inside: avoid; }
  .block h3 { margin: 0 0 4px; font-size: 10.5pt; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 8.5pt; font-weight: 600; color: #876a5c; border-bottom: 1.5px solid #e6cfbf; padding: 4px 6px; }
  td { padding: 4px 6px; border-bottom: 1px solid #f3e9df; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; border-top: 1.5px solid #e6cfbf; border-bottom: none; }
  table.kv td:first-child { color: #5f4637; }
  tr.strong td { font-weight: 700; color: #3f1f10; border-top: 1px solid #e6cfbf; }
  td.empty { color: #b7a297; font-style: italic; }
  .note { margin: 3px 2px 0; color: #876a5c; font-size: 8.5pt; }
  .notes { margin-top: 18px; padding-top: 8px; border-top: 1px solid #f0e3d7; color: #876a5c; font-size: 8.5pt; }
  .notes p { margin: 3px 0; }
  footer { margin-top: 14px; text-align: center; color: #b7a297; font-size: 8pt; }
  .scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  @media screen and (max-width: 560px) {
    body { font-size: 10pt; }
    .page { padding: 12px; }
    .cards { grid-template-columns: repeat(2, 1fr); }
    header img { width: 52px; height: 52px; }
    header h1 { font-size: 16pt; }
    table.wide { font-size: 8.5pt; min-width: 520px; }
    table.wide th, table.wide td { padding: 4px 4px; }
  }
  @media print { .page { padding: 0; max-width: none; } }
</style></head>
<body><div class="page">
  <header>
    <img src="${esc(logoUrl)}" alt="">
    <div>
      <h1>${esc(doc.title)}</h1>
      <div class="meta">${esc(doc.owner)}</div>
      <div class="period">${esc(doc.periodLabel)}</div>
      <div class="meta">Made on ${esc(doc.prepared)}</div>
    </div>
  </header>
  ${sections}
  <div class="notes">${doc.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>
  <footer>${esc(doc.title)}</footer>
</div></body></html>`;
}
