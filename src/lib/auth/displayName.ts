export interface NameSource {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Name shown for a new member: the Google profile name when there is one,
 * otherwise the part of the e-mail before the @. Empty when neither exists.
 */
export function displayNameFor(user: NameSource): string {
  const metadata = user.user_metadata ?? {};
  return text(metadata.full_name) || text(metadata.name) || text(user.email?.split('@')[0]);
}
