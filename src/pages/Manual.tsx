// Shows docs/user-manual.md inside the app. That file is the one copy of the manual:
// every change the user can see updates it in the same commit.
import type { ReactNode } from 'react';
import manual from '../../docs/user-manual.md?raw';
import { PlainLayout } from '../components/Layout';

/** **bold** and `code` inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

/** A small Markdown reader: # ## ### headings, paragraphs, - and 1. lists, > notes. */
function render(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const Tag = (['h1', 'h2', 'h3'] as const)[h[1].length - 1];
      out.push(<Tag key={key++}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    const list = line.match(/^(-|\d+\.)\s+/);
    if (list) {
      const ordered = list[1] !== '-';
      const items: string[] = [];
      while (i < lines.length && /^(-|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^(-|\d+\.)\s+/, ''));
      const Tag = ordered ? 'ol' : 'ul';
      out.push(
        <Tag key={key++}>
          {items.map((t, n) => (
            <li key={n}>{inline(t)}</li>
          ))}
        </Tag>,
      );
      continue;
    }
    if (line.startsWith('>')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) parts.push(lines[i++].replace(/^>\s?/, ''));
      out.push(<blockquote key={key++}>{inline(parts.join(' '))}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|-\s|\d+\.\s|>)/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={key++}>{inline(para.join(' '))}</p>);
  }
  return out;
}

const content = render(manual);

export function ManualPage() {
  return (
    <PlainLayout title="User manual">
      <article className="manual text-[15px]">{content}</article>
    </PlainLayout>
  );
}
