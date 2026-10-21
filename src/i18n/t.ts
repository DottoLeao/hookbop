import { ptBR } from './pt-BR';

export type MessageKey = keyof typeof ptBR;

/**
 * Looks up a pt-BR message and fills its `{name}` placeholders.
 * A placeholder with no matching variable is left as written, so a missing
 * value shows up on screen instead of silently disappearing.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const message: string = ptBR[key];
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : placeholder,
  );
}
