// The phone's two menus: the + button's list of things to add, and More (the pages that do not fit in the bottom tabs).
import { ArrowLeftRight, BookOpen, ChevronRight, House, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSheets } from '../components/SheetHost';
import { List, Sheet } from '../components/ui';
import { useData } from '../data/DataContext';
import { SECTIONS } from '../lib/sections';
import type { Section } from '../lib/types';

export function QuickSheet({ section, onClose }: { section: Section; onClose: () => void }) {
  const sheets = useSheets();
  return (
    <Sheet title="Add" onClose={onClose}>
      <List>
        {SECTIONS[section].quick.map((q) => (
          <button key={q.label} type="button" className="row min-h-16" onClick={() => sheets.swap(q.sheet)}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
              <q.icon size={20} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{q.label}</span>
              <span className="block text-sm text-muted">{q.hint}</span>
            </span>
          </button>
        ))}
      </List>
    </Sheet>
  );
}

export function MoreSheet({ section, onClose }: { section: Section; onClose: () => void }) {
  const d = useData();
  const navigate = useNavigate();
  const other: Section = section === 'bake' ? 'hardware' : 'bake';
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  const rest = SECTIONS[section].menu.filter((m) => !m.tab);
  const links = [
    ...rest.map((m) => ({ to: m.to, label: m.label, icon: m.icon })),
    { to: SECTIONS[other].base, label: `Switch to ${other === 'bake' ? d.settings.bakeName : d.settings.hardwareName}`, icon: ArrowLeftRight },
    { to: '/', label: 'Home', icon: House },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/help', label: 'User manual', icon: BookOpen },
  ];
  return (
    <Sheet title="More" onClose={onClose}>
      <List>
        {links.map((l) => (
          <button key={l.to} type="button" className="row min-h-14" onClick={() => go(l.to)}>
            <l.icon size={20} className="shrink-0 text-accent-dark" aria-hidden />
            <span className="flex-1 font-medium">{l.label}</span>
            <ChevronRight size={18} className="text-faint" aria-hidden />
          </button>
        ))}
      </List>
    </Sheet>
  );
}
