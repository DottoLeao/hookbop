import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { GangSongs, HomeShortcuts } from '@/components/home/HomeSections';
import { HomeLinks } from '@/components/home/HomeLinks';
import { PasteLink } from '@/components/home/PasteLink';
import { t } from '@/i18n/t';

// For members only (see src/proxy.ts). The paste box and the logo are in the static shell; the songs and the owner's
// link need the member's session, so they stream in behind Suspense (see HomeSections).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex justify-center py-2">
        {/* The logo is an image, so the page's heading is written next to it for screen readers. */}
        <h1 className="sr-only">{t('home.title')}</h1>
        <Logo size={48} />
      </header>
      <PasteLink />
      <Suspense fallback={null}>
        <GangSongs />
      </Suspense>
      <div className="mt-auto">
        {/* Until the owner check is back, the links every member has are already there. */}
        <Suspense fallback={<HomeLinks showAdmin={false} />}>
          <HomeShortcuts />
        </Suspense>
      </div>
    </main>
  );
}
