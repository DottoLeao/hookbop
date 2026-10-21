import { Suspense } from 'react';
import { DjBop } from '@/components/brand/DjBop';
import { Logo } from '@/components/brand/Logo';
import { t } from '@/i18n/t';
import { createServiceSupabase } from '@/lib/supabase/admin';
import { lookupInvite } from '@/lib/supabase/invites';

// Open to anyone with the link (src/lib/auth/paths.ts), so it can only say what the person
// holding the link needs to know: whether it still works and who sent it.
async function Invite({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const invite = await lookupInvite(createServiceSupabase(), code);

  if (invite.state === 'not_found') {
    return <p className="max-w-sm text-button text-text">{t('convite.notFound')}</p>;
  }
  if (invite.state === 'used') {
    return <p className="max-w-sm text-button text-text">{t('convite.used')}</p>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      {/* On a card, as in design/canvas/MascoteRefinado.dc.html: his cap is the page color. */}
      <div className="flex w-full flex-col items-center gap-4 rounded-card bg-card px-4 py-6">
        <DjBop expression="idle" size={160} />
        <p className="font-heading text-verse font-bold">{t('convite.greeting', { nome: invite.inviterName })}</p>
      </div>
      {/* A plain form post, no script needed: the route keeps the code in a cookie and goes on to sign-in. */}
      <form method="post" action={`/convite/${encodeURIComponent(code)}/entrar`} className="w-full">
        <button
          type="submit"
          className="min-h-11 w-full rounded-button bg-lime px-4 text-button font-semibold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          {t('convite.enter')}
        </button>
      </form>
    </div>
  );
}

// The code comes from the address, which is request-time work, so it sits behind Suspense
// and the logo still comes from the static shell.
export default function ConvitePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 text-center">
      <Logo size={56} />
      <Suspense fallback={null}>
        <Invite params={params} />
      </Suspense>
    </main>
  );
}
