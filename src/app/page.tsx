import { Logo } from '@/components/brand/Logo';

// Placeholder home. The real one (paste a link, recent songs) arrives in Task 8.
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Logo size={56} />
    </main>
  );
}
