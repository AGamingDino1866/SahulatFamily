# Sahulat Family Scholarship Portal

A website where students in Pakistan apply for need-based education scholarships, check their application status, and get AI-assisted help writing their application - and where the scholarship team reviews and manages every submission.

**Production:** https://sahulatfamilytrust.pages.dev

## What this project does

- **Students** sign in with Google, fill out a 15-question application (financial need, school, family background), and submit it
- **An AI assistant** ("Sahulat AI") answers questions about eligibility and helps students write clearer, honest answers
- **A public status page** lets anyone look up an application's review status by ID, without needing to sign in
- **An admin dashboard** (hidden from public navigation) lets the scholarship team review every application's full details, update its status, leave notes, and export data
- **Every page** has a floating read-aloud button and per-question read-aloud in the application form, for students with limited literacy or vision
- **The whole site works offline** as an installable PWA once visited, and requires no build step - it's plain HTML/CSS/JS deployed as-is

Technically: a JAMstack scholarship portal with a vanilla HTML/CSS/JS frontend, Firestore for data, Groq for the AI assistant, and Cloudflare Pages for hosting and serverless functions.

## Stack & Dependencies

| Layer | Technology | Notes |
|-------|-----------|-------|
| **CDN** | Cloudflare Pages | Zero cold-start, automatic redeployment on git push |
| **Frontend** | Vanilla JS | No build/bundling, ES6 modules for Firebase SDK |
| **Auth** | Firebase Auth | Google OAuth 2.0, JWT token in `x-firebase-token` header |
| **Database** | Firestore (Realtime + REST) | `successscholarships-2026` project, multi-region replication |
| **Serverless** | Cloudflare Pages Functions | Node.js runtime, `functions/api/*.js` entry points |
| **LLM** | Groq API | `llama-3.1-8b-instant` (default), 450 max_tokens, T=0.2 |

## Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Firestore read (single doc) | 100-200ms | Regional replication, cached |
| Firestore write (batch) | 50-150ms | Includes index updates |
| Groq API (LLM inference) | 1-2s | Token generation, context-dependent |
| Firebase Auth (token validation) | 10-50ms | Local JWT decode, minimal network |

**Cold starts:** Functions restart ~hourly (serverless), in-memory rate limit counters reset.

**Caching strategy:**
- Static assets: CF cache headers (default 30 days)
- Firebase SDK: CDN-cached (gstatic.com)
- Firestore docs: Client-side SDK cache + browser storage

## File Structure

Every HTML page follows the same pattern: `assets/css/styles.css` (shared theme) + `assets/css/{page}.css` (page-specific styles) + `assets/js/script.js` (shared nav/theme/PWA) + `assets/js/{page}.js` if the page needs its own logic (Firebase calls, form handling, etc). Changing a shared color or shared behavior means editing one file, not every page.

