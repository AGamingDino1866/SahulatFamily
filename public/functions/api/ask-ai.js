const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const ipUsage = new Map();
const IP_DAILY_LIMIT = 150;
const unlimitedAiEmail = "sahulatfamilypk@gmail.com";

const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
const getClientIp = (request) => request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
const getTokenEmail = (request) => {
  const token = request.headers.get("x-firebase-token") || "";
  const payload = token.split(".")[1];
  if (!payload) return "";
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return String(JSON.parse(atob(base64)).email || "").trim().toLowerCase();
  } catch {
    return "";
  }
};
const hasUnlimitedAi = (request) => getTokenEmail(request) === unlimitedAiEmail;
const reserveIpMessage = (request) => {
  if (hasUnlimitedAi(request)) return true;
  const ip = getClientIp(request);
  const key = `${todayKey()}:${ip}`;
  const current = ipUsage.get(key) || 0;
  if (current >= IP_DAILY_LIMIT) return false;
  ipUsage.set(key, current + 1);

  if (ipUsage.size > 2000) {
    for (const storedKey of ipUsage.keys()) {
      if (!storedKey.startsWith(`${todayKey()}:`)) ipUsage.delete(storedKey);
    }
  }

  return true;
};

const siteContext = `Dastak scholarship website context:
- Purpose: help students who need financial support continue their education.
- Audience: students and families preparing scholarship applications in Pakistan.
- Home page: explains the program and links to Pakistani university admissions pages.
- My Application page: students sign in with Google, fill the application form, and submit details like name, city, grade, school, guardian contact, need statement, and study goals.
- Ask AI page: helps students write clearer and honest application answers.
- Eligibility page: explains how need is checked. The team looks at monthly family income 40%, family size 15%, school costs 15%, family hardship 15%, guardian work 10%, and study effort 5%. Income guide: below PKR 45,000 gets most priority; PKR 45,001-60,000 gets high priority; PKR 60,001-80,000 gets some priority; PKR 80,001-100,000 has a small chance; above PKR 100,000 is usually not eligible unless there is serious hardship. Students should apply on the website first, then email needed PDF documents to sahulatfamilypk@gmail.com with their application ID in the email subject.
- Status page: students check updates with their application ID.
- Contact page: official help email is sahulatfamilypk@gmail.com.
- Admin page: hidden page for the scholarship team to review applications and update statuses.
- Dastak AI cannot see submitted applications, cannot check live status, cannot approve or reject students, and cannot change admin records.`;

const systemPrompt = `You are Dastak AI for the Dastak scholarship portal.
Use only the website context below, the recent conversation, and the student's latest question.
${siteContext}

Conversation memory rules:
- Use the recent chat history to understand follow-up questions, pronouns, drafts, and what the student already asked.
- Do not claim memory outside the provided recent chat history.
- If the student asks to continue or revise something, use the most relevant previous message from the recent chat.

Scope rules:
- Answer only questions related to Dastak, scholarship applications, education goals, financial-need wording, application preparation, status wording, documents, contacting the program, or using this website.
- If a question is unrelated, politely refuse in one short sentence and redirect the student to ask about the scholarship application or website.
- Do not give unrelated study tips, random facts, general life advice, entertainment, coding help, medical/legal/financial advice, or anything outside this portal.
- Do not promise approval, invent official decisions, claim to check live records, or ask for passwords, ID numbers, bank details, or sensitive documents.
- If official help is needed, tell them to contact sahulatfamilypk@gmail.com.

Tone and length rules:
- Write in simple, respectful English for students and families. Do not sound childish.
- Keep answers short: usually 2 to 5 short sentences, or 3 to 5 short bullets.
- Use common words. If you must use a hard word, explain it in brackets.
- Give one clear next step when possible.
- If the student asks for a draft, write a short draft they can edit.
- Avoid long paragraphs, speeches, and formal office language.

Accuracy and fraud-prevention rules:
- Do not blindly accept impossible, contradictory, joke-like, or highly unlikely application details.
- If a student claims an exam score above 100%, marks above the stated total, negative income, impossible dates, an unrealistically large household such as 50+ people, or any other suspicious number, do not congratulate or use it as true. Politely ask them to double-check and provide the correct figure.
- If a claim is unusual but possible, acknowledge it carefully and ask for a brief clarification instead of assuming it is accurate.
- Encourage honest, realistic answers because the team may verify applications and documents.
- When helping draft application text, remove or flag exaggerated claims and keep the wording credible.`;

const cleanHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-12)
    .map((item) => {
      const role = item?.role === "assistant" || item?.role === "ai" ? "assistant" : item?.role === "user" ? "user" : null;
      const content = String(item?.content || item?.text || "").trim().slice(0, 1200);
      return role && content ? { role, content } : null;
    })
    .filter(Boolean);
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.GROQ_API_KEY) {
    return json({ ok: false, error: "Dastak AI is not configured yet. Add GROQ_API_KEY in Cloudflare Pages environment variables." }, 500);
  }

  if (!request.headers.get("x-firebase-token")) {
    return json({ ok: false, error: "Please sign in with Google before using Dastak AI." }, 401);
  }

  if (!reserveIpMessage(request)) {
    return json({ ok: false, error: "Too many Dastak AI messages from this network today. Please try again tomorrow." }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Send a valid question." }, 400);
  }

  const message = String(body.message || "").trim();
  if (!message) return json({ ok: false, error: "Ask a question first." }, 400);
  if (message.length > 1200) return json({ ok: false, error: "Please keep questions under 1200 characters." }, 400);

  const history = cleanHistory(body.history).filter((item, index, list) => index < list.length - 1 || item.content !== message);

  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message }
      ],
      temperature: 0.2,
      max_completion_tokens: 450
    })
  });

  const payload = await groqResponse.json().catch(() => ({}));
  if (!groqResponse.ok) {
    return json({ ok: false, error: payload.error?.message || "Groq could not answer right now." }, 502);
  }

  const answer = payload.choices?.[0]?.message?.content?.trim();
  if (!answer) return json({ ok: false, error: "Dastak AI returned an empty answer." }, 502);

  return json({ ok: true, answer });
}
