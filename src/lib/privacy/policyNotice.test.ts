import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/t';
import { MemoryStorage } from '@/lib/game/fakeStorage';
import { POLICY_DATE, POLICY_NOTICE_KEY, knewOlderPolicy, policyNoticeDue, rememberPolicyNotice } from './policyNotice';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('POLICY_DATE', () => {
  it('is the date the privacy page says it was updated, so one never changes without the other', () => {
    const written = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${POLICY_DATE}T00:00:00Z`),
    );

    expect(t('privacidade.updated')).toBe(`Atualizada em ${written}.`);
  });
});

describe('knewOlderPolicy', () => {
  it('is true for a member who joined before the policy changed, in Brasília time', () => {
    expect(knewOlderPolicy('2026-10-20T10:00:00Z')).toBe(true);
    // 23:59 on the 25th in Brasília.
    expect(knewOlderPolicy('2026-10-26T02:59:00Z')).toBe(true);
  });

  it('is false for a member who joined on the day it changed or later, who only ever saw this one', () => {
    // Midnight of the 26th in Brasília.
    expect(knewOlderPolicy('2026-10-26T03:00:00Z')).toBe(false);
    expect(knewOlderPolicy('2026-11-02T12:00:00Z')).toBe(false);
  });

  it('is false for a date that cannot be read', () => {
    expect(knewOlderPolicy('not a date')).toBe(false);
  });
});

describe('policyNoticeDue', () => {
  const EARLY_MEMBER = '2026-10-20T10:00:00Z';

  it('is due for a member who knew an older policy and was never told of this one on this device', () => {
    expect(policyNoticeDue(new MemoryStorage(), EARLY_MEMBER)).toBe(true);
  });

  it('is due again for a member told of an older change only', () => {
    const storage = new MemoryStorage();
    storage.setItem(POLICY_NOTICE_KEY, '2026-01-01');

    expect(policyNoticeDue(storage, EARLY_MEMBER)).toBe(true);
  });

  it('is not due once the member was told of this one, which is remembered under its date', () => {
    const storage = new MemoryStorage();

    rememberPolicyNotice(storage);

    expect(storage.getItem(POLICY_NOTICE_KEY)).toBe(POLICY_DATE);
    expect(policyNoticeDue(storage, EARLY_MEMBER)).toBe(false);
  });

  it('is never due for a member who joined after the change', () => {
    expect(policyNoticeDue(new MemoryStorage(), '2026-11-02T12:00:00Z')).toBe(false);
  });

  it('is not due when the storage cannot be read, as it could not be shown only once', () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    expect(policyNoticeDue(storage, EARLY_MEMBER)).toBe(false);
    expect(policyNoticeDue(null, EARLY_MEMBER)).toBe(false);
  });

  it('remembers nothing, and does not throw, when the storage refuses', () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });

    expect(() => rememberPolicyNotice(storage)).not.toThrow();
    expect(() => rememberPolicyNotice(null)).not.toThrow();
  });
});
