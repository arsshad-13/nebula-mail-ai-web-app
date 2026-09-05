# Nebula Mail - AI-Powered Mail Web Application

An AI-powered, modern web email client connected to Google Gmail via the official Gmail API, OAuth 2.0, OpenRouter AI, and Google Cloud Pub/Sub real-time synchronization. Built for the Nebula hiring assignment.

---

## Current Status: Production-Ready Mail Client with AI & Real-Time Sync

The application integrates with real Gmail accounts via Google OAuth 2.0 and the Gmail REST API with end-to-end features:

- **Inbox & Sent Mailboxes**: Real Gmail messages with sender, recipient, subject, snippet, date, unread indicator, and attachment indicators.
- **Email Detail Pane**: Full sanitized email body (HTML & plain text), headers (From, To, Cc, Date), and attachment metadata cards.
- **Manual Compose & Send**: Compose modal with To, Subject, Body, client-side validation, server-side RFC 2822 formatting and CRLF injection defense, sending via `gmail.users.messages.send`.
- **AI Mail Assistant (Co-Pilot)**:
  - Powered by OpenRouter AI (`@openrouter/ai-sdk-provider`).
  - **AI Compose**: Natural language drafting that opens Compose, populates To/Subject/Body, tracks dirty field states, and allows editing.
  - **AI Search & Filtering**: Structured searches ("emails from the last 10 days", "from Sarah about project") that update the main mailbox list with an AI Filter banner and Clear button.
  - **AI Navigate / Open**: "Open latest email from David" or "Open latest in Sent" finds the message via trusted Gmail timestamps and displays it.
  - **Context-Aware Reply & Forward**: Context awareness of the currently selected email; drafts replies and forwards with conventional quoting without redundant searches.
  - **Human-in-the-Loop Send Confirmation**: Cryptographic one-time confirmation token workflow ensuring the AI can never send an email without explicit human approval.
- **Real-Time Push Synchronization**:
  - Google Cloud Pub/Sub push notifications via Gmail `watch` API.
  - Server-side webhook (`/api/webhooks/gmail`) with shared secret token verification and BigInt idempotency checks.
  - Gmail History API (`users.history.list`) differential sync with automatic history expiry detection and recovery.
  - Server-Sent Events (SSE) stream (`/api/mail/stream`) directly pushing `mail:new` events to the browser.
  - Zero manual browser refresh required when new emails arrive.
- **Strict Security Boundaries**: Zero tokens in the browser, file-backed server sessions, defense-in-depth HTML sanitization (`sanitize-html`), and zero mock/fake data.

---

## Demo

### Video Demo