```
public/
├── index.html              # Homepage + mission + stats + HowItWorks flow
├── apply.html              # Step-by-step questionnaire (15 questions), Firebase writes, duplicate check, read-aloud buttons
├── eligibility.html        # Criteria breakdown (40% income, 15% family size, etc)
├── ask-ai.html             # Chat UI, Groq integration, rate limit display, read-aloud button
├── status.html             # Public status lookup, printable receipt, read-aloud button
├── auth.html               # Google OAuth popup, redirect to /apply.html
├── contact.html            # Support info, email + WhatsApp links, read-aloud button
├── admin.html              # Application dashboard with expandable cards, status bar, status editor
├── faq.html                # Frequently asked questions, read-aloud button
├── test.html               # Testing/diagnostics page
├── manifest.json           # PWA manifest (icons, theme color, standalone display)
├── sw.js                   # Service worker: app-shell precache + offline fallback
├── robots.txt              # Search engine crawl rules
├── sitemap.xml             # Search engine sitemap
├── _routes.json            # CF Pages Functions routing config (routes /api/* only)
├── favicon.svg
├── assets/
│   ├── css/
│   │   ├── styles.css      # Shared theme: CSS custom properties (colors, shadows), base layout
│   │   └── {page}.css      # One file per page (apply.css, index.css, admin.css, ...) - page-specific layout only
│   ├── img/                # Hero images (education-hero.png/webp)
│   ├── icons/              # PWA icons (192/512 + apple-touch-icon), generated from favicon.svg
│   ├── js/
│   │   ├── script.js       # Shared: nav setup, mobile menu, navy theme injection, SW registration - loaded on every page
│   │   ├── firebase-config.js # Shared Firebase project config, imported by every page below - change the project in one place
│   │   ├── admin.js        # admin.html: Firestore CRUD for applications, status updates, CSV export
│   │   ├── apply.js        # apply.html: 15-question form logic, validation, submission
│   │   ├── ask-ai.js       # ask-ai.html: chat UI + Groq calls
│   │   ├── auth.js         # auth.html: Google sign-in popup
│   │   ├── status.js       # status.html: status lookup logic
│   │   ├── test.js         # test.html: diagnostics logic
│   │   ├── read-aloud.js   # Shared: global text-to-speech button on all pages, via /api/tts
│   │   └── ui.js           # Unused stub (dark mode removed)
├── functions/
│   ├── _middleware.js      # Pages Functions middleware (pass-through)
│   └── api/
│       ├── ask-ai.js       # Groq API wrapper, rate limiting (150/day per IP)
│       ├── tts.js          # Cloudflare Workers AI text-to-speech proxy
│       └── send-confirmation.js # Student confirmation + admin notification emails via Google Apps Script
└── CLAUDE.md               # Implementation reference (repo root)
```

## Application Form Features

**Step-by-Step Questionnaire (15 Questions)**
- One question per screen for better UX
- Progress bar showing "Question X of 15"
- Auto-save to localStorage with draft recovery
- Duplicate application detection: verified against Firestore (not just local state), so a deleted application doesn't falsely block resubmission
- Per-field validation beyond required/empty checks (sibling count range, phone number format, school name plausibility)

**Question Types:**
- Text inputs (name, school, phone)
- Number inputs (sibling count)
- Select dropdowns (city, grade, employment status, contact preference)
- Radio buttons (yes/no questions)
- Textareas with character counters (financial need, career goals, character contribution)

**Accessibility:**
- Proper labels and ARIA attributes for screen readers
- Read-aloud button 🔊 for each question
- "Read my answer" button for textarea fields
- Keyboard-only navigation (Tab, Enter/Space)
- Progress bar announces current question
- Form messages announced via aria-live regions

## Accessibility & Read-Aloud

**Global Read-Aloud Button (🔊)**
- Floating button on all pages (bottom-right corner)
- Reads main page content aloud via the site's `/api/tts` endpoint (Cloudflare Workers AI - no account or API key needed)
- Click to start/stop, press Escape to cancel

**Form-Specific Read-Aloud:**
- Question read button for each question
- Answer review button for textareas before submission
- Character count announcements on input

## Email System

**Student Confirmation Email**
- Auto-sent when application submitted
- Includes Application ID for status tracking
- Next steps and timeline

**Admin Notification Email**
- Sent to sahulatfamilypk@gmail.com
- Contains full application details
- Formatted for easy review and follow-up

**Autoreply to Incoming Emails**
- Automatic response to students who email
- Gmail trigger setup (manual one-time configuration)
- Provides links to application, status, and AI help

## Admin Dashboard

Hidden from public navigation, restricted to the scholarship team's Google account.

**Application Management:**
- Stats bar: total applications + a color-coded count per status
- Compact list view with expandable cards, color-coded status pills
- Search by student name, application ID, email, or phone number
- Filter by application status
- Full detail view per application: contact info, **Family & Background** (mother's name, father's employment, siblings, family degree, disability, internet access - the fields the eligibility criteria are actually scored on), financial need, career goals, character statement

**Status Updates:**
- Customize message shown to student
- Internal admin notes (not visible to student)
- Change application status (Received, Under Review, Needs Info, Approved, Rejected)
- Download application as .txt (every field)
- Delete application (with confirmation)

**Batch Operations:**
- Export all visible applications as CSV (every field)
- Refresh application list
- Sign out
