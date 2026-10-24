import { Disc, LIME_DISC } from './Disc';

/**
 * The disc of the logo, turning while the song and its lyrics load (spec §3). It is the shared `Disc` in the logo's
 * lime, with two dark arcs on opposite sides of it: a disc that is the same all the way round would look still as it
 * turns.
 *
 * It only turns (`disc-spin`, in `globals.css`, which stops it when motion is reduced) and says nothing: the loading
 * is announced by the line next to it, which has `role="status"`.
 */
export function SpinningDisc() {
  return (
    <span aria-hidden="true" data-testid="spinning-disc" className="disc-spin inline-flex h-10 w-10 shrink-0">
      <Disc palette={LIME_DISC} width="40" height="40">
        <path d="M6 16.2A17 17 0 0 1 16.2 6" fill="none" stroke="#0E0E10" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <path d="M38 27.8A17 17 0 0 1 27.8 38" fill="none" stroke="#0E0E10" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
      </Disc>
    </span>
  );
}
