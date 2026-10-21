// Local Supabase delivers all e-mail to Mailpit (see [inbucket] in supabase/config.toml).
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface Search {
  messages: { ID: string; Created: string }[];
}

export interface SignInMail {
  /** The link that leaves for Supabase Auth and comes back to /auth/callback. */
  link: string;
  /** The six-digit code that does the same job without leaving the app. */
  code: string;
}

/**
 * Waits until `nth` e-mails have reached `address` and reads the newest one.
 * Use a fresh address per test; ask for `nth: 2` to read a second request for the same address.
 */
export async function waitForSignInMail(address: string, { nth = 1, timeoutMs = 10_000 } = {}): Promise<SignInMail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const { messages } = (await search.json()) as Search;
    if (messages.length >= nth) {
      const newest = [...messages].sort((a, b) => b.Created.localeCompare(a.Created))[0];
      const mail = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
      const { Text } = (await mail.json()) as { Text: string };
      const link = Text.match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/)?.[0];
      // Links carry long tokens, so take them out before looking for the six digits.
      const code = Text.replace(/https?:\/\/\S+/g, '').match(/\b\d{6}\b/)?.[0];
      if (link && code) return { link, code };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in e-mail #${nth} for ${address} reached Mailpit at ${MAILPIT_URL} within ${timeoutMs} ms.`);
}
