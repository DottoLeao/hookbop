import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from '@/lib/env';
import type { Database } from './database.types';

interface RefreshedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface SessionState {
  signedIn: boolean;
  /** Only looked up when `checkMembership` is on; false otherwise, and false when the check failed. */
  isMember: boolean;
  /**
   * The membership could not be checked (is_member answered with an error, or could not be reached). Then nothing is
   * known about the person, and they must not be told they have no invite.
   */
  membershipFailed: boolean;
  /**
   * Puts the refreshed session cookies (and the headers that keep them out of
   * shared caches) on the response being returned, whether it passes the
   * request on or redirects it.
   */
  apply: <T extends NextResponse>(response: T) => T;
}

/**
 * Refreshes the Supabase session of an incoming request and says who is in.
 * Call it from src/proxy.ts on every request: it is what keeps the session
 * cookie fresh for the pages and routes that run after it.
 */
export async function updateSession(
  request: NextRequest,
  { checkMembership }: { checkMembership: boolean },
): Promise<SessionState> {
  const { url, anonKey } = supabaseEnv();
  const refreshedCookies: RefreshedCookie[] = [];
  const headers: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value, options } of cookiesToSet) {
          // The request copy is what the page or route that runs next will read.
          request.cookies.set(name, value);
          refreshedCookies.push({ name, value, options });
        }
        Object.assign(headers, cacheHeaders);
      },
    },
  });

  // Verifies the token's signature, and refreshes it first when it has expired.
  // Do not put code between createServerClient and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub);

  let isMember = false;
  let membershipFailed = false;
  if (signedIn && checkMembership) {
    try {
      const { data: member, error } = await supabase.rpc('is_member');
      if (error) membershipFailed = true;
      else isMember = member === true;
    } catch {
      membershipFailed = true;
    }
  }

  return {
    signedIn,
    isMember,
    membershipFailed,
    apply(response) {
      for (const { name, value, options } of refreshedCookies) response.cookies.set(name, value, options);
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      return response;
    },
  };
}
