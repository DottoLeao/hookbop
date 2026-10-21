// Local Supabase delivers all e-mail to Mailpit (see [inbucket] in supabase/config.toml).
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface Mailpit {
  messages: { ID: string }[];
}

/**
 * Waits for the e-mail sent to `address` and returns the sign-in link in it.
 * Use a fresh address per test: the first mail found for it is the one read.
 */
export async function waitForSignInLink(address: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const { messages } = (await search.json()) as Mailpit;
    if (messages.length > 0) {
      const mail = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
      const { Text } = (await mail.json()) as { Text: string };
      const link = Text.match(/https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in e-mail for ${address} reached Mailpit at ${MAILPIT_URL} within ${timeoutMs} ms.`);
}
