'use client';

/** ✓ or ✕ in the text color around it (design/canvas/Componentes.dc.html, "Respostas"). */
export function ResultIcon({ hit }: { hit: boolean }) {
  return (
    <svg
      data-icon={hit ? 'check' : 'cross'}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={hit ? 'M5 12l5 5 9-10' : 'M7 7l10 10M17 7L7 17'} />
    </svg>
  );
}
