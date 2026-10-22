// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

function share(query: string, origin = 'https://hookbop.test') {
  return GET(new NextRequest(`${origin}/compartilhar${query}`));
}

describe('GET /compartilhar', () => {
  it('sends the shared YouTube link to its song, on the same site (307 keeps it a GET)', async () => {
    const response = await share(`?title=Rick&text=${encodeURIComponent('Olha https://youtu.be/dQw4w9WgXcQ')}`);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://hookbop.test/jogar/dQw4w9WgXcQ');
  });

  it('keeps the address the request came to, whatever it is (a preview, localhost, the real domain)', async () => {
    const response = await share('?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ', 'http://localhost:3000');

    expect(response.headers.get('location')).toBe('http://localhost:3000/jogar/dQw4w9WgXcQ');
  });

  it('sends anything else to the home page with the error flag', async () => {
    const response = await share('?text=oi');

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://hookbop.test/?erro=link');
  });

  it('does the same when nothing was shared at all', async () => {
    const response = await share('');

    expect(response.headers.get('location')).toBe('https://hookbop.test/?erro=link');
  });
});
