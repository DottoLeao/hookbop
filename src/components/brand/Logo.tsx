interface LogoProps {
  /** Wordmark font size in px. The canvas draws it at 80. */
  size: number;
}

// Option 2 of design/canvas/Logo.dc.html: two vinyl discs stand in for the "oo".
// Disc size and margins are in em so the whole mark scales with `size`.
function Disc() {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
      style={{ width: '0.55em', height: '0.55em', margin: '0 0.025em 0.2em' }}
    >
      <circle cx="22" cy="22" r="21" fill="#C8FF2E" />
      <circle cx="22" cy="22" r="14" fill="none" stroke="#0E0E10" strokeWidth="1.5" opacity="0.45" />
      <circle cx="22" cy="22" r="5" fill="#0E0E10" />
    </svg>
  );
}

export function Logo({ size }: LogoProps) {
  return (
    <div
      role="img"
      aria-label="hookbop"
      className="inline-flex items-end font-heading font-bold leading-none tracking-[-0.03em]"
      style={{ fontSize: size }}
    >
      <span>h</span>
      <Disc />
      <Disc />
      <span>kbop</span>
    </div>
  );
}
