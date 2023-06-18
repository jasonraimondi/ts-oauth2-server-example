function dec2hex(dec: number) {
  return ("0" + dec.toString(16)).substr(-2);
}

function sha256(plain: string): Promise<ArrayBuffer> { // returns promise ArrayBuffer
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(a: ArrayBuffer) {
  let str = "";
  const bytes = new Uint8Array(a);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function genRandomString(len: number = 80): string {
  const array = new Uint32Array(len / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join("");
}

export async function challengeFromVerifier(verifier: string) {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}
