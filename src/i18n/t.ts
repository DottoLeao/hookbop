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

/** A message that comes as a pair of keys, `<base>.one` and `<base>.other`, each with an `{n}` for the count. */
export type CountKey = {
  [K in MessageKey]: K extends `${infer Base}.one` ? (`${Base}.other` extends MessageKey ? Base : never) : never;
}[MessageKey];

/**
 * A count with its words, in the singular for exactly one and in the plural for any other count, zero included
 * ("1 pessoa", "0 pessoas", "2 pessoas"). `{n}` is filled with `shown`, the count as it should be written (with its
 * thousands dot, say), or with the plain number.
 */
export function tCount(base: CountKey, n: number, shown: string = String(n)): string {
  return t(`${base}.${n === 1 ? 'one' : 'other'}` as MessageKey, { n: shown });
}
