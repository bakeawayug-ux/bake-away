// The first page after opening the app: one card per section with its live figures.
import { BookOpen, Boxes, CakeSlice, ChevronRight, Settings, Share, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadNotice, SyncChip } from '../components/Layout';
import { OrderRow } from '../components/rows';
import { List, SectionTitle } from '../components/ui';
import { useData } from '../data/DataContext';
import { addDays, longToday } from '../lib/dates';
import { SECTIONS } from '../lib/sections';

function isIphoneBrowser(): boolean {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !installed;
}

function InstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('bakeaway.installHint') === 'hidden';
    } catch {
      return false;
    }
  });
  if (hidden || !isIphoneBrowser()) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem('bakeaway.installHint', 'hidden');
    } catch {
      /* nothing to remember */
    }
  };
  return (
    <div className="card mb-4 flex items-start gap-3 bg-butter-soft p-4">
      <Share size={20} className="mt-0.5 shrink-0 text-accent-dark" aria-hidden />
      <div className="min-w-0 flex-1 text-[15px]">
        <p className="font-semibold">Put Bake Away on your Home Screen</p>
        <p className="mt-0.5 text-muted">
          In Safari, tap the Share button, then <b>Add to Home Screen</b>. It then opens like any other app, full screen, even with no signal.
        </p>
      </div>
      <button type="button" aria-label="Hide this tip" onClick={hide} className="-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted">
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={`num truncate font-semibold ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

/**
 * Home shows NO money: each business's figures stay inside that business (Evelyn, 11 Nov 2026:
 * the two businesses must never appear side by side in shillings). Only counts that say what
 * needs doing are shown here.
 */
export function Home() {
  const d = useData();
  const week = addDays(d.today, 7);
  const open = d.orders.filter((o) => d.orderTotalsById.get(o.id)?.open).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const thisWeek = open.filter((o) => o.dueDate <= week);
  const lowCount = d.items.filter((i) => !i.archived && d.levels.get(i.id)?.low).length;
  const lateCount = open.filter((o) => d.orderTotalsById.get(o.id)?.late).length;
  const pinnedBake = d.notes.filter((n) => n.section === 'bake' && n.pinned && !n.done).length;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pinned = d.notes.filter((n) => n.pinned && !n.done);

  return (
    <div className="h-full overflow-y-auto" id="page-scroll">
      <div className="pt-safe px-safe pb-safe mx-auto w-full max-w-3xl md:px-8">
        <header className="flex items-center gap-4 pt-6 pb-5">
          <img src="./brand/logo.jpg" alt="Bake Away: quality is our recipe" className="h-20 w-20 rounded-2xl border border-line bg-white object-contain md:h-24 md:w-24" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{longToday()}</p>
            <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {greeting}, {d.settings.ownerName}
            </h1>
            <div className="mt-1">
              <SyncChip />
            </div>
          </div>
        </header>

        <LoadNotice />
        <InstallHint />

        <div className="grid gap-4 md:grid-cols-2">
          <Link to={SECTIONS.bake.base} data-section="bake" className="card block p-5 transition-colors hover:border-accent-line active:bg-accent-soft">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white">
                <CakeSlice size={24} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold">{d.settings.bakeName}</h2>
                <p className="truncate text-sm text-muted">{SECTIONS.bake.tagline}</p>
              </div>
              <ChevronRight size={22} className="text-faint" aria-hidden />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
              <Figure label="To bake, 7 days" value={String(thisWeek.length)} />
              <Figure label="Late orders" value={String(lateCount)} tone={lateCount ? 'text-cherry' : ''} />
              <Figure label="Pinned notes" value={String(pinnedBake)} />
            </div>
          </Link>

          <Link to={SECTIONS.hardware.base} data-section="hardware" className="card block p-5 transition-colors hover:border-accent-line active:bg-accent-soft">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white">
                <Boxes size={24} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold">{d.settings.hardwareName}</h2>
                <p className="truncate text-sm text-muted">{SECTIONS.hardware.tagline}</p>
              </div>
              <ChevronRight size={22} className="text-faint" aria-hidden />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
              <Figure label="Items in stock" value={String(d.items.filter((i) => !i.archived).length)} />
              <Figure label="Running low" value={lowCount ? `${lowCount} item${lowCount === 1 ? '' : 's'}` : 'None'} tone={lowCount ? 'text-amber' : ''} />
              <Figure label="Sales today" value={String(d.sales.filter((x) => x.date === d.today).length)} />
            </div>
          </Link>
        </div>

        {thisWeek.length > 0 && (
          <>
            <SectionTitle>To bake in the next seven days</SectionTitle>
            <List>
              {thisWeek.slice(0, 5).map((o) => (
                <OrderRow key={o.id} order={o} hideMoney />
              ))}
            </List>
          </>
        )}

        {pinned.length > 0 && (
          <>
            <SectionTitle>Pinned notes</SectionTitle>
            <div className="grid gap-2 md:grid-cols-2">
              {pinned.map((n) => (
                <Link key={n.id} to={`${SECTIONS[n.section].base}/notes`} className="rounded-2xl bg-butter-soft px-4 py-3">
                  <p className="truncate font-semibold">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm whitespace-pre-wrap text-muted">{n.body}</p>}
                </Link>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 flex flex-wrap gap-2 pb-8">
          <Link to="/settings" className="btn btn-plain btn-sm">
            <Settings size={16} aria-hidden /> Settings
          </Link>
          <Link to="/help" className="btn btn-plain btn-sm">
            <BookOpen size={16} aria-hidden /> User manual
          </Link>
        </div>
      </div>
    </div>
  );
}
