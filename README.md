# TraceDetector

**Know what your image reveals before you share it.**

TraceDetector is an AI-assisted privacy check for images. Drop in a screenshot or a photo
and it reports what the image is giving away — personal details, contact information, ID and
document numbers, passwords and API keys, QR codes, confidential workplace content and the
hidden metadata inside the file — then tells you exactly what to remove before you hit share.

Built for the **Future of Work & Automation** problem statement: modern work runs on
screenshots, and the review step never scaled with it. TraceDetector is that review step,
automated into a two-second habit.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

That's it. **No API key is required** — the app is fully usable out of the box.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server + the `/api` routes (Vite middleware) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves the build, `/api` routes included |
| `npm run lint` | ESLint over app, server and test code |
| `npm test` | Node's built-in test runner (17 tests, no dependencies) |

---

## Three analysis engines, always clearly labelled

TraceDetector never blurs the line between a real detection and a sample one. Every result
carries the badge of the engine that produced it.

### 1. On-Device Scan — real, always available, nothing leaves the browser
Deterministic analysis that needs no API key:

- **EXIF / PNG / WEBP metadata** parsed from the raw bytes in `src/utils/metadata.js`
  (no dependency): GPS coordinates, camera make/model, serial numbers, author, software,
  capture timestamps, embedded comments.
- **QR codes and barcodes** via the browser's native `BarcodeDetector`, including the
  bounding box, so the overlay on the image is a real coordinate — and the contents of the
  code are run through the pattern detectors too.
- **Sensitive patterns** in the file name and inside metadata values.

It does *not* read text printed inside the picture, and the checklist says so rather than
marking those items as safe.

### 2. AI Analysis — optional, unlocked by a server-side Gemini key
Google's **Gemini** API (via the official `@google/genai` SDK) reads the image and returns
structured findings with bounding boxes. Its output is merged with the on-device scan, and
the text it reads back is re-checked by the rule-based detectors (exact matches for keys,
Luhn-valid card numbers, IBANs, …). If no `GEMINI_API_KEY` is configured, the AI Analysis
option stays visible but disabled, with a message directing you to On-Device Scan or Demo
Analysis instead — it never pretends to succeed.

### 3. Demo Analysis — a complete, honest walkthrough with no key
An authored sample report over a bundled mock screenshot (`src/assets/demo-screenshot.svg`).
The bounding boxes are measured against that image, so the overlay behaviour in the demo is
exactly what a real analysis looks like. It is labelled **Demo Analysis** in the engine
picker, the progress screen, the results header and the exported report:

> These findings are sample data shipped with the app — they are NOT produced by an AI model
> and do not describe a real image you uploaded.

---

## Setting up AI Analysis (Google Gemini, optional)

AI Analysis is powered by **Google's Gemini API** through the official `@google/genai`
SDK. Everything else in TraceDetector works with zero configuration; this section is only
needed if you want the real AI-powered engine instead of On-Device Scan / Demo Analysis.

1. **Install dependencies** (already done if you ran the quick start above):
   ```bash
   npm install
   ```
2. **Create a local env file.** Copy the example — `.env.local` is git-ignored, so your key
   never gets committed:
   ```bash
   cp .env.example .env.local
   ```
3. **Add your Gemini API key** to `.env.local`. Get one at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey):
   ```ini
   GEMINI_API_KEY=your-key-here
   ```
4. **Configure `GEMINI_MODEL` if necessary.** Leave it blank to use the built-in default
   (a current, vision-capable Gemini Flash model), or set it explicitly if your account
   needs a different model id, e.g.:
   ```ini
   GEMINI_MODEL=gemini-2.5-flash
   ```
   If a given model ever becomes unavailable for your key, just change this one value —
   nothing else in the app needs to change.
5. **Run the dev server:**
   ```bash
   npm run dev
   ```
6. **Open the app** at `http://localhost:5173`. The engine picker unlocks **AI Analysis**
   automatically — the UI asks `GET /api/status`, which reports *whether* a key exists and
   never what it is.

> ⚠️ **Never commit `.env` or `.env.local`, and never paste a real API key into chat, code
> review, or source control.** `.gitignore` already excludes `.env`, `.env.local` and
> `.env.*.local`; only `.env.example` (which ships with blank values) is tracked.

Because the variables are **not** prefixed with `VITE_`, Vite will not inline them into the
client bundle. There is no code path that can leak the key to the browser.

### Why there is a server at all

A Gemini API key cannot live in a React app — anything in the bundle is public. So the
browser talks to a same-origin endpoint and the server attaches the credential:

```
React frontend ──POST /api/analyze──▶ TraceDetector server/API ──▶ Gemini API
   (image data URL)                    (reads GEMINI_API_KEY)        │
                                                                      ▼
React results UI ◀── structured analysis response ◀── validated/normalised JSON
```

