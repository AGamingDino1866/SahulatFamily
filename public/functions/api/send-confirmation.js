import { decryptCnic } from "../_lib/cnic-crypto.js";

const emailScriptUrl = "https://script.google.com/macros/s/AKfycbw_h2c0Yc5MXJ4psqJPHRouBkbSYArRRVZwnk2f0QbRB1jrZCYNLRVNOCEsNN4C4W6D/exec";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const normalizeStrings = (value) => {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeStrings(item)]));
  }
  return value;
};

export async function onRequestPost(context) {
  let payload;
  try {
    payload = normalizeStrings(await context.request.json());
  } catch {
    return json({ ok: false, error: "Invalid email request." }, 400);
  }

  if (!payload.email || !payload.application_id) {
    return json({ ok: false, error: "Missing applicant email or application ID." }, 400);
  }

  if (payload.cnic_encrypted) {
    try {
      payload.cnic_number = await decryptCnic(context.env, payload.cnic_encrypted);
    } catch (error) {
      console.error("CNIC decrypt error:", error.message);
    }
    delete payload.cnic_encrypted;
  }

  try {
    const response = await fetch(emailScriptUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok || data.ok === false) {
      return json({ ok: false, error: data.error || `Email script failed with status ${response.status}.` }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.message || "Email could not be sent." }, 502);
  }
}
