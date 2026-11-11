// The frame around every page inside a section.
// Laptop: a sidebar with the section's pages. iPhone: a top bar, bottom tabs and a + button,
// all kept clear of the notch and the home bar.
import { ArrowLeftRight, BookOpen, Cloud, CloudOff, Ellipsis, House, Plus, RefreshCw, Settings, Smartphone } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useData, type SyncState } from '../data/DataContext';
import { SECTIONS, activeItem, rememberSection } from '../lib/sections';
import type { Section } from '../lib/types';
import { useSheets } from './SheetHost';
import { Button, cx } from './ui';

const SYNC: Record<SyncState, { text: string; icon: typeof Cloud; tone: string }> = {
  device: { text: 'Kept on this device', icon: Smartphone, tone: 'text-muted' },
  saved: { text: 'Saved to the cloud', icon: Cloud, tone: 'text-leaf' },
  sending: { text: 'Sending changes', icon: RefreshCw, tone: 'text-amber' },
  offline: { text: 'No connection: changes wait on this device', icon: CloudOff, tone: 'text-amber' },
};

export function SyncChip({ short }: { short?: boolean }) {
  const { sync } = useData();
  const s = SYNC[sync];
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', s.tone)} title={s.text}>
      <s.icon size={14} aria-hidden />
      {short ? <span className="sr-only">{s.text}</span> : s.text}
    </span>
  );
}

export function useSectionName(section: Section): string {
  const { settings } = useData();
  return section === 'bake' ? settings.bakeName : settings.hardwareName;
}

function Sidebar({ section }: { section: Section }) {
  const def = SECTIONS[section];
  const { pathname } = useLocation();
  const active = activeItem(def.menu, pathname);
  const other: Section = section === 'bake' ? 'hardware' : 'bake';
  const name = useSectionName(section);
  const otherName = useSectionName(other);
  const sheets = useSheets();
  const link = 'flex min-h-10 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-muted hover:bg-page hover:text-ink';
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-card md:flex">
      <Link to="/" className="flex items-center gap-3 px-5 pt-5 pb-4">
        <img src="./brand/mark.png" alt="" className="h-11 w-11 rounded-xl border border-line bg-white object-contain" />
        <span>
          <span className="block text-lg leading-tight font-semibold">{name}</span>
          <span className="block text-xs text-muted">{def.tagline}</span>
        </span>
      </Link>
      <div className="px-3">
        <Button icon={Plus} className="w-full" onClick={() => sheets.open({ t: 'quick', section })}>
          Add
        </Button>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3" aria-label={`${name} pages`}>
        {def.menu.map((m) => (
          <Link key={m.to} to={m.to} aria-current={active === m.to ? 'page' : undefined} className={cx(link, active === m.to && 'bg-accent-soft !text-accent-dark')}>
            <m.icon size={18} aria-hidden />
            {m.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-line px-3 py-3">
        <Link to={SECTIONS[other].base} className={link}>
          <ArrowLeftRight size={18} aria-hidden />
          Switch to {otherName}
        </Link>
        <Link to="/" className={link}>
          <House size={18} aria-hidden />
          Home
        </Link>
        <NavLink to="/settings" className={link}>
          <Settings size={18} aria-hidden />
          Settings
        </NavLink>
        <NavLink to="/help" className={link}>
          <BookOpen size={18} aria-hidden />
          User manual
        </NavLink>
        <div className="px-3 pt-2">
          <SyncChip />
        </div>
      </div>
    </aside>
  );
}

function PhoneTop({ section }: { section: Section }) {
  const name = useSectionName(section);
  return (
    <header className="pt-safe border-b border-line bg-card md:hidden">
      <div className="px-safe flex h-12 items-center gap-2">
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-2" aria-label="Home">
          <img src="./brand/mark.png" alt="" className="h-8 w-8 rounded-lg border border-line bg-white object-contain" />
          <span className="truncate font-semibold">{name}</span>
        </Link>
        <SyncChip short />
      </div>
    </header>
  );
}

function PhoneTabs({ section }: { section: Section }) {
  const def = SECTIONS[section];
  const { pathname } = useLocation();
  const sheets = useSheets();
  const active = activeItem(def.menu, pathname);
  const tabs = def.menu.filter((m) => m.tab);
  const moreOn = !tabs.some((t) => t.to === active);
  const tab = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium';
  return (
    <nav className="pb-safe border-t border-line bg-card md:hidden" aria-label="Pages">
      <div className="flex">
        {tabs.map((m) => (
          <Link key={m.to} to={m.to} aria-current={active === m.to ? 'page' : undefined} className={cx(tab, active === m.to ? 'text-accent-dark' : 'text-muted')}>
            <m.icon size={22} strokeWidth={active === m.to ? 2.4 : 1.9} aria-hidden />
            {m.label}
          </Link>
        ))}
        <button type="button" className={cx(tab, moreOn ? 'text-accent-dark' : 'text-muted')} onClick={() => sheets.open({ t: 'more', section })}>
          <Ellipsis size={22} aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}

export function LoadNotice() {
  const { loadError, ready } = useData();
  if (loadError)
    return (
      <div role="alert" className="mb-4 rounded-2xl bg-cherry-soft px-4 py-3 text-sm text-cherry">
        <p className="font-semibold">The records could not be loaded.</p>
        <p className="mt-0.5">Nothing is lost: what you see may be incomplete, so do not rely on the figures. Check the connection, then reload.</p>
        <Button small variant="danger" className="mt-2" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  if (!ready) return <p className="mb-4 text-sm text-muted">Loading the records…</p>;
  return null;
}

export function Layout({ section, children }: { section: Section; children: ReactNode }) {
  const sheets = useSheets();
  const { pathname } = useLocation();
  useEffect(() => rememberSection(section), [section]);
  // Each page starts at the top.
  useEffect(() => {
    document.getElementById('page-scroll')?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex h-full">
      <Sidebar section={section} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <PhoneTop section={section} />
        <main id="page-scroll" className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-safe mx-auto w-full max-w-4xl pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
            <LoadNotice />
            {children}
          </div>
        </main>
        <button
          type="button"
          aria-label="Add"
          onClick={() => sheets.open({ t: 'quick', section })}
          className="absolute right-4 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30 active:bg-accent-dark md:hidden"
        >
          <Plus size={28} aria-hidden />
        </button>
        <PhoneTabs section={section} />
      </div>
    </div>
  );
}

/** For the pages outside a section (Settings, User manual): a simple top bar with a way back. */
export function PlainLayout({ title, children }: { title: string; children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    document.getElementById('page-scroll')?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex h-full flex-col">
      <header className="pt-safe border-b border-line bg-card">
        <div className="px-safe mx-auto flex h-12 w-full max-w-3xl items-center gap-2 md:px-8">
          <Link to="/" className="flex items-center gap-2 font-semibold text-accent-dark" aria-label="Back to Home">
            <House size={18} aria-hidden /> Home
          </Link>
          <span className="flex-1 truncate text-center font-semibold">{title}</span>
          <SyncChip short />
        </div>
      </header>
      <main id="page-scroll" className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-safe pb-safe mx-auto w-full max-w-3xl pt-5 md:px-8 md:pt-8">
          <LoadNotice />
          {children}
          <div className="h-10" />
        </div>
      </main>
    </div>
  );
}
