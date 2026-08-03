# Success Factor - Implementation Reference

Cloudflare Pages static site + Firestore + Firebase Auth + Groq LLM.

## ⚠️ Git Workflow (CRITICAL)

**ALWAYS push to `main` branch only.**
- No feature branches
- All commits go to `main`
- Commits must be GPG signed with key `928DF747700C2142`
- Commit authors must be `Claude <noreply@anthropic.com>`

Violating this breaks the deployment CI/CD pipeline.

## Architecture

### Stack
- **CDN/Hosting:** Cloudflare Pages (zero cold start, auto-redeploy on git push)
- **Auth:** Firebase Authentication (Google OAuth 2.0 + ID token JWT)
- **Database:** Firestore (Realtime + REST APIs, `successscholarships-2026` project)
- **Serverless:** Cloudflare Pages Functions (Node.js runtime, `functions/api/*.js`)
- **LLM:** Groq API (LLama 3.1 8B Instant, T=0.2, max_tokens=450)
- **Build:** None (vanilla static site, instant deployment)
- **PWA:** `manifest.json` + `sw.js` (app-shell cache, offline fallback) - installable on desktop/mobile, registered from `assets/js/script.js`

### Database Schema

**Firestore Project:** `successscholarships-2026`

```firestore
/applications/{application_id}
  - student_name: string
  - cnic_number: string (13 digits, dashes optional)
  - email: string (indexed)
  - uid: string (Firebase UID, indexed)
  - grade: string
  - school: string
  - guardian_name: string
  - guardian_phone: string
  - city: string (enum: Karachi, Lahore, Islamabad, Other)
  - need_statement: string (textarea, 0-5000 chars)
  - goals: string (textarea, 0-5000 chars)
  - status: string (default: "Received", enum-like)
  - message: string (admin notes)
  - created_at: timestamp (serverTimestamp, server-generated)
  - updated_at: timestamp (serverTimestamp, server-generated)

/application_status/{application_id}
  - application_id: string (reference to /applications/{id})
  - student_name: string (denormalized for public queries)
  - city: string (denormalized)
  - status: string (indexed)
  - message: string (admin-provided update message)
  - updated_at: ISO8601 date string (YYYY-MM-DD, Asia/Karachi TZ)

/application_submissions/{uid}
  [Reserved/unused - not currently read or written by any code. Actual duplicate
   detection is a localStorage marker (`sahulat-submitted:{uid}`) on apply.html,
   verified against the real /applications/{id} doc via getDoc() on page load so
   a deleted application doesn't leave a false "already submitted" state - but the
   marker itself is still per-browser, not per-account, until this collection (or
   equivalent) is actually wired up server-side.]

/ai_usage/{date-ip}
  - date: YYYY-MM-DD (Asia/Karachi TZ, computed on request, indexed)
  - ip: string (from cf-connecting-ip header, indexed)
  - count: integer (incremented per request, no transaction needed)
  [In-memory fallback: Map<string, number> reset on function cold start]
```

**Composite Key Pattern:**
- `/ai_usage/{YYYY-MM-DD}:{ip}` e.g. `2026-07-20:203.0.113.1`
- Automatic TTL deletion (24h after creation) via Firestore TTL policy

### Routes & Auth

| Route | File | Auth Required | Purpose |
|-------|------|---|---------|
| `/` | `index.html` | None | Homepage (mission, stats, institutions, flow) |
| `/apply.html` | `apply.html` | Firebase Auth | Application form (writes to Firestore) |
| `/eligibility.html` | `eligibility.html` | None | Criteria breakdown (40% income weight, etc) |
| `/ask-ai.html` | `ask-ai.html` | Firebase Auth | Chat UI (calls `POST /api/ask-ai`) |
| `/status.html` | `status.html` | None | Public status lookup (reads `/application_status`) |
| `/auth.html` | `auth.html` | None | OAuth sign-in popup (redirects to apply.html) |
| `/contact.html` | `contact.html` | None | Support info, email links |
| `/admin.html` | `admin.html` | Firebase Auth (admin email) | Admin dashboard (full Firestore CRUD) |

