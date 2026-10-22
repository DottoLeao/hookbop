import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { GangSongs, HomeShortcuts, PasteLinkWithShareError } from '@/components/home/HomeSections';
import { HomeLinks } from '@/components/home/HomeLinks';
import { PasteLink } from '@/components/home/PasteLink';
import { InstallPromptGate } from '@/components/pwa/InstallPromptGate';
import { t } from '@/i18n/t';

// For members only (see src/proxy.ts). The paste box and the logo are in the static shell; the songs and the owner's
// link need the member's session, and `?erro=link` (a share with no video, see src/app/compartilhar/route.ts) is
// request data, so they stream in behind Suspense (see HomeSections).
export default function Home({ searchParams }: { searchParams: Promise<{ erro?: string | string[] }> }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex justify-center py-2">
        {/* The heading says the name to screen readers, so the logo next to it is only decoration: read once. */}
        <h1 className="sr-only">{t('home.title')}</h1>
        <Logo size={48} decorative />
      </header>
      <Suspense fallback={<PasteLink />}>
        <PasteLinkWithShareError searchParams={searchParams} />
      </Suspense>
      <InstallPromptGate />
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
