import { Logo } from '@/components/brand/Logo';

// Placeholder home, for members only (see src/proxy.ts). The real one (paste a link, recent songs) comes in a later task.
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Logo size={56} />
    </main>
  );
}