**Firebase Config** (hardcoded, not a secret - scoped to Firestore rules):
- Centralized in `assets/js/firebase-config.js`, imported by every page-specific module (`apply.js`, `status.js`, `admin.js`, `auth.js`, `ask-ai.js`, `test.js`) - update the project config in one place
- Update in Firebase Console if the project changes, then update `firebase-config.js` to match

**Authorized Domains** (Firebase Console → Auth → Settings):
```
sahulatafamilytrust.pages.dev
*.sahulatafamilytrust.pages.dev
```

### Application Form (16-Question Questionnaire)

**Structure:**
- One question per screen for progressive disclosure
- Progress bar shows "Question X of 16"
- Back/Next buttons for navigation
- Auto-save to localStorage with draft recovery
- Duplicate detection via `sahulat-submitted:{uid}` marker
- Per-field validation beyond required/empty checks (`fieldValidators` in apply.js): CNIC/B-Form must be exactly 13 digits (dashes optional), sibling count must be an integer 0-20, school name must be 3-100 chars and contain a letter, phone number (if provided) must match a Pakistani mobile pattern. This blocks obviously-fake input (e.g. "1200" siblings, a phone number that's just repeated digits) but cannot verify real-world truth (e.g. that a named school genuinely exists) - that still relies on the admin's manual review in the admin dashboard.

**Questions (in order):**
1. Full name (text)
2. CNIC or B-Form number (text, must be exactly 13 digits, dashes optional, e.g. `12345-1234567-1`)
3. City (select: Karachi, Lahore, Islamabad, Rawalpindi, Other)
4. Grade/Year (select: Class 9-10, Matric, O/A Level, Intermediate/FSc Part 1-2, BA/BSc Year 1-4, MA/MSc Year 1-2, Other) - a fixed dropdown rather than free text, so it can't be filled with nonsensical values; starts at Class 9 since younger students aren't the target for this need-based, career-oriented scholarship
5. School/College name (text, 3-100 chars, must contain a letter)
6. Mother's name (optional text)
7. Father's employment status (select)
8. Number of siblings (number, validated 0-20)
9. Family has university degree? (radio: Yes/No)
10. Has disability or chronic health? (radio: Yes/No)
11. Reliable internet access? (select: Yes/reliable, Sometimes unreliable, No access - "No access" is intentionally kept: many applicants qualify for need-based aid precisely because they lack home internet and are applying from a library/school/borrowed device)
12. Financial need (textarea, 0-1000 chars)
13. Career goals (textarea, 0-1000 chars)
14. Why deserve scholarship? (textarea, 0-800 chars)
15. Phone number (optional text, validated against a Pakistani mobile number pattern if provided)
16. Preferred contact method (select: WhatsApp, Email, Phone, SMS)

**Accessibility Features:**
- Proper semantic HTML with `<fieldset>`, `<legend>`, `<label for="id">`
- All inputs have `aria-label` and `aria-required` attributes
- Hints connected via `aria-describedby`
- Character counters announce changes with `aria-live="polite"`
- Radio groups structured with `role="group"` + `aria-label`
- Progress bar has `role="progressbar"` with `aria-valuenow/valuemax/valuemin`
- Form messages in `aria-live` regions for status announcements
- Success page with `aria-live="assertive"` for completion announcement

**Read-Aloud Features:**
- 🔊 button reads current question (with question number and hints)
- 🔊 "Read my answer" button for textarea fields (review before next)
- Uses the site's `/api/tts` endpoint (Cloudflare Workers AI) via the shared `speakText` from `assets/js/read-aloud.js`
- Click to start/stop, Escape to cancel

### Accessibility on All Pages

**Global Read-Aloud Button:**
- Floating 🔊 button on all pages (bottom-right, fixed position)
- Click reads main page content aloud
- Turns pink while speaking, blue when idle
- Accessible via keyboard and screen readers
- Escape key cancels active speech

**Screen Reader Support:**
- Semantic HTML structure throughout
- Proper heading hierarchy and landmarks
- Form fields properly labeled and associated
- Dynamic content announced via `aria-live` regions
- Status messages and errors announced
- Links have descriptive text (no "click here")

### Security Rules

Admin email: `sahulatfamilypk@gmail.com`

**Admin override login:** `admin.html` has a small "Trouble signing in?" link below the Google button that reveals a password field. Submitting it signs in via Firebase Auth's Email/Password provider against a second admin account, email `admin-override@sahulatfamily.internal` (placeholder - swap for any email you control, it doesn't need to be a real inbox). This is a real Firebase Auth session, not a client-side gate, so Firestore rules must grant it the same access as the Google admin account (see `isAdmin()` below). Requires one-time Firebase Console setup:
1. Authentication → Sign-in method → enable **Email/Password** provider
2. Authentication → Users → Add user → email `admin-override@sahulatfamily.internal`, choose a strong password
Both `admin.js`'s `adminEmails` array and the Firestore `isAdmin()` rule must list this email alongside the Google admin email - update both together if it ever changes.

