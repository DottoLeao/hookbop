import type { MetadataRoute } from 'next';

// Next.js serves this at /manifest.webmanifest and links it from every page. The proxy lets it through without a
// session (see src/lib/auth/paths.ts), because the browser fetches it without cookies.
const BRAND_BG = '#0E0E10';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hookbop',
    short_name: 'Hookbop',
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_BG,
    theme_color: BRAND_BG,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Puts Hookbop in the Android share menu of the YouTube app. /compartilhar is a route handler that
    // finds the video in what was shared (src/app/compartilhar/route.ts).
    share_target: {
      action: '/compartilhar',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
  };
}