[Watch the Nebula Mail Demo](https://drive.google.com/file/d/11UM6vDEhvFkK1j03gtbKFNY99h8N55tI/view?usp=drive_link)

The demo covers the key hiring-task requirements:

- Real Gmail Inbox and Sent integration
- Email detail view with real Gmail content
- Manual email composition and sending
- AI-powered email composition from natural-language instructions
- AI-powered email search and filtering
- AI-powered email navigation and opening
- Context-aware AI reply and forward
- Human-in-the-loop confirmation before AI-initiated sending
- Real-time Gmail synchronization without manually refreshing the application

---

## Live Deployment

- **Live Application**: [https://nebula-mail-ai-web-app.onrender.com](https://nebula-mail-ai-web-app.onrender.com)
- **Deployment Branch**: `main`

### Deployment Stack

- **Hosting**: Render
- **Application**: Next.js 16.3.4
- **Runtime**: Node.js
- **Database**: None — Gmail remains the source of truth
- **Email Provider**: Google Gmail API
- **Real-Time Sync**: Gmail Watch + Google Cloud Pub/Sub + Server-Sent Events (SSE)
- **AI Provider**: OpenRouter

The deployed application supports real Google OAuth 2.0 authentication, mailbox operations (Inbox, Sent), email composition, context-aware AI-assisted email actions (drafting, searching/filtering, navigation, and reply/forward), multi-message threaded conversations, and real-time Gmail synchronization without requiring a manual browser refresh.

> **Note on Render Free Tier**: The live deployment is hosted on Render's free tier. The service may spin down after periods of inactivity; the initial request after inactivity may take ~30–50 seconds while the web service wakes up.

---

## Screenshots

Key application capabilities captured directly from the live production deployment on Render:

### 1. Production Gmail Inbox
![Production Gmail Inbox](submission-evidence/screenshots/Screenshot%202026-09-05%20153727.png)
*Live production inbox on Render connected to Google Gmail, displaying real emails, unread counts, and the Nebula AI Copilot.*

### 2. Email Detail
![Email Detail View](submission-evidence/screenshots/Screenshot%202026-09-05%20153850.png)
*Sanitized HTML email body rendering with complete header metadata (From, To, Date) and XSS security defense.*

### 3. AI Compose & Human-in-the-Loop Send Confirmation
![AI Compose](submission-evidence/screenshots/Screenshot%202026-09-05%20154158.png)
*Natural-language email drafting via Nebula AI Copilot, automatically opening and populating the compose window.*

![Human-in-the-Loop Send Confirmation](submission-evidence/screenshots/Screenshot%202026-09-05%20155120.png)
*Security safeguard: Cryptographic one-time confirmation token requiring explicit user approval before AI can send any email.*

### 4. AI Search / Filtering
![AI Search & Filtering](submission-evidence/screenshots/Screenshot%202026-09-05%20154032.png)
*Natural language search query ("emails from the last 10 days") dynamically filtering the live mailbox with an active filter badge and Clear button.*

### 5. Gmail Thread View
![Gmail Thread View](submission-evidence/screenshots/Screenshot%202026-09-05%20155130.png)
*Chronological multi-message conversation thread with message count badge, individual message focus, and threaded AI replies.*

### 6. Real-Time Gmail Synchronization
![Real-Time Gmail Synchronization](submission-evidence/screenshots/Screenshot%202026-09-05%20153746.png)
*Live push synchronization via Google Cloud Pub/Sub and SSE, instantly receiving incoming emails without manual page refresh.*

---

## Security & Architecture Highlights

1. **Server-Side Token Isolation**:
   - Access tokens and refresh tokens are stored securely on the server in a file-backed session store (`.sessions/`, git-ignored).
   - The browser receives **only an opaque session ID** stored in an `httpOnly`, `secure`, `sameSite: "lax"` cookie (`nebula_session_id`).
   - Tokens never enter browser JavaScript, React state, or `localStorage`.
   - Automatic token renewal: When an access token nears expiry, the server refreshes it seamlessly via the refresh token.

2. **OAuth CSRF Protection**:
   - Every OAuth authorization request generates a cryptographically random 32-byte `state` parameter stored in an ephemeral, encrypted HTTP-only cookie (`nebula_oauth_state`).
   - On redirect callback, the state is strictly validated before exchanging authorization codes.

3. **Least-Privilege Scopes**:
   - `https://www.googleapis.com/auth/gmail.readonly` (reading messages and history)
   - `https://www.googleapis.com/auth/gmail.send` (sending outgoing emails)
   - `https://www.googleapis.com/auth/userinfo.email` (identifying connected account)
   - `https://www.googleapis.com/auth/userinfo.profile` (user display name and avatar)

4. **Defense-in-Depth HTML Sanitization (XSS Defense)**:
   - Email HTML is sanitized on the server with `sanitize-html` before being returned to the client.
   - Discards all `<script>`, `<iframe>`, `<object>`, `<embed>`, and `<form>` tags.
   - Discards all inline event listeners (`onload`, `onerror`, `onclick`).
   - Disallows `javascript:` schemes; forces `target="_blank"` and `rel="noopener noreferrer nofollow"` on all links.

5. **AI Safety & Send Boundaries**:
   - Tool execution is strictly declarative; no AI tool can send emails directly.
   - Sending requires a two-step cryptographic token handshake: `request_send_confirmation` emits a 5-minute single-use token, rendering an in-app confirmation banner that requires user click or explicit verbal confirmation.

---

## Environment Variables Configuration

Create `.env.local` in the project root:

```env
# Google OAuth 2.0 Credentials (Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
NEXT_PUBLIC_APP_URL=http://localhost:3000

# OpenRouter AI Provider
OPENROUTER_API_KEY=your-openrouter-api-key
AI_MODEL=openrouter/free

# Google Cloud Pub/Sub & Real-Time Sync
PUBSUB_TOPIC_NAME=projects/your-project-id/topics/your-topic-name
PUBSUB_WEBHOOK_SECRET=your-random-webhook-secret-token
```

---

## Google Cloud & Pub/Sub Setup Guide

### 1. Enable APIs
- Navigate to Google Cloud Console > **APIs & Services > Library**.
- Enable **Gmail API** and **Cloud Pub/Sub API**.

### 2. Configure OAuth 2.0
- Set User Type to External, add scopes (`gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile`).
- Add test users while in Testing mode.
- Create OAuth Web Application client ID with redirect URI: `http://localhost:3000/api/auth/callback`.

### 3. Configure Real-Time Pub/Sub
- Create a Cloud Pub/Sub Topic: `gmail-notifications`.
- Grant publisher permission to Gmail: `gmail-api-push@system.gserviceaccount.com` with role **Pub/Sub Publisher**.
- Create a Push Subscription targeting your publicly accessible webhook URL (via Cloudflare Tunnel, ngrok, or production domain):
  - Push endpoint: `https://your-public-url.com/api/webhooks/gmail?token=YOUR_PUBSUB_WEBHOOK_SECRET`

---

## Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run tests**:
   ```bash
   npm test
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Production build**:
   ```bash
   npm run build
   npm start
   ```

5. **Linting**:
   ```bash
   npm run lint
   ```