Security rules configured in Firebase Console (not versioned in git). Key constraints:
- Admin email (either `sahulatfamilypk@gmail.com` or the override email above, via `isAdmin()`): full read/write on all collections
- Users: create-only on `/applications` (cannot read others' apps)
- `/application_status`: public read (no auth required)
- `/application_submissions`: write-only during app submission (dedup check)

```
function isAdmin() {
  return request.auth != null
    && (request.auth.token.email == "sahulatfamilypk@gmail.com"
        || request.auth.token.email == "admin-override@sahulatfamily.internal");
}
```

**Note:** apply.html's `fieldValidators` (sibling count range, phone number format, etc.) only run in the browser - a user who bypasses the UI and writes to the Firestore REST API directly skips them entirely. For validation that can't be bypassed, add matching `request.resource.data.*` constraints to the Firestore rules for `/applications` in Firebase Console, e.g. `request.resource.data.sibling_count is int && request.resource.data.sibling_count >= 0 && request.resource.data.sibling_count <= 20`.

## Cloudflare Pages Functions

### POST `/api/ask-ai`

**Headers:**
```
Content-Type: application/json
x-firebase-token: <JWT from Firebase Auth>
cf-connecting-ip: <Source IP from Cloudflare>
```

**Request:**
```json
{
  "message": "How do I write my need statement?",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response (200):**
```json
{
  "ok": true,
  "answer": "Write about specific financial needs..."
}
```

**Errors:**
- `401 Unauthorized`: Missing `x-firebase-token` header or invalid JWT
- `429 Too Many Requests`: Rate limit exceeded (150/day per IP, except admin)
- `400 Bad Request`: Invalid JSON or missing message field
- `500 Internal Server Error`: Groq API error or Firebase SDK error

**Rate Limiting Implementation:**
```javascript
const ipUsage = new Map();  // Key: `${date}:${ip}`, Value: count
const IP_DAILY_LIMIT = 150;
const unlimitedAiEmail = "sahulatfamilypk@gmail.com";

// Check limit
const key = `${todayKey()}:${getClientIp(request)}`;
const current = ipUsage.get(key) || 0;
if (current >= IP_DAILY_LIMIT && !hasUnlimitedAi(request)) {
  return json({ ok: false, error: "Too many Sahulat AI messages..." }, 429);
}
ipUsage.set(key, current + 1);
```

**Groq Configuration:**
- Model: `env.GROQ_MODEL` (default `llama-3.1-8b-instant`)
- Temperature: 0.2 (deterministic, low variance)
- Max tokens: 450 (response length limit)
- API key: `env.GROQ_API_KEY` (Cloudflare Pages environment secret)

**Payload to Groq:**
```json
{
  "model": "llama-3.1-8b-instant",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "temperature": 0.2,
  "max_completion_tokens": 450
}
```

### POST `/api/tts`

**Purpose:** Powers the site-wide read-aloud button (`assets/js/read-aloud.js`) and the apply.html question/answer read-aloud controls. Synthesizes speech via Cloudflare Workers AI (`@cf/myshell-ai/melotts`) - runs on the same Cloudflare account as the rest of the site, no separate signup, no API key, no credit card, no end-user sign-in.

**Headers:**
```
Content-Type: application/json
x-firebase-token: <JWT from Firebase Auth>   (optional - unlocks unlimited daily budget for the admin email)
```

**Request:**
```json
{ "text": "Text to read aloud" }
```

**Response (200):** raw `audio/mpeg` body (played directly via an `Audio` object on the client - no JSON wrapper).

**Errors (JSON body):**
- `400 Bad Request`: Missing/empty `text`
- `429 Too Many Requests`: Daily per-IP character budget exceeded (20,000 chars/day, admin email exempt)
- `500 Internal Server Error`: `AI` binding not configured
- `502 Bad Gateway`: Workers AI call failed or returned no audio

**Config:**
- Requires an **AI binding** named `AI` on the Pages project: Cloudflare dashboard -> Pages project -> Settings -> Functions -> Bindings -> add binding, type "AI", variable name `AI`. Free plan includes a daily Workers AI neuron allowance; no credit card needed to enable it.
- `env.WORKERS_AI_TTS_LANG` (optional, defaults to `en`)
- Requests over 4000 characters are truncated to the nearest word boundary before synthesis, to bound response time on long page reads.
- Voice quality/customization is more limited than a dedicated TTS provider (MeloTTS is a lighter open-source model) - there's no separate voice-selection parameter beyond `lang`.

### POST `/api/send-confirmation`

**Internal function** (called during form submission, non-blocking).

**Payload (all application fields plus metadata):**
```json
{
  "application_id": "SF2026-ABC12",
  "student_name": "Ali Ahmed",
  "email": "student@example.com",
  "uid": "firebase-uid",
  "grade": "Class 10",
  "school": "Lahore Grammar School",
  "city": "Lahore",
  "financial_need": "Our family...",
  "career_aspirations": "I want to become...",
  "character_contribution": "I work hard and...",
  "created_at": "2026-07-20T15:30:00Z"
}
```

**Flow:**
1. Client calls `/api/send-confirmation` after successful Firestore write (fire-and-forget)
2. Cloudflare function forwards to Google Apps Script deployment URL
3. Apps Script sends **two emails**:
   - **Student Confirmation:** Welcome email with Application ID and next steps
   - **Admin Notification:** Full application details for review
4. Errors logged to console but don't block form submission
5. Return code: always 200 (async, non-blocking)

**Email Templates:**
- **Student Confirmation:** Welcome, Application ID in monospace, timeline, status check link
- **Admin Notification:** Formatted table of student info + essay sections + next steps link
- **Autoreply:** Sent when student emails, provides application/status/AI help links

**Setup:**
- Deploy Google Apps Script at https://script.google.com
- Copy deployment URL to `functions/api/send-confirmation.js` line 1
- Create Gmail trigger manually: Function: `handleIncomingEmail`, Event: "On receive"
- Both functions handle errors gracefully (don't crash)

## Progressive Web App

**Files:**
- `manifest.json` (project root) - name, icons, `theme_color: #2c2c85`, `display: standalone`, `start_url: /index.html`
- `sw.js` (project root) - service worker; precaches the app shell (main HTML pages, `styles.css`, `script.js`, `read-aloud.js`, `ui.js`, icons) on install, network-first for page navigations with cache fallback (so offline visits still load something), cache-first for static assets, bumps `CACHE_NAME` to invalidate old caches
- `assets/icons/` - `icon-192.png`, `icon-512.png` (any + maskable purposes), `apple-touch-icon.png` (180x180), generated from `favicon.svg` with white padding for the maskable safe zone
- Registered from `assets/js/script.js` on `window load`, guarded by `"serviceWorker" in navigator`
- `<link rel="manifest">`, `<meta name="theme-color">`, and `<link rel="apple-touch-icon">` are on every page's `<head>`, right after the favicon link

**Updating the icon:** regenerate from `favicon.svg` with ImageMagick, e.g. `convert -background white -density 400 favicon.svg -resize 380x380 -gravity center -extent 512x512 -background white -alpha remove -alpha off assets/icons/icon-512.png` (adjust the `-resize`/`-extent` pair per target size, keeping ~25% padding for the maskable safe zone).

**Updating cached files:** bump `CACHE_NAME` in `sw.js` (e.g. `sahulat-family-v2`) whenever `PRECACHE_URLS` changes or a precached file's content changes meaningfully - the old cache is deleted on activate.

## Admin Dashboard

**Overview:**
- Stats bar at the top of the dashboard: total + a count per status (Received, Under Review, Needs Info, Approved, Rejected), each with a color-coded dot matching that status's pill color
- Compact application list with expandable cards
- Click header to expand/collapse full details
- Search by student name, application ID, email, or phone number
- Filter by status
- Status pills are color-coded per status (navy/amber/pink/green/red) for fast visual scanning, instead of a single uniform pill style

**Expandable Card Layout:**
```
┌─ Student Name [Status Badge] ▼ ─┐
│                                   │ ← Click to expand
├─────────────────────────────────┤
│ Application Info                │
│ - ID, Email, Phone,             │
│   Preferred Contact, City,      │
│   Grade, School, Submitted Date │
│                                   │
│ Family & Background             │
│ - Mother's Name, Father's       │
│   Employment, Siblings,         │
│   Family Has University Degree, │
│   Disability/Chronic Health,    │
│   Internet Access at Home       │
│                                   │
│ Financial Need                  │
│ [scrollable text box]           │
│                                   │
│ Career Goals                    │
│ [scrollable text box]           │
│                                   │
│ Character & Contribution        │
│ [scrollable text box]           │
│                                   │
│ Message for Student (editable)  │
│ [textarea]                      │
│                                   │
│ Internal Admin Notes (editable) │
│ [textarea]                      │
│                                   │
│ Status: [Dropdown] [Save]       │
│ [Download] [Delete]             │
└─────────────────────────────────┘
```

**Features:**
- **Message Customization:** Edit what student sees in status lookup
- **Admin Notes:** Internal comments (not visible to student)
- **Status Updates:** Change status with immediate Firestore sync
- **Download:** Export application as .txt file (includes every field, including Family & Background)
- **Delete:** Remove application (with confirmation)
- **Bulk Export:** CSV export of visible applications (includes every field, including Family & Background)
- **Refresh:** Reload from Firestore

**Note:** the Family & Background fields (siblings count, father's employment, family degree, disability, internet access) map directly to the eligibility scoring criteria described on `eligibility.html` (family size 15%, guardian work 10%, etc) - they were previously stored in Firestore but not shown anywhere in the admin UI, making it impossible to actually review an application against the documented criteria. Fixed as part of the admin dashboard revamp.

## Local Development

### No Build Step
Static site served as-is:
```bash
cd /home/user/SuccessScholarships
python3 -m http.server 8000
# Visit http://localhost:8000
```

### Firestore Local Emulator (Optional)
```bash
firebase emulators:start --only firestore
# Update config in HTML:
# const db = getFirestore(app);
# connectFirestoreEmulator(db, 'localhost', 8080);
```

### Deploying
```bash
git push origin main
# Cloudflare Pages webhook triggered
# → Clone repo
# → No build step (instant)
# → Deploy to edge
# → Cache invalidation
# ~30 seconds total
```

## Debugging

### Admin Console
```
Cloudflare Dashboard
  → Workers & Pages
  → Pages
  → sahulatfamily
  → Deployments
  → Functions logs
```

### Firebase Console
```
Firestore → Collections (inspect documents)
Authentication → Users (verify auth state)
Security Rules → Test Rules (validate rule logic)
```

### Browser DevTools
```
Console: Firebase SDK errors, JS exceptions
Network: Firestore REST API calls (/v1/projects/.../documents)
Local Storage: Firebase session tokens, duplicate markers
```

### Test Groq API locally
```bash
curl -X POST https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b-instant",
    "messages": [{"role": "user", "content": "Hello"}],
    "temperature": 0.2,
    "max_completion_tokens": 450
  }'
```

## Application ID Generation

```javascript
const makeId = () => `SF2026-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
```

**Analysis:**
- Format: `SF2026-` + 5 random base-36 alphanumeric chars (0-9, a-z)
- Total entropy: 36^5 = 60,466,176 possible IDs
- Birthday problem collision: ~1 in 1,679,616 after 1000 IDs
- **No database uniqueness constraint** (applications collection uses ID as doc ID)
- Collision behavior: Later submission overwrites earlier one (data loss risk)
- **Workaround:** Implement atomic counter or UUID v4 (not current)

## Migration Procedures

### Change Admin Email

1. **Firebase Console:**
   - Authentication → Users → Add new user (new admin email)

2. **Firestore Rules** (Firebase Console):
   ```javascript
   allow read, write: if request.auth.token.email == 'newemail@example.com';
   ```

3. **HTML Files:**
   - `admin.html`: Check for hardcoded validation (if present)
   - `ask-ai.js`: Update unlimited AI email in function
   - `apply.html`: Update confirmation email logic (if present)

4. **Documentation:**
   - `CLAUDE.md`: Update admin email references
   - `README.md`: Update admin email references

### Update Eligibility Criteria

Edit `eligibility.html` directly (static content, no code changes needed):
```html
<article class="criteria-card">
  <strong>40%</strong>
  <h2>Family money</h2>
  <p>Description...</p>
</article>
```

### Add New Application Status

1. **Firestore Console:**
   - Add document to `application_status` collection
   - Set status field to new value (e.g., "Appeal Under Review")

2. **Status lookup** (`status.html`):
   - Already supports any status string (no hardcoding)
   - Frontend renders whatever is in Firestore

### Migrate Firebase Project

1. Create new Firebase project
2. Update config in ALL HTML files:
   - `apply.html`
   - `status.html`
   - `admin.html`
   - `auth.html`
3. Update Firestore security rules (copy/recreate)
4. Add new domain to Firebase Auth → Authorized Domains
5. Re-create collections (or export/import data via Firebase tools)
6. Update `CLAUDE.md` & `README.md` with new project ID
7. Commit with message: `Migrate Firebase to new project: <project-id>`

## Performance Notes

- **No build/bundling** → served raw HTML/CSS/JS
- **Firebase SDK from CDN** → gstatic.com (slow first load, cached thereafter)
- **Firestore REST API** → ~100-200ms latency (regional replication)
- **Groq API** → ~1-2s response time (LLM inference)
- **Function cold starts** → ~5-10s first request, then instant (warm)
- **Rate limiting** → in-memory Map, resets on cold start (~hourly)

## Testing Checklist

- [ ] Application form: Create → Verify Firestore document populated
- [ ] Duplicate warning: Resubmit → See warning dialog + marker in localStorage
- [ ] Status lookup: Query own ID → See "Received" status card
- [ ] Ask AI: Sign in → Ask question → Get response within 2-3s
- [ ] Admin dashboard: Load `/admin.html` → Verify auth redirect if not admin
- [ ] Mobile: Check responsiveness (max-width: 640px breakpoint)
- [ ] OAuth flow: Sign in → Redirect to apply → Sign out (token refresh)
- [ ] Rate limit: Submit 150+ requests from single IP → See 429 response
- [ ] Confirmation email: Submit application → Verify email delivered (async, may fail silently)

## Endpoints Summary

| Endpoint | Method | Auth | Rate Limit | Purpose |
|----------|--------|------|-----------|---------|
| `/api/ask-ai` | POST | Required (JWT) | 150/day per IP | Groq LLM chat |
| `/api/tts` | POST | None (JWT unlocks unlimited for admin) | 20,000 chars/day per IP | Workers AI read-aloud |
| `/api/send-confirmation` | POST | Internal | None | Email handler |

## Known Limitations

1. **In-memory rate limiting** - Resets on function cold start (~hourly), users can exceed 150/day
2. **No uniqueness constraint on application IDs** - Collisions (~1/1.6M) overwrite previous submission
3. **Firebase config in client-side JS** - API key visible in source (not a secret, scoped to Firestore rules)
4. **Eventual consistency** - Status updates may lag behind application writes (~few seconds)
5. **No offline support** - Requires active internet connection for Firestore operations
6. **`/api/tts` voice quality is capped by MeloTTS** - Workers AI's `@cf/myshell-ai/melotts` is a lighter open-source model with no per-voice selection beyond `lang`; it won't match a dedicated cloud TTS provider's naturalness
7. **Duplicate-submission marker is per-browser, not per-account** - apply.html verifies its localStorage "already submitted" marker against Firestore on load (so a deleted application no longer falsely blocks resubmission), but a student who switches browsers/devices won't carry that marker over, since `/application_submissions` (documented above) isn't actually wired up server-side
