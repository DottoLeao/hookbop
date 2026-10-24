interface SpinningDiscProps {
  /** Width and height in px. */
  size?: number;
}

/**
 * The disc that turns while the song and its lyrics load. It is the disc the cards draw in place of a picture
 * (`SongThumb`): the dark disc, its groove and its lime center, with an outline so it shows on the dark cards too, and
 * two arcs of light on opposite sides, since a disc that is the same all the way round would look still as it turns.
 *
 * It only turns (`disc-spin`, in `globals.css`, which stops it when motion is reduced) and says nothing: the loading
 * is announced by the line next to it, which has `role="status"`.
 */
export function SpinningDisc({ size = 40 }: SpinningDiscProps) {
  return (
    <span
      aria-hidden="true"
      data-testid="spinning-disc"
      className="disc-spin inline-flex shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 44 44" focusable="false">
        <circle cx="22" cy="22" r="21" fill="#26262C" stroke="#3A3A42" strokeWidth="1.5" />
        <circle cx="22" cy="22" r="14" fill="none" stroke="#6E6E78" strokeWidth="1.5" opacity="0.6" />
        <circle cx="22" cy="22" r="5" fill="#C8FF2E" />
        <path d="M6 16.2A17 17 0 0 1 16.2 6" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
        <path d="M38 27.8A17 17 0 0 1 27.8 38" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
      </svg>
    </span>
  );
}
