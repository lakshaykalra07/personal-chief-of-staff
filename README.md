# 🧠 Personal Chief of Staff

A local AI agent that acts as your Chief of Staff — reading your Gmail, summarising what matters, and reviewing your Google Docs. Powered by [Claude](https://anthropic.com) (Anthropic SDK) and Google APIs. Runs entirely on your machine against your own API keys.

No SaaS. No subscriptions. No data leaving your control.

---

## What it does

### 📬 Gmail Digest
Every morning, run one command and get a prioritised email summary sent to your inbox.

- Skips promotions, newsletters you didn't ask about, and social notifications
- **Needs Your Reply** — emails where someone is waiting on you, with a one-line suggested action
- **Urgent / Important** — time-sensitive items that don't require a reply
- **FYI** — newsletters and updates, each with 3–5 Claude-extracted bullet takeaways
- Handles large inboxes by batching API calls with automatic rate-limit retry

### 📝 Google Docs Reviewer
Point it at any Google Doc URL and get a strategic review from Claude, written in your voice.

- **Multi-comment mode** — generates 8–12 targeted comments (risks, gaps, questions, suggestions), shows you all of them, then posts only the ones you approve
- **Single review mode** — one cohesive self-review inserted directly at the top of the document as a text block (no sidebar comment quirks)
- Prompt can be focused with a custom instruction: *"focus on delivery risks"*, *"check ROI assumptions"*

---

## Screenshots

### Gmail Digest — email output
![Gmail Digest](docs/screenshots/gmail-digest.png)

### Gmail Digest — terminal output
![Terminal output](docs/screenshots/terminal-digest.png)

### Google Docs — review inserted at top of document
![Docs review](docs/screenshots/docs-review.png)

### Google Docs — multi-comment approval flow
![Comment approval](docs/screenshots/comment-approval.png)

> **Note:** Add your own screenshots to `docs/screenshots/` after your first run.

---

## Prerequisites

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com)
- A Google account
- A Google Cloud project (free tier is sufficient)

---

## Setup

### 1. Clone and install

```bash
git clone https://gitlab.com/lakshaykalra/personal-chief-of-staff.git
cd personal-chief-of-staff
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...        # from console.anthropic.com
GMAIL_CLIENT_ID=                    # from Google Cloud Console
GMAIL_CLIENT_SECRET=                # from Google Cloud Console
GMAIL_REDIRECT_URI=http://localhost:3000/oauth2callback
DIGEST_TO=you@gmail.com             # where to send the digest
```

### 3. Create a Google Cloud project

**Enable APIs:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project (e.g. `personal-cos`)
2. **APIs & Services → Enable APIs & Services** — search for and enable:
   - **Gmail API**
   - **Google Docs API**
   - **Google Drive API**

**Configure OAuth consent screen:**

1. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - Fill in app name (e.g. `personal-cos`), add your own email as a test user
2. **Scopes** — add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/documents.readonly`
   - `https://www.googleapis.com/auth/drive`

**Create OAuth credentials:**

1. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
2. Download the JSON file → rename it to `credentials.json` → place it in the project root
3. Copy `client_id` and `client_secret` from it into your `.env`

**Authorize (one-time):**

```bash
npm run auth
```

A browser window opens. Sign in and click Allow. A `token.json` is saved locally — you won't need to repeat this step.

### 4. Personalise `persona.md`

This is the most important configuration file. Claude reads it as a system prompt on every run. Fill in:

- Your role and context
- Who your high-priority senders are
- Your communication tone and sign-off style
- What kinds of emails you want flagged vs. skipped

The more specific you are, the more useful the outputs.

---

## Usage

### Gmail Digest

```bash
npm run digest
```

Fetches the last 24 hours of email (Primary and Updates tabs), summarises with Claude, and sends the digest to `DIGEST_TO`.

**Example terminal output:**

