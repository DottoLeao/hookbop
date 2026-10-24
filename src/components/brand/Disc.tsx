import type { ReactNode, SVGProps } from 'react';

/** The three colors of a disc: its body, its groove (with how strong the groove is drawn) and its center. */
export interface DiscPalette {
  body: string;
  groove: string;
  grooveOpacity: number;
  center: string;
}

/** The logo's disc (option 2 of design/canvas/Logo.dc.html): a lime body, a dark groove and a dark center. */
export const LIME_DISC: DiscPalette = { body: '#C8FF2E', groove: '#0E0E10', grooveOpacity: 0.45, center: '#0E0E10' };

/** The disc the cards draw in place of a picture: a dark body, a gray groove and a lime center. */
export const DARK_DISC: DiscPalette = { body: '#26262C', groove: '#6E6E78', grooveOpacity: 0.6, center: '#C8FF2E' };

interface DiscProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'focusable' | 'children'> {
  palette: DiscPalette;
  /** Drawn over the disc, in its 44 x 44 box: marks of light or dark that show it turn. */
  children?: ReactNode;
}

/**
 * The vinyl disc of the brand, drawn once for every place that has one: the two discs that are the "oo" of the logo, the
 * placeholder of a song card with no picture, and the disc that turns while a song loads. The geometry is the same in all
 * of them and only the palette changes. It is the svg and nothing more: its size, its style and its `aria-*` are the
 * place's (any other svg attribute passes through), and it never takes the focus.
 */
export function Disc({ palette, children, ...svg }: DiscProps) {
  return (
    <svg {...svg} viewBox="0 0 44 44" focusable="false">
      <circle cx="22" cy="22" r="21" fill={palette.body} />
      <circle cx="22" cy="22" r="14" fill="none" stroke={palette.groove} strokeWidth="1.5" opacity={palette.grooveOpacity} />
      <circle cx="22" cy="22" r="5" fill={palette.center} />
      {children}
    </svg>
  );
}
