/**
 * The JSON body of a request, or null when it is not JSON or is bigger than `maxBytes`. A body that says it is bigger
 * is not read at all, and one that says nothing (or says less) is read only up to `maxBytes`: it is never held whole
 * first. The app's own POST routes take a few hundred bytes, so a cap of a few KB turns anything else away cheaply.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBytes || !request.body) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
