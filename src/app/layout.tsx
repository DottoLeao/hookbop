import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { InstallEventCapture } from '@/components/pwa/InstallEventCapture';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hookbop',
  // The manifest (src/app/manifest.ts) has the icons for Android. iOS wants its own, and the app's name under it.
  icons: { apple: '/icons/apple-touch-icon.png' },
  // "black" paints the status bar of the installed app black, close enough to the page (#0E0E10) to look like one piece.
  appleWebApp: { capable: true, title: 'Hookbop', statusBarStyle: 'black' },
};

// The color of the browser bar around the page, and of the status bar of the installed app on Android.
export const viewport: Viewport = {
  themeColor: '#0E0E10',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        {children}
        <RegisterSW />
        <InstallEventCapture />
      </body>
    </html>
  );
}
