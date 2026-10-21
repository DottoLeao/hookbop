import { Suspense } from 'react';
import { Logo } from '@/components/brand/Logo';
import { isLoginState } from '@/lib/auth/paths';
import { t } from '@/i18n/t';
import { LoginForm } from './LoginForm';

// Reading searchParams is request-time work, so it sits behind Suspense and the
// logo and form still come from the static shell.
async function EstadoMessage({ searchParams }: { searchParams: Promise<{ estado?: string | string[] }> }) {
  const { estado } = await searchParams;
  if (!isLoginState(estado)) return null;

  return (
    <p role="status" className="max-w-sm text-center text-button text-text">
      {t(`entrar.estado.${estado}`)}
    </p>
  );
}

export default function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
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
