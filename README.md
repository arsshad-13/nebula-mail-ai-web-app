# Nebula Mail - AI-Powered Mail Web Application

An AI-ready, modern web email client connected to Google Gmail via the official Gmail API and OAuth 2.0. Built for the Nebula KnowLab hiring assignment.

---

## Current Status: Stage 2 - Real Mail Client Integration

The application integrates with real Gmail accounts via Google OAuth 2.0 and the Gmail REST API:
- **Inbox**: Displays real received Gmail messages (sender, subject, snippet, date, unread indicator).
- **Sent**: Displays real sent Gmail messages.
- **Email Detail**: Displays full sanitized email body (HTML & plain-text support), headers, and attachment metadata.
- **Zero Mock Data**: Strictly connects to real Gmail; does not use fake email fallbacks.
- **Strict Scope Boundaries**: Stage 2 scope does not include AI, Compose/Send, or real-time webhooks.

---

## Security & Architecture Highlights

1. **Server-Side Token Isolation**:
   - Access tokens and refresh tokens are stored securely on the server in a file-backed session store (`.sessions/`, git-ignored).
   - The browser receives **only an opaque session ID** stored in an `httpOnly`, `secure`, `sameSite: "lax"` cookie (`nebula_session_id`).
   - Tokens never enter browser JavaScript, React state, or `localStorage`.
   - Automatic token renewal: When an access token nears expiry, the server refreshes it seamlessly via the refresh token and updates the session store.

2. **OAuth CSRF Protection**:
   - Every OAuth authorization request generates a cryptographically random 32-byte `state` parameter stored in an ephemeral, encrypted HTTP-only cookie (`nebula_oauth_state`).
   - On redirect callback, the state is strictly validated before exchanging authorization codes.

3. **Least-Privilege Scopes (Stage 2)**:
   - Requests read-only access strictly required for mailbox inspection:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/userinfo.email`
     - `https://www.googleapis.com/auth/userinfo.profile`
   - *Note on Future Stages*: When email composition and AI action execution are implemented in subsequent stages, the application will request the appropriate write/send scope (`gmail.send` or `gmail.compose`).

4. **Defense-in-Depth HTML Sanitization (XSS Defense)**:
   - Email HTML is sanitized on the server with `sanitize-html` before being returned to the client.
   - Discards all `<script>`, `<iframe>`, `<object>`, `<embed>`, and `<form>` tags.
   - Discards all inline event listeners (`onload`, `onerror`, `onclick`).
   - Disallows `javascript:` schemes; forces `target="_blank"` and `rel="noopener noreferrer"` on all links.

---

## Google Cloud Setup Guide

To run the application with your real Gmail account, configure a Google Cloud project with OAuth 2.0 credentials:

### Step 1: Create or Select a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `nebula-mail-app`) or select an existing project.

### Step 2: Enable the Gmail API
1. In the Google Cloud Console, go to **APIs & Services > Library**.
2. Search for **Gmail API**.
3. Click **Enable**.

### Step 3: Configure the OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **User Type**: **External** and click **Create**.
3. Fill in the required fields:
   - **App name**: `Nebula Mail`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. On the **Scopes** step, add the following scopes:
   - `.../auth/gmail.readonly`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
5. On the **Test users** step:
   - Add your own Gmail address as a test user (required while the app is in "Testing" mode).
6. Save and finish.

### Step 4: Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select **Application type**: **Web application**.
4. Name: `Nebula Mail Web Client`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000`
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback`
7. Click **Create**.
8. Copy the generated **Client ID** and **Client Secret**.

---

## Environment Variables Configuration

1. In the project root, create a file named `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and populate it with your Google credentials:
   ```env
   # Google OAuth 2.0 Credentials
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret

   # Google OAuth Redirect URI
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

   # Application URL
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

*(Note: `.env.local` is git-ignored and will never be committed.)*

---

## Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open the application**:
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Authenticate & Test**:
   - Click **Connect with Google Gmail**.
   - Sign in with the Gmail account you added as a test user in Google Cloud Console.
   - Once authorized, you will be redirected to the 3-pane Mail Client.
   - Inspect real messages in **Inbox** and **Sent**.
   - Click on any message to view the full sanitized body, headers, and attachments.
   - Click **Sign out** at the bottom of the sidebar to clear your server session and cookie.

---

## Scripts

- `npm run dev`: Starts local development server on port 3000.
- `npm run build`: Compiles production build and runs TypeScript verification.
- `npm run lint`: Runs ESLint checks.
