// @vitest-environment node
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callModel, HELP_MODEL } from './model';
import { ModelError } from './modelError';

// No test reaches the real API: the client is always a fake, and the SDK constructor is replaced too.
const create = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super({ ...options, apiKey: 'test-key' });
      constructed(options);
      this.messages.create = create as never;
    }
  }
  return { ...actual, default: FakeAnthropic };
});

type Answer = Partial<Anthropic.Message>;

function answer(over: Answer = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: HELP_MODEL,
    content: [{ type: 'text', text: 'Barcos de papel num rio de luz', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    ...over,
  } as Anthropic.Message;
}

afterEach(() => {
  create.mockReset();
});

describe('callModel', () => {
  it('asks Haiku 5.5 with no thinking and low effort, so the 300 tokens all go to the answer', async () => {
    create.mockResolvedValue(answer());

    await callModel('system prompt', 'Verso: Paper boats on a river of light');

    expect(create).toHaveBeenCalledExactlyOnceWith(
      {
        model: 'claude-haiku-5-5',
        max_tokens: 300,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system: 'system prompt',
        messages: [{ role: 'user', content: 'Verso: Paper boats on a river of light' }],
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('gives the whole call 20 s, retries included, through the signal it hands the SDK', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    create.mockResolvedValue(answer());

    await callModel('s', 'u');

    expect(timeout).toHaveBeenCalledExactlyOnceWith(20_000);
    expect(create.mock.calls[0][1]).toEqual({ signal: timeout.mock.results[0].value });
    timeout.mockRestore();
  });

  it('makes one client, on first use, that gives up after 15 s and retries once', async () => {
    // A module of its own, so the client an earlier test made is not the one counted here.
    vi.resetModules();
    const fresh = await import('./model');
    create.mockResolvedValue(answer());
    expect(constructed).not.toHaveBeenCalled();

    await fresh.callModel('s', 'u');
    await fresh.callModel('s', 'u');

    expect(constructed).toHaveBeenCalledExactlyOnceWith({ timeout: 15_000, maxRetries: 1 });
  });

  it('gives back the text of the answer, trimmed', async () => {
    create.mockResolvedValue(answer({ content: [{ type: 'text', text: '  Barcos de papel  \n', citations: null }] }));

    expect(await callModel('s', 'u')).toBe('Barcos de papel');
  });

  it('reads only the text blocks, and joins them', async () => {
    create.mockResolvedValue(
      answer({
        content: [
          { type: 'thinking', thinking: 'hmm', signature: 'sig' },
          { type: 'text', text: 'Barcos de papel ', citations: null },
          { type: 'text', text: 'num rio de luz', citations: null },
        ] as Anthropic.ContentBlock[],
      }),
    );

    expect(await callModel('s', 'u')).toBe('Barcos de papel num rio de luz');
  });

  it.each(['refusal', 'max_tokens'] as const)(
    'fails as declined when the model stopped with %s, which asking again would not change (ruling R74)',
    async (stopReason) => {
      create.mockResolvedValue(answer({ stop_reason: stopReason }));

      const failure = await callModel('s', 'u').catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ModelError);
      expect((failure as ModelError).declined).toBe(true);
      // The model did answer, so the budget it took is kept (ruling R75).
      expect((failure as ModelError).answered).toBe(true);
    },
  );

  it.each(['pause_turn', 'stop_sequence'] as const)(
    'fails when the model stopped with %s, so an unfinished answer is never cached, and may be asked again',
    async (stopReason) => {
      create.mockResolvedValue(answer({ stop_reason: stopReason }));

      const failure = await callModel('s', 'u').catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ModelError);
      expect((failure as ModelError).declined).toBe(false);
      expect((failure as ModelError).answered).toBe(true);
    },
  );

  it('fails, and may be asked again, when the answer has no text', async () => {
    create.mockResolvedValue(answer({ content: [{ type: 'text', text: '   ', citations: null }] }));

    const failure = await callModel('s', 'u').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ModelError);
    expect((failure as ModelError).declined).toBe(false);
    expect((failure as ModelError).answered).toBe(true);
  });

  it.each([
    ['the service is rate limiting', () => new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers()), /rate limit/i],
    ['the service cannot be reached', () => new Anthropic.APIConnectionError({ message: 'offline' }), /reached/i],
    ['the service answers with an error', () => new Anthropic.InternalServerError(500, undefined, 'boom', new Headers()), /500/],
    ['the 20 s are up', () => new Anthropic.APIUserAbortError(), /20 s/],
  ])('fails with a ModelError that may be asked again when %s, keeping the SDK error as its cause', async (_name, error, message) => {
    const thrown = error();
    create.mockRejectedValue(thrown);

    const failure = await callModel('s', 'u').catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ModelError);
    expect((failure as ModelError).message).toMatch(message);
    expect((failure as ModelError).cause).toBe(thrown);
    expect((failure as ModelError).declined).toBe(false);
    // No answer came, so the budget is given back (ruling R75).
    expect((failure as ModelError).answered).toBe(false);
  });

  it('reads its key only on the server: listed in .env.example with no value, and never as a NEXT_PUBLIC variable', () => {
    const example = readFileSync('.env.example', 'utf8');

    expect(example).toMatch(/^ANTHROPIC_API_KEY=\s*$/m);
    expect(example).not.toMatch(/NEXT_PUBLIC_\w*ANTHROPIC/i);
    expect(readFileSync('src/lib/help/model.ts', 'utf8')).toMatch(/^import 'server-only';/m);
  });
});
