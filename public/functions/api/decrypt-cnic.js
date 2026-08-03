import { verifyAdminToken, decryptCnic } from "../_lib/cnic-crypto.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const MAX_ITEMS = 500;

export async function onRequestPost(context) {
  const { request, env } = context;

  const adminEmail = await verifyAdminToken(request);
  if (!adminEmail) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }

  if (!env.CNIC_PRIVATE_KEY) {
    return json({ ok: false, error: "CNIC decryption is not configured. Add CNIC_PRIVATE_KEY in Cloudflare Pages environment variables." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (!items.length) return json({ ok: false, error: "No items to decrypt." }, 400);

  const results = await Promise.all(items.map(async (item) => {
    const applicationId = String(item?.application_id || "");
    try {
      const cnic = await decryptCnic(env, item?.cnic_encrypted);
      return { application_id: applicationId, ok: true, cnic };
    } catch (error) {
      return { application_id: applicationId, ok: false, error: error.message || "Decryption failed." };
    }
  }));

  return json({ ok: true, items: results });
}