```
Fetching emails from the last 24h...
Found 34 emails to process.
Summarising with Claude...
  Batch 1/2 (30 emails)...
  Batch 2/2 (4 emails)...
  → 4 needs reply, 2 urgent, 11 FYI
Sending digest to you@gmail.com...
Done. Digest sent.
```

**Change the lookback window** — edit `src/config.ts`:

```ts
lookbackHours: 24,   // change to 48, 72, etc.
```

---

### Google Docs Reviewer

#### Multi-comment mode

```bash
npm run comment -- "<google-doc-url>"
```

All proposed comments are printed first (numbered, with category and quoted text), then you choose which ones to post:

```
─────────────────────────────────────────
[1] 🔴 Risk

Quoted text:
  "Direct connection with Chase bank in US to save processing costs"

Comment:
  Direct bank integration requires becoming a registered ISO or obtaining
  a sponsored acquiring relationship — a multi-month regulatory process
  not mentioned in the roadmap. Has legal confirmed this is available
  to Viator?

─────────────────────────────────────────
Post which comments? (all / comma-separated numbers e.g. 1,3,5 / none):
```

Type `all`, `1,3,5`, or `none`.

**With a focus instruction:**

```bash
npm run comment -- "<google-doc-url>" "focus on delivery risks in Q3"
```

#### Single consolidated review mode

```bash
npm run comment -- "<google-doc-url>" --single
```

Generates one cohesive self-review (written in first person, as if you're reviewing your own work) and inserts it as a formatted text block at the very top of the document. No sidebar comment quirks.

---

## Project structure

```
.
├── src/
│   ├── config.ts                  # Typed env loader
│   ├── gmail/
│   │   ├── auth.ts                # OAuth2 flow — shared by all agents
│   │   ├── reader.ts              # Fetch, filter, and decode emails
│   │   └── sender.ts              # Send digest via Gmail API
│   ├── digest/
│   │   ├── summariser.ts          # Claude summarisation with batching + retry
│   │   ├── formatter.ts           # HTML + plain-text email renderer
│   │   └── run.ts                 # Entry point › npm run digest
│   └── gdocs/
│       ├── reader.ts              # Fetch and extract doc content
│       ├── suggester.ts           # Claude comment + review generation
│       ├── commenter.ts           # Post comments via Drive API
│       ├── inserter.ts            # Insert review text via Docs API
│       └── run.ts                 # Entry point › npm run comment
├── persona.md                     # Your role, priorities, and style
├── .env.example                   # Environment variable template
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## How it works

```
Gmail Digest
────────────
Gmail API ──► reader.ts     ──► Claude (batched, cached system prompt)
                                        │
                             formatter.ts (HTML + plain text)
                                        │
                             Gmail API ──► your inbox

Google Docs Reviewer
────────────────────
Docs URL ──► reader.ts ──► Claude (persona as cached system prompt)
                                    │
              ┌─────────────────────┴──────────────────────┐
              │ multi-comment                  │ --single   │
              ▼                                ▼            │
         Drive API                        Docs API batchUpdate
         (approve each)               (insert at top of doc)
```

Claude's system prompt is marked with `cache_control: ephemeral` — `persona.md` is cached across batches and runs within the same day, keeping costs low even on large inboxes.

---

## Security

| What | Status |
|------|--------|
| `.env` | git-ignored — never committed |
| `token.json` | git-ignored — stored locally only |
| `credentials.json` | git-ignored — stored locally only |
| Email content | Sent only to Anthropic API for summarisation |
| OAuth scopes | Minimum required: Gmail read/send, Docs read, Drive |
| Revoke access | [myaccount.google.com/permissions](https://myaccount.google.com/permissions) |

---

## Roadmap

- [ ] Slack monitor — watch channels, draft replies for approval
- [ ] Scheduled digest — cron job for automatic morning delivery
- [ ] Draft replies — generate Gmail reply drafts from the digest
- [ ] Batch doc review — run reviewer across multiple docs at once

---

## License

MIT
