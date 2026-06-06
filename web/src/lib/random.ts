// Generate `nBytes` of cryptographically strong randomness, hex-encoded.
// Every byte from getRandomValues is preserved (2 hex chars each), so the
// output carries the full `nBytes * 8` bits of entropy.
export function genRandomString(nBytes: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(nBytes));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
