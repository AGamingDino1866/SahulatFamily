// RSA-OAEP public key used to encrypt CNIC/B-Form numbers in the browser before they are
// written to Firestore. This is a public key - safe to ship to every client. Only the matching
// private key (held server-side as a Cloudflare Pages secret, see functions/_lib/cnic-crypto.js)
// can decrypt it.
const CNIC_PUBLIC_KEY_JWK = {
  key_ops: ["encrypt"],
  ext: true,
  alg: "RSA-OAEP-256",
  kty: "RSA",
  n: "swGu0bcu-J3rOz70GkB-YR7T-p6I_zV-HTLZXbtQRh62ZmNArKG6BePXXmKCvuZwFows_-rdvgYidzZ5Engjgssm6aIMCHAHwKVhQ6hLawLQgbPZUHut_HiM5kuHj_p-KbgcroG2rIDsBzSb_Re3X_xGfd0CqKzg9T8JxMMe_qdLIV65PnnE0tRz-rF6xrYAx2jaIBJ3pFLQPh5XDjoy8GGw4rczLJJlYEC35aX7vwLZXGiF29Vb4tQlIkp-WKqyeDdeA0WFWlkciXFLXdIx4oYsZm3mPi8dypWCyu5wuUmqaoqJX6xu0h-FCIIWi_gcuRTqmBiB_xPhC0w-yd-IYw",
  e: "AQAB"
};

let cachedKeyPromise = null;
const importPublicKey = () => {
  if (!cachedKeyPromise) {
    cachedKeyPromise = crypto.subtle.importKey(
      "jwk",
      CNIC_PUBLIC_KEY_JWK,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  }
  return cachedKeyPromise;
};

const bytesToBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

export const encryptCnic = async (plaintext) => {
  const key = await importPublicKey();
  const data = new TextEncoder().encode(String(plaintext || ""));
  const ciphertext = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, data);
  return bytesToBase64(new Uint8Array(ciphertext));
};
