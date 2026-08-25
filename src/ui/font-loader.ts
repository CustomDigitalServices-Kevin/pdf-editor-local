// Browser-side loading of the bundled handwriting fonts: one fetch per font,
// shared by the on-screen FontFace and the PDF export (embedding needs the
// same bytes). Everything is cached for the session.

import type { HandwritingFontKey } from "../core/types";
import { handwritingFont } from "../core/fonts";

// Uint8Array<ArrayBuffer> (not ArrayBufferLike): FontFace() refuses a view
// that could sit on a SharedArrayBuffer.
type FontBytes = Uint8Array<ArrayBuffer>;

const bytesCache = new Map<HandwritingFontKey, Promise<FontBytes>>();
const faceCache = new Map<HandwritingFontKey, Promise<void>>();

export function loadHandwritingFontBytes(key: HandwritingFontKey): Promise<FontBytes> {
  const cached = bytesCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<FontBytes> => {
    const res = await fetch(handwritingFont(key).url);
    if (!res.ok) throw new Error(`font ${key}: HTTP ${res.status}`);
    const buf: ArrayBuffer = await res.arrayBuffer();
    return new Uint8Array(buf);
  })();
  bytesCache.set(key, p);
  p.catch(() => {
    bytesCache.delete(key); // allow a retry after a network failure
  });
  return p;
}

/** Register the font's FontFace so CSS can use its family. Idempotent. */
export function ensureHandwritingFace(key: HandwritingFontKey): Promise<void> {
  const cached = faceCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    const bytes = await loadHandwritingFontBytes(key);
    const face = new FontFace(handwritingFont(key).cssFamily, bytes);
    await face.load();
    document.fonts.add(face);
  })();
  faceCache.set(key, p);
  p.catch(() => {
    faceCache.delete(key);
  });
  return p;
}
