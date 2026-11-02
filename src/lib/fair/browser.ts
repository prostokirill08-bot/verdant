// Браузерная версия генератора provably fair (WebCrypto). Совпадает с серверной floats() байт в байт.
const enc = new TextEncoder();

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function browserFloats(serverSeed: string, clientSeed: string, nonce: number, count: number): Promise<number[]> {
  const key = await crypto.subtle.importKey("raw", enc.encode(serverSeed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out: number[] = [];
  for (let cursor = 0; out.length < count; cursor++) {
    const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}:${cursor}`)));
    for (let i = 0; i < 32 && out.length < count; i += 4) out.push(h[i]! / 256 + h[i + 1]! / 256 ** 2 + h[i + 2]! / 256 ** 3 + h[i + 3]! / 256 ** 4);
  }
  return out;
}
