// The PDF report page of ONE business, inside that business's section (Bake Away or Hardware).
// The two reports are kept apart on purpose: sharing one never shows the other business's figures.
// Choose the period and what to include, see the report, then share it as a PDF, print it, or
// take it to Excel.
import { FileDown, Printer, Share, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, PageHead, PeriodPicker, SectionTitle, useNotice, usePeriod } from '../components/ui';
import { useData } from '../data/DataContext';
import { giveFile, toCsv } from '../lib/backup';
import { buildBusinessReport, reportRows } from '../lib/businessReport';
import { buildReportHtml } from '../lib/reportHtml';
import type { Section } from '../lib/types';

const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function BusinessReportPage({ section }: { section: Section }) {
  const d = useData();
  const notify = useNotice();
  const period = usePeriod('thisMonth');
  const [months, setMonths] = useState(true);
  const [owing, setOwing] = useState(true);
  const [busy, setBusy] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);
  const touch = useMemo(isTouch, []);
  const logoUrl = useMemo(() => new URL('./brand/logo.jpg', window.location.href).href, []);
  const name = section === 'bake' ? d.settings.bakeName : d.settings.hardwareName;

  const report = useMemo(() => buildBusinessReport(d, d.settings, period.period, { section, months, owing }, d.today), [d, period.period, section, months, owing]);
  const html = useMemo(() => buildReportHtml(report, logoUrl), [report, logoUrl]);

  // The preview grows to the report's full height, so the page scrolls as one.
  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const fit = () => {
      const h = f.contentDocument?.documentElement.scrollHeight;
      if (h) setHeight(h + 8);
    };
    f.addEventListener('load', fit);
    return () => f.removeEventListener('load', fit);
  }, [html]);

  const pdf = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { buildReportPdf } = await import('../lib/reportPdf');
      const blob = await buildReportPdf(report, logoUrl);
      await giveFile(`${report.fileStem}.pdf`, blob, 'application/pdf');
    } catch (e) {
      console.error(e);
      notify('The PDF could not be made. Try again.', 'bad');
    } finally {
      setBusy(false);
    }
  };
  const excel = () => {
    const [first, ...rest] = reportRows(report);
    return giveFile(`${report.fileStem}.csv`, toCsv(first, rest), 'text/csv');
  };
  const print = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };

  return (
    <>
      <PageHead eyebrow={period.period.label} title="PDF report" />
      <p className="mb-4 text-[15px] text-muted">
        Money in and money out for {name} only. Choose the period, check the report below, then share it as a PDF or print it.
      </p>

      <div className="card space-y-4 p-4">
        <div>
          <span className="label">Period</span>
          <PeriodPicker state={period} />
        </div>
        <div className="space-y-2">
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={months} onChange={(e) => setMonths(e.target.checked)} />
            <span>Month by month</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
            <span>{section === 'bake' ? 'Who owes you' : 'Who owes you, and whom you owe'}</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button icon={touch ? Share : FileDown} onClick={pdf} busy={busy} disabled={!d.ready}>
            {busy ? 'Making the PDF…' : touch ? 'Share PDF' : 'Download PDF'}
          </Button>
          {!touch && (
            <Button variant="plain" icon={Printer} onClick={print} disabled={!d.ready}>
              Print
            </Button>
          )}
          <Button variant="plain" icon={Table2} onClick={excel} disabled={!d.ready}>
            Excel
          </Button>
        </div>
        {touch && <p className="text-xs text-muted">To print from the phone: Share PDF, then choose Print.</p>}
      </div>

      <SectionTitle>Preview</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <iframe ref={frame} title={`${name} report preview`} srcDoc={html} className="block w-full border-0" style={{ height }} />
      </div>
    </>
  );
}
