export type Platform = 'android' | 'ios' | 'other';

interface NavigatorInfo {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** Which kind of phone this is, as far as installing the app goes: Android has an install button, iOS has the share menu. */
export function platformFromNavigator({ userAgent, platform = '', maxTouchPoints = 0 }: NavigatorInfo): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // An iPad that asks for the desktop site says it is a Mac, but a Mac has no touch screen.
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  return 'other';
}

/** The platform of this browser. Off the browser (while the page is built on the server) there is none, so: other. */
export function detectPlatform(): Platform {
  return typeof navigator === 'undefined' ? 'other' : platformFromNavigator(navigator);
}

/** True when the app was opened from the home screen, not from a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // Safari on iOS marks an app opened from the home screen this way, and has no display-mode query for it on older versions.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}
