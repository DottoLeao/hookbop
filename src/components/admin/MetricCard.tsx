import type { ReactNode } from 'react';

/**
 * One card of the owner's metrics panel: a titled region (so a screen reader can jump between cards), an optional line
 * that says which days it counts, and its numbers. Built for a phone first: one column, big numbers, labels in muted
 * text above them.
 */
export function MetricCard({ id, title, caption, children }: { id: string; title: string; caption?: string; children: ReactNode }) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <header className="flex flex-col gap-0.5">
        <h2 id={titleId} className="font-heading text-button font-bold">
          {title}
        </h2>
        {caption && <p className="text-label text-muted">{caption}</p>}
      </header>
      {children}
    </section>
  );
}

/** A grid of numbers, two side by side on a phone, or one per row for long labels. */
export function Stats({ columns = 2, children }: { columns?: 1 | 2 | 3; children: ReactNode }) {
  const grid = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' }[columns];
  return <dl className={`grid ${grid} gap-x-4 gap-y-3`}>{children}</dl>;
}

/**
 * One number: its label, the value and an optional detail under it (the value in reais, what it is made of). The label
 * is the element just before the value, so the value is always read with its label.
 */
export function Stat({
  label,
  value,
  detail,
  size = 'big',
}: {
  label: string;
  value: string;
  detail?: string;
  size?: 'big' | 'small';
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-label text-muted">{label}</dt>
      <dd
        className={`font-heading font-bold tabular-nums ${size === 'big' ? 'text-verse' : 'text-button'} break-words`}
      >
        {value}
      </dd>
      {detail && <dd className="text-body text-muted tabular-nums">{detail}</dd>}
    </div>
  );
}

/** What a card says when its period has nothing yet. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-body text-muted">{children}</p>;
}
