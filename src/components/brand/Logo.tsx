import { Disc, LIME_DISC } from './Disc';

interface LogoProps {
  /** Wordmark font size in px. The canvas draws it at 80. */
  size: number;
  /**
   * Only decoration, hidden from screen readers: for a page whose heading already says the name, so it is announced
   * once. Otherwise the logo is an image named "hookbop".
   */
  decorative?: boolean;
}

// Option 2 of design/canvas/Logo.dc.html: two vinyl discs stand in for the "oo".
// Disc size and margins are in em so the whole mark scales with `size`.
function LogoDisc() {
  return <Disc palette={LIME_DISC} aria-hidden="true" style={{ width: '0.55em', height: '0.55em', margin: '0 0.025em 0.2em' }} />;
}

export function Logo({ size, decorative = false }: LogoProps) {
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': 'hookbop' };
  return (
    <div
      {...a11y}
      className="inline-flex items-end font-heading font-bold leading-none tracking-[-0.03em]"
      style={{ fontSize: size }}
    >
      <span>h</span>
      <LogoDisc />
      <LogoDisc />
      <span>kbop</span>
    </div>
  );
}
