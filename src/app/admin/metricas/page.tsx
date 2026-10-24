import { Suspense } from 'react';
import { MetricsScreen } from './MetricsScreen';

// The owner's metrics panel: what the AI costs, how the app is used, and an export for an AI assistant to analyze
// (docs/analytics.md). Like /admin, the owner check is request-time work, so it streams in behind Suspense: the shell
// sent before it is an empty <main>, with nothing in it that names the panel. Anyone who is not the owner then gets
// the not-found page (MetricsScreen calls notFound()); src/proxy.ts has already kept out whoever is not a member.
export default function MetricsPage({ searchParams }: { searchParams: Promise<{ dias?: string | string[] }> }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <Suspense fallback={null}>
        <MetricsScreen searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
