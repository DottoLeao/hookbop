import type { ReactElement } from 'react';

export type DjBopExpression = 'idle' | 'acertou' | 'errou' | 'combo' | 'desafio';

interface DjBopProps {
  expression: DjBopExpression;
  /** Rendered width in px; the height follows the head's aspect ratio. */
  size: number;
}

// Head only, ported from design/canvas/MascoteRefinado.dc.html.
// The four reaction cards share the viewBox below; idle is the main pose's face.
const VIEW_BOX = { x: 40, y: 30, width: 190, height: 156 };

function Head({ detailed }: { detailed: boolean }) {
  return (
    <>
      <circle cx="120" cy="110" r="66" fill="#C8FF2E" />
      <circle cx="120" cy="110" r="52" fill="none" stroke="#0E0E10" strokeWidth="2" opacity="0.1" />
      {detailed && (
        <circle cx="120" cy="110" r="38" fill="none" stroke="#0E0E10" strokeWidth="2" opacity="0.1" />
      )}
      <path d="M74 70A62 62 0 0 1 104 50" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity="0.55" />
      <path d="M56 96A64 58 0 0 1 184 96Q120 84 56 96Z" fill="#0E0E10" />
      <path d="M176 86Q208 80 220 94Q200 104 178 100Z" fill="#0E0E10" />
      {detailed && <rect x="106" y="86" width="28" height="7" rx="3.5" fill="#3A3A42" />}
      <circle cx="120" cy="40" r="4" fill="#C8FF2E" />
    </>
  );
}

const faces: Record<DjBopExpression, ReactElement> = {
  idle: (
    <>
      <path d="M84 102Q96 95 108 101" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <path d="M132 101Q144 95 156 102" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="96" cy="118" rx="9" ry="11" fill="#0E0E10" />
      <ellipse cx="144" cy="118" rx="9" ry="11" fill="#0E0E10" />
      <circle cx="99" cy="114" r="3" fill="#FFFFFF" />
      <circle cx="147" cy="114" r="3" fill="#FFFFFF" />
      <circle cx="120" cy="136" r="4" fill="#0E0E10" />
      <path d="M100 148Q120 170 140 148Q120 156 100 148Z" fill="#0E0E10" />
    </>
  ),
  acertou: (
    <>
      <path d="M86 122Q96 108 106 122" fill="none" stroke="#0E0E10" strokeWidth="6" strokeLinecap="round" />
      <path d="M134 122Q144 108 154 122" fill="none" stroke="#0E0E10" strokeWidth="6" strokeLinecap="round" />
      <circle cx="120" cy="136" r="4" fill="#0E0E10" />
      <path d="M96 146Q120 176 144 146Z" fill="#0E0E10" />
      <path d="M206 112L210 122L220 126L210 130L206 140L202 130L192 126L202 122Z" fill="#FFFFFF" />
    </>
  ),
  errou: (
    <>
      <path d="M84 104Q96 100 108 106" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <path d="M132 100Q144 92 156 99" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="96" cy="120" rx="8" ry="10" fill="#0E0E10" />
      <ellipse cx="144" cy="118" rx="8" ry="10" fill="#0E0E10" />
      <circle cx="98" cy="116" r="2.5" fill="#FFFFFF" />
      <circle cx="146" cy="114" r="2.5" fill="#FFFFFF" />
      <circle cx="120" cy="136" r="4" fill="#0E0E10" />
      <path d="M104 152Q122 160 138 146" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <path d="M172 98Q180 112 172 118Q164 112 172 98Z" fill="#FFFFFF" />
    </>
  ),
  combo: (
    <>
      <rect x="78" y="106" width="38" height="24" rx="9" fill="#0E0E10" />
      <rect x="124" y="106" width="38" height="24" rx="9" fill="#0E0E10" />
      <rect x="112" y="112" width="16" height="5" rx="2.5" fill="#0E0E10" />
      <path d="M86 112L98 124M136 112L148 124" fill="none" stroke="#C8FF2E" strokeWidth="3" strokeLinecap="round" />
      <path d="M98 146Q120 170 142 146Q120 154 98 146Z" fill="#0E0E10" />
    </>
  ),
  desafio: (
    <>
      <path d="M84 104Q96 98 108 103" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <path d="M132 99Q144 91 157 99" fill="none" stroke="#0E0E10" strokeWidth="5" strokeLinecap="round" />
      <path d="M86 120Q96 127 106 120" fill="none" stroke="#0E0E10" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="144" cy="118" rx="9" ry="11" fill="#0E0E10" />
      <circle cx="147" cy="114" r="3" fill="#FFFFFF" />
      <circle cx="120" cy="136" r="4" fill="#0E0E10" />
      <path d="M102 150Q124 162 142 144" fill="none" stroke="#0E0E10" strokeWidth="6" strokeLinecap="round" />
    </>
  ),
};

export function DjBop({ expression, size }: DjBopProps) {
  const { x, y, width, height } = VIEW_BOX;
  return (
    <svg
      width={size}
      height={(size * height) / width}
      viewBox={`${x} ${y} ${width} ${height}`}
      role="img"
      aria-label="DJ Bop"
      data-expression={expression}
    >
      <Head detailed={expression === 'idle'} />
      {faces[expression]}
    </svg>
  );
}
