// Server-side only: decrypts CNIC/B-Form numbers encrypted in the browser with the public key in
// assets/js/cnic-crypto.js. The private key never leaves Cloudflare - it is read from the
// CNIC_PRIVATE_KEY environment secret (a JWK JSON string), configured in Cloudflare Pages ->
// Settings -> Environment variables. Also verifies Firebase ID tokens (RS256) so decryption is
// only ever performed for a request that really is the scholarship admin, not just anyone who
// can forge an unsigned-looking JWT payload.

const FIREBASE_PROJECT_ID = "successscholarships-2026";
const ADMIN_EMAILS = ["sahulatfamilypk@gmail.com", "admin-override@sahulatfamily.internal"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cachedJwks = null;
let cachedJwksAt = 0;
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;

const base64UrlToBytes = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const base64ToBytes = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const getJwks = async () => {
  if (cachedJwks && Date.now() - cachedJwksAt < JWKS_TTL_MS) return cachedJwks;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error("Could not fetch Firebase public keys.");
  const data = await response.json();
  cachedJwks = data.keys || [];
  cachedJwksAt = Date.now();
  return cachedJwks;
};

// Verifies signature, issuer, audience and expiry per Firebase's ID token verification rules.
// Returns the token's email claim on success, or null if the token is missing/invalid/expired/
// not an admin.
export const verifyAdminToken = async (request) => {
  const token = request.headers.get("x-firebase-token") || "";
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }

  if (header.alg !== "RS256") return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + 60) return null;
  if (payload.aud !== FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) return null;
  if (!payload.sub) return null;

  const email = String(payload.email || "").trim().toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return null;

  const jwks = await getJwks();
  const jwk = jwks.find((candidate) => candidate.kid === header.kid);
  if (!jwk) return null;

  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch {
    return null;
  }

  const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlToBytes(signaturePart);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
  if (!valid) return null;

  return email;
};

let cachedPrivateKeyPromise = null;
const importPrivateKey = (env) => {
  if (!cachedPrivateKeyPromise) {
    cachedPrivateKeyPromise = (async () => {
      if (!env.CNIC_PRIVATE_KEY) throw new Error("CNIC_PRIVATE_KEY is not configured.");
      const jwk = JSON.parse(env.CNIC_PRIVATE_KEY);
      return crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
      );
    })();
  }
  return cachedPrivateKeyPromise;
};

export const decryptCnic = async (env, ciphertextBase64) => {
  const privateKey = await importPrivateKey(env);
  const ciphertext = base64ToBytes(String(ciphertextBase64 || ""));
  const plaintext = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, ciphertext);
  return new TextDecoder().decode(plaintext);
};
