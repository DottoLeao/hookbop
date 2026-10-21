import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, type Settings } from './settings';

const DEFAULTS: Settings = { alwaysShowTranslation: false, autoRepeatOnMiss: true, sounds: true };

/** Storage that refuses everything, the way private mode and blocked site data do. */
function blockedStorage(): Storage {
  const refuse = () => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  };
  return {
    get length() {
      return refuse();
    },
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  };
}

describe('settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts from the defaults when nothing was saved', () => {
    expect(loadSettings(localStorage)).toEqual(DEFAULTS);
  });

  it('brings back what was saved', () => {
    const saved: Settings = { alwaysShowTranslation: true, autoRepeatOnMiss: false, sounds: false };
    saveSettings(localStorage, saved);
    expect(loadSettings(localStorage)).toEqual(saved);
  });

  it('keeps the settings under hb_settings', () => {
    saveSettings(localStorage, { alwaysShowTranslation: true, autoRepeatOnMiss: false, sounds: false });
    expect(JSON.parse(localStorage.getItem('hb_settings') ?? 'null')).toEqual({
      alwaysShowTranslation: true,
      autoRepeatOnMiss: false,
      sounds: false,
    });
  });

  it('hands out a new object each time, so changing one result changes nothing else', () => {
    const first = loadSettings(localStorage);
    first.sounds = false;
    expect(loadSettings(localStorage)).toEqual(DEFAULTS);
  });

  it('falls back to the defaults when the stored text is not JSON', () => {
    localStorage.setItem('hb_settings', '{not json');
    expect(loadSettings(localStorage)).toEqual(DEFAULTS);
  });

  it.each(['null', '[]', '[true,false,true]', '42', '"sounds"', 'true'])(
    'falls back to the defaults when the stored JSON is %s, not an object',
    (stored) => {
      localStorage.setItem('hb_settings', stored);
      expect(loadSettings(localStorage)).toEqual(DEFAULTS);
    },
  );

  it('falls back field by field: a good field is kept, a missing or mistyped one gets its default', () => {
    localStorage.setItem('hb_settings', JSON.stringify({ alwaysShowTranslation: true, sounds: 'yes' }));
    expect(loadSettings(localStorage)).toEqual({ alwaysShowTranslation: true, autoRepeatOnMiss: true, sounds: true });

    localStorage.setItem('hb_settings', JSON.stringify({ alwaysShowTranslation: 1, autoRepeatOnMiss: false, sounds: null }));
    expect(loadSettings(localStorage)).toEqual({ alwaysShowTranslation: false, autoRepeatOnMiss: false, sounds: true });

    localStorage.setItem('hb_settings', JSON.stringify({ sounds: false }));
    expect(loadSettings(localStorage)).toEqual({ alwaysShowTranslation: false, autoRepeatOnMiss: true, sounds: false });
  });

  it('ignores fields it does not know, and does not save them', () => {
    localStorage.setItem('hb_settings', JSON.stringify({ sounds: false, theme: 'neon' }));
    expect(loadSettings(localStorage)).toEqual({ ...DEFAULTS, sounds: false });

    saveSettings(localStorage, { ...DEFAULTS, extra: 1 } as Settings);
    expect(Object.keys(JSON.parse(localStorage.getItem('hb_settings') ?? '{}')).sort()).toEqual([
      'alwaysShowTranslation',
      'autoRepeatOnMiss',
      'sounds',
    ]);
  });

  it('returns the defaults when the storage throws on read', () => {
    expect(loadSettings(blockedStorage())).toEqual(DEFAULTS);
  });

  it('does not throw when the storage refuses to save', () => {
    expect(() => saveSettings(blockedStorage(), DEFAULTS)).not.toThrow();
  });
});
