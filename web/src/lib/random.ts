function dec2hex(dec: number) {
  // @todo remove deprecated method
  return ("0" + dec.toString(16)).substr(-2);
}

export function genRandomString(len: number = 80): string {
  const array = new Uint32Array(len / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join("");
}
