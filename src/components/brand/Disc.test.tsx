import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DARK_DISC, Disc, LIME_DISC } from './Disc';

/** Every attribute of an element, by name. */
function attributesOf(element: Element) {
  return Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name)]));
}

function circlesOf(root: Element) {
  return [...root.querySelectorAll('circle')].map(attributesOf);
}

describe('Disc', () => {
  it('is the vinyl disc of the brand: a body, a groove and a center, in a 44 x 44 box that does not take the focus', () => {
    const { container } = render(<Disc palette={LIME_DISC} />);

    const svg = container.querySelector('svg')!;
    expect(attributesOf(svg)).toEqual({ viewBox: '0 0 44 44', focusable: 'false' });
    expect(circlesOf(svg)).toEqual([
      { cx: '22', cy: '22', r: '21', fill: '#C8FF2E' },
      { cx: '22', cy: '22', r: '14', fill: 'none', stroke: '#0E0E10', 'stroke-width': '1.5', opacity: '0.45' },
      { cx: '22', cy: '22', r: '5', fill: '#0E0E10' },
    ]);
  });

  it('is drawn in the colors of the palette it is given: the lime one of the logo, the dark one of the cards', () => {
    const lime = render(<Disc palette={LIME_DISC} />).container;
    const dark = render(<Disc palette={DARK_DISC} />).container;

    expect(circlesOf(dark)).toEqual([
      { cx: '22', cy: '22', r: '21', fill: '#26262C' },
      { cx: '22', cy: '22', r: '14', fill: 'none', stroke: '#6E6E78', 'stroke-width': '1.5', opacity: '0.6' },
      { cx: '22', cy: '22', r: '5', fill: '#C8FF2E' },
    ]);
    // The same geometry in both: only the colors differ.
    const geometry = (root: Element) => circlesOf(root).map(({ cx, cy, r }) => [cx, cy, r]);
    expect(geometry(dark)).toEqual(geometry(lime));
  });

  it('hands every other attribute to the svg, as the size, the style and the aria of the place it is drawn in', () => {
    const { container } = render(
      <Disc palette={DARK_DISC} width="28" height="28" aria-hidden="true" style={{ margin: '1px' }} className="x" />,
    );

    const svg = container.querySelector('svg')!;
    expect(attributesOf(svg)).toEqual({
      viewBox: '0 0 44 44',
      focusable: 'false',
      width: '28',
      height: '28',
      'aria-hidden': 'true',
      style: 'margin: 1px;',
      class: 'x',
    });
  });

  it('draws what it is given over the disc, in the same box', () => {
    const { container } = render(
      <Disc palette={LIME_DISC}>
        <path data-testid="mark" d="M6 16.2A17 17 0 0 1 16.2 6" />
      </Disc>,
    );

    const svg = container.querySelector('svg')!;
    expect(svg.lastElementChild).toHaveAttribute('data-testid', 'mark');
    expect(svg.children).toHaveLength(4);
  });
});