The same handler runs in both environments, so dev and production cannot drift:

- **locally** — `server/devApiPlugin.js` mounts it on the Vite dev/preview server
- **deployed** — `api/analyze.js` and `api/status.js` are standard Node serverless
  functions (Vercel-style `(req, res)`), picked up automatically by platforms that support
  an `api/` directory. Set the same environment variables in the host's dashboard.

Deploying to a purely static host also works: the `/api` routes simply 404, the app detects
that, and runs in On-Device + Demo mode with no errors.

### What happens without a key

If `GEMINI_API_KEY` is not set, `AI Analysis` stays visible in the engine picker but is
marked unavailable with the message *"AI Analysis requires a Gemini API key"*, and the app
steers you to **On-Device Scan** or **Demo Analysis** instead. It never fakes an AI result.

If Gemini returns an error, times out, is rate-limited, or sends back something that cannot
be parsed, TraceDetector shows a friendly message (*"AI analysis is temporarily
unavailable"*) with one-click links to On-Device Scan or Demo Analysis — you are never left
stuck on a loading screen, and no API key, stack trace, or raw provider error is ever shown.

---

## What you get back

- **Overall privacy risk score** (0–100) with Critical / High / Medium / Low / Safe bands.
  Severity-weighted with diminishing returns, damped by engine confidence, and floored so a
  single leaked credential can never present as a low score.
- **Finding cards** — category, type, severity, plain-language explanation, redacted
  evidence, location, how it was detected, confidence, and a concrete recommendation.
- **Image findings view** — the image with numbered overlay boxes, hover-linked to the
  cards. Findings whose engine returned no coordinates are grouped into an explicit
  "no region reported" note instead of being given a made-up box.
- **"Before you share this image" checklist** — eight items resolved from the actual
  analysis. An item is only `clear` when the engine genuinely checked it; otherwise it is
  `not checked`, never "safe".
- **Actions** — analyze another image, download a self-contained printable HTML report
  (opens straight into Save-as-PDF, image and overlays embedded), export JSON, clear
  everything.

Evidence is always redacted (`sk-ab••••••••`, `••••1111`, `pr••••@acme.io`) so the report is
safe to share even though the image is not.

---

## Privacy model

- No database, no accounts, no analytics. Refreshing the page erases the analysis.
- On-Device Scan reads the file with `FileReader` and never uploads it.
- AI Analysis sends the image to Google Gemini for one request (downscaled to
  1600px to keep it fast) and keeps no copy.
- The API key is read only by server-side code and is never returned by any endpoint.

---

## Project structure

```
api/                     server-side only — the key lives here and nowhere else
  _lib/config.js         reads env, exposes a key-free public status
  _lib/prompt.js         system prompt + JSON contract
  _lib/analyzeCore.js    validation, provider call, defensive response normalisation
  analyze.js  status.js  serverless entry points
server/devApiPlugin.js   mounts the same handlers on the Vite dev/preview server
tests/                   node:test suite for the pure logic

src/
  components/
    analyze/   Dropzone, ImagePreviewCard, EngineSelector, AnalysisProgress
    landing/   Hero, DashboardPreview, HowItWorks, DetectionGrid, WhyItMatters, Faq, CtaBanner
    layout/    Navbar, Footer
    results/   ResultsView, RiskSummary, ImageFindings, FindingsPanel, FindingCard,
               PrivacyChecklist, DetailsPanel
    ui/        Icon
  data/        taxonomy (severity/category), landing copy, demo report
  hooks/       useHashRoute, useAiStatus
  pages/       LandingPage, AnalyzePage
  services/    analysisService (orchestrator), aiClient, localScanner, reportService
  styles/      tokens, base, components, landing, analyze, results
  utils/       file, metadata (EXIF parser), patterns (detectors), scoring, checklist
```

Routing is a 12-line hash router, so the build works on any static host with no rewrite
rules. The only runtime dependencies are `react` and `react-dom`.

## Error handling

Every failure path ends somewhere useful, never on a spinner: unsupported type, oversized
file (>8 MB), empty or corrupt upload, undecodable image, provider unreachable, HTTP error,
timeout (client-side hard stop), and malformed model JSON. AI failures offer a one-click
fallback to On-Device Scan, a retry, or the demo.

## Limitations

- The AI layer is a judgement call: it can miss things and over-report. Confidence is shown
  on every finding. Rule-based matches (keys, GPS tags, Luhn-valid cards) are exact.
- Barcode scanning depends on the browser's `BarcodeDetector`; where it is unavailable the
  app says so instead of reporting a clean result.
- TraceDetector reports what to remove — it does not redact the image for you yet. That is
  the obvious next step.
