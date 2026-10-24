/**
 * For tests only. jsdom lays nothing out, so every element reports a null `offsetParent`, which is how a browser reports
 * an element that is not on the page. GSAP takes that at its word: to measure an element before it moves it, it takes
 * the element out of the document and puts it back, and an element with the focus in it loses it. On a phone, where the
 * page is laid out, GSAP never does that. This makes jsdom report an offset parent, as a browser does for an element that
 * is drawn, so a test sees the focus as a player would. It returns the function that puts jsdom back as it was.
 */
export function layOutPage(): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
    else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent');
  };
}
