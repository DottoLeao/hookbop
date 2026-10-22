import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { test as base } from '@playwright/test';
import type { Database } from '../../src/lib/supabase/database.types';

// Test setup talks to the local Supabase with the service role key, which bypasses the access
// rules, so tests can create members and invites the app itself would not hand out. The key
// comes from .env.local (playwright.config.ts loads it) and never reaches a browser.
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local to seed test data.');
  }
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface SeededMember {
  id: string;
  email: string;
  name: string;
}

/** Same alphabet as the app's invite codes. Random, so parallel tests never share a code. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function randomInviteCode(): string {
  return Array.from({ length: 10 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

/** Short, unique and harmless in a display name, for telling this run's rows from any other. */
export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Creates test data and removes all of it afterwards, even when the test fails.
 * Use it through the `seed` fixture below.
 */
export class Seed {
  readonly db = serviceClient();
  private readonly userIds = new Set<string>();
  private readonly emails = new Set<string>();
  private readonly codes = new Set<string>();
  private readonly youtubeIds = new Set<string>();

  /** A confirmed account with a profile: someone who is already in the app. */
  async member({ name, owner = false }: { name: string; owner?: boolean }): Promise<SeededMember> {
    const email = `e2e-${randomUUID()}@example.com`;
    const { data, error } = await this.db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error) throw error;
    this.userIds.add(data.user.id);

    const profile = await this.db.from('profiles').insert({ id: data.user.id, display_name: name, is_owner: owner });
    if (profile.error) throw profile.error;

    return { id: data.user.id, email, name };
  }

  /** An invite made by `createdBy`, open unless `usedBy` is given. */
  async invite({ createdBy, usedBy }: { createdBy: string; usedBy?: string }): Promise<string> {
    const code = randomInviteCode();
    this.codes.add(code);
    const { error } = await this.db.from('invites').insert({
      code,
      created_by: createdBy,
      ...(usedBy ? { used_by: usedBy, used_at: new Date().toISOString() } : {}),
    });
    if (error) throw error;
    return code;
  }

  /**
   * A video with lyrics (or without), as the app would have remembered it, with its YouTube data fetched
   * `fetchedDaysAgo` days ago. The id is made up and is 11 characters long.
   */
  async video({
    title,
    status = 'ok',
    fetchedDaysAgo = 0,
  }: {
    title: string;
    status?: 'ok' | 'no_lyrics';
    fetchedDaysAgo?: number;
  }): Promise<string> {
    const youtubeId = `e${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    this.youtubeIds.add(youtubeId);
    const { error } = await this.db.from('videos').insert({
      youtube_id: youtubeId,
      title,
      channel: 'Invented Artist',
      duration_s: 185,
      yt_fetched_at: new Date(Date.now() - fetchedDaysAgo * 86_400_000).toISOString(),
      status,
    });
    if (error) throw error;
    return youtubeId;
  }

  /** A finished game of `userId` on `youtubeId`, `minutesAgo` minutes ago. */
  async play({ userId, youtubeId, minutesAgo = 0 }: { userId: string; youtubeId: string; minutesAgo?: number }) {
    const { error } = await this.db.from('plays').insert({
      user_id: userId,
      youtube_id: youtubeId,
      mode: 'escolha',
      difficulty: 'facil',
      total_blanks: 10,
      first_try_correct: 9,
      pct: 90,
      max_combo: 5,
      xp: 100,
      created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    });
    if (error) throw error;
  }

  /** An address a test signs in with through the app, so the account does not exist yet. */
  newcomerEmail(): string {
    const email = `e2e-${randomUUID()}@example.com`;
    this.emails.add(email);
    return email;
  }

  /** Remember invite codes the app made, so they go too. */
  track(code: string) {
    this.codes.add(code);
  }

  async cleanup() {
    const { data, error } = await this.db.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email && this.emails.has(user.email)) this.userIds.add(user.id);
    }
    const ids = [...this.userIds];

    // Order matters: plays point at profiles and videos, invites and profiles point at users, and only answers cascade.
    if (ids.length > 0) {
      await this.db.from('plays').delete().in('user_id', ids);
      await this.db.from('invites').delete().in('created_by', ids);
      await this.db.from('invites').delete().in('used_by', ids);
    }
    if (this.youtubeIds.size > 0) await this.db.from('videos').delete().in('youtube_id', [...this.youtubeIds]);
    if (this.codes.size > 0) await this.db.from('invites').delete().in('code', [...this.codes]);
    if (ids.length > 0) await this.db.from('profiles').delete().in('id', ids);
    for (const id of ids) await this.db.auth.admin.deleteUser(id);
  }
}

export const test = base.extend<{ seed: Seed }>({
  // (Playwright's second argument is named `run`, not `use`, so the React hooks lint rule leaves it alone.)
  seed: async ({}, run) => {
    const seed = new Seed();
    try {
      await run(seed);
    } finally {
      await seed.cleanup();
    }
  },
});
