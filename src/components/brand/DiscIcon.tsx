interface DiscIconProps {
  /** Width and height in px. */
  size: number;
}

// From option 2 of design/canvas/Icone.dc.html: black disc on a lime rounded square.
// The canvas drops the grooves and the highlight at small sizes, and so do we.
const DETAILED_FROM = 96;

export function DiscIcon({ size }: DiscIconProps) {
  const detailed = size >= DETAILED_FROM;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect width="100" height="100" rx="22" fill="#C8FF2E" />
      <circle cx="50" cy="50" r="33" fill="#0E0E10" />
      {detailed && (
        <>
          <circle cx="50" cy="50" r="26" fill="none" stroke="#3A3A42" strokeWidth="1.2" />
          <circle cx="50" cy="50" r="19" fill="none" stroke="#3A3A42" strokeWidth="1.2" />
        </>
      )}
      <circle cx="50" cy="50" r="10" fill="#C8FF2E" />
      <circle cx="50" cy="50" r="2.5" fill="#0E0E10" />
      {detailed && (
        <path d="M29 38A24 24 0 0 1 42 25" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      )}
    </svg>
  );
}
