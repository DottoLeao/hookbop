// Next.js inlines NEXT_PUBLIC_* values at build time only when they are written
// as a literal `process.env.NEXT_PUBLIC_NAME`, so every name is spelled out here
// and never read through a variable.

/** Address and public (anon) key of the Supabase project. */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example).',
    );
  }
  return { url, anonKey };
}

/** Public address of the app, without a trailing slash, for links that leave the app. */
export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_APP_URL must be set (see .env.example).');
  }
  return url.replace(/\/+$/, '');
}
