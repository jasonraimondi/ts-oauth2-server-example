import { base64urlencode } from "$lib/base64";
import { genRandomString } from "$lib/random";

export const CLIENT_ID = "0e2ec2df-ee53-4327-a472-9d78c278bdbb";
export const CALLBACK_URL = "http://localhost:5173/callback";

function sha256(plain: string): Promise<ArrayBuffer> {
  // returns promise ArrayBuffer
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const hashed = await sha256(verifier);
  return base64urlencode(hashed);
}

export async function createAuth() {
  // 16 bytes (128 bits) of entropy for the anti-CSRF state.
  const state = genRandomString(16);
  // 32 bytes -> 64 hex chars, comfortably inside the RFC 7636 PKCE
  // code_verifier range of 43-128 characters.
  const verifier = genRandomString(32);
  const challenge = await challengeFromVerifier(verifier);
  return { state, verifier, challenge };
}
