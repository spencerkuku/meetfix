---
status: accepted
---

# Google OAuth is a conditionally-registered, optional deployment feature

ADR-0003 established Google OAuth alongside password Accounts, but treated `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` as if they'd always be set. In practice a school with no Google Workspace leaves them blank — and until now that silently crashed the API on boot: `passport-google-oauth20`'s underlying strategy constructor throws without a `clientID`, and `GoogleStrategy` was an unconditional Nest provider. Even had it not crashed, the frontend always rendered a "使用學校 Google 帳號登入" button and a "連結 Google 帳號" account-settings action that would have led to a broken flow for a User with no Google Workspace Account.

Google OAuth is now genuinely optional: "configured" means `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are both non-empty (`GOOGLE_CALLBACK_URL`/`SCHOOL_GOOGLE_DOMAIN` being blank while those two are set is treated as a deployment misconfiguration to fix, not a signal to disable the feature). When unconfigured:

- `GoogleStrategy`'s constructor is passed a placeholder value instead of `undefined`, purely to satisfy `passport-oauth2`'s constructor and let the app boot — a `GoogleOAuthEnabledGuard`, listed ahead of `AuthGuard('google')` in every Google route's `@UseGuards()`, throws a 404 before Passport ever runs. This was chosen over the alternative of a NestJS dynamic module that omits the strategy/routes from the DI graph entirely — the guard achieves the same externally-observable contract (404, no broken redirect) with far less structural change to `AuthModule`.
- A new unauthenticated `GET /auth/providers` endpoint reports `{ googleEnabled }` at runtime. The frontend calls this rather than reading a parallel build-time Vite flag, so there is exactly one source of truth (the backend's own env vars) — a separate frontend flag could drift from it (set on one side, forgotten on the other) and either show a dead button or hide a working one.
- The frontend hides both Google-login affordances (the login screen's button and the account-settings "連結 Google" button) when disabled. An already Google-linked User's "已連結" status still displays regardless of the current `googleEnabled` value — that reflects a real, existing fact about their Account, not an offer to newly link.

**Accepted gap**: if Google OAuth is disabled after some Users already have Google-only Accounts (no password — see `CONTEXT.md`'s Account entry), those Users have no way to log in until an Admin re-enables it or otherwise intervenes. No recovery flow is built for this; disabling Google OAuth for a deployment that has ever had Google-linked Users is an operational decision the Admin is responsible for communicating, not something this system automates around.
