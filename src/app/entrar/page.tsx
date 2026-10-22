import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { isLoginError, isLoginState } from '@/lib/auth/paths';
import { t } from '@/i18n/t';
import { LoginForm } from './LoginForm';

type EntrarParams = { estado?: string | string[]; erro?: string | string[] };

// Reading searchParams is request-time work, so it sits behind Suspense and the
// logo and form still come from the static shell. `?estado=` says why someone is
// not in (no invite, a full group, ...); `?erro=` says calmly that the sign-in did
// not go through this time (a link that did not work, a check that failed).
async function EstadoMessage({ searchParams }: { searchParams: Promise<EntrarParams> }) {
  const { estado, erro } = await searchParams;
  const message = isLoginState(estado)
    ? t(`entrar.estado.${estado}`)
    : isLoginError(erro)
      ? t(`entrar.erro.${erro}`)
      : null;
  if (!message) return null;

  return (
    <p role="status" className="max-w-sm text-center text-button text-text">
      {message}
    </p>
  );
}

export default function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<EntrarParams>;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <Logo size={56} />
      <Suspense fallback={null}>
        <EstadoMessage searchParams={searchParams} />
      </Suspense>
      <LoginForm />
    </main>
  );
}
