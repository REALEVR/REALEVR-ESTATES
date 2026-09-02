# Social Media Posting Setup Guide

This explains where to find each credential the daily social posting agent
(`server/social/*`) needs, listed in `.env.example`. Every value below is a
**token or ID**, generated through the platform's own developer console —
never your account password. Set them in your `.env` (or your host's secret
manager); nothing needs to be typed into a chat with Claude or anyone else.

Any platform left unconfigured is simply skipped by the daily post — you can
set these up one at a time.

---

## Facebook + Instagram

Both are covered by Meta's Graph API, and Instagram posting reuses the same
Page Access Token as Facebook (your Instagram account must be linked to your
Facebook Page as a Business/Creator account).

**You'll end up with:** `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`,
`INSTAGRAM_BUSINESS_ACCOUNT_ID`

### 1. Link Instagram to your Facebook Page (skip if already done)
- Make sure your Instagram account is a **Business** or **Creator** account
  (Instagram app → Settings → Account type).
- Link it to your Facebook Page: Meta Business Suite → Settings → Accounts →
  Instagram accounts → connect.

### 2. Create a Meta app
- Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
- Choose type **Business**, give it a name (e.g. "RealEVR Estates Social").
- In the app dashboard, make sure your Facebook account (the one managing the
  Page) is listed under **App Roles → Administrators** — it should be by default.

### 3. Get a long-lived Page Access Token
- Open the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
- Select your app in the top-right dropdown.
- Click **Get Token → Get User Access Token**, and check these permissions:
  `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`,
  `instagram_basic`, `instagram_content_publish`.
- Click **Generate Access Token** and approve as your Page-admin account.
  This gives a *short-lived* user token — good for testing, expires in ~1 hour.
- To get a *long-lived* (60-day, and Page tokens derived from it effectively
  don't expire) token, open this URL in a browser (fill in your values):
  ```
  https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<SHORT_LIVED_TOKEN>
  ```
  (App ID/Secret are on your app's **Settings → Basic** page.)
- Then fetch your Page's own token using that long-lived user token:
  ```
  https://graph.facebook.com/v21.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>
  ```
  The response lists your Pages — copy that Page's `id` (→ `FACEBOOK_PAGE_ID`)
  and `access_token` (→ `FACEBOOK_PAGE_ACCESS_TOKEN`).

### 4. Get the Instagram Business Account ID
- With the Page Access Token from above:
  ```
  https://graph.facebook.com/v21.0/<FACEBOOK_PAGE_ID>?fields=instagram_business_account&access_token=<FACEBOOK_PAGE_ACCESS_TOKEN>
  ```
  The response's `instagram_business_account.id` is `INSTAGRAM_BUSINESS_ACCOUNT_ID`.

Since this only posts to *your own* Page/Instagram account (not on behalf of
other users), you don't need Meta's full App Review — being an admin on the
app is enough while the app stays in development mode.

---

## X (Twitter)

**You'll end up with:** `TWITTER_API_KEY`, `TWITTER_API_SECRET`,
`TWITTER_ACCESS_TOKEN`, `TWITTER_ACCESS_TOKEN_SECRET`

**Cost note:** posting requires at least X's paid **Basic** API tier
(~$100/month as of this writing) — the free tier is read-only.

1. Go to [developer.twitter.com/en/portal/dashboard](https://developer.twitter.com/en/portal/dashboard), sign in with the X account that should post.
2. Subscribe to a paid API plan (Basic or above) if you haven't.
3. Create a **Project** and an **App** inside it.
4. Open the App → **Settings** tab → **User authentication settings** → set
   **App permissions** to **Read and Write** (this must be done *before*
   generating tokens, or they'll come out read-only).
5. Open the App → **Keys and tokens** tab:
   - Under **Consumer Keys**, reveal/regenerate → this pair is
     `TWITTER_API_KEY` (API Key) and `TWITTER_API_SECRET` (API Key Secret).
   - Under **Authentication Tokens**, generate **Access Token and Secret** →
     this pair is `TWITTER_ACCESS_TOKEN` and `TWITTER_ACCESS_TOKEN_SECRET`.
6. If you changed permissions to Read+Write *after* tokens already existed,
   regenerate the Access Token/Secret — old ones keep the old permission level.

---

## LinkedIn

**You'll end up with:** `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_URN`

**Approval note:** posting as an organization requires LinkedIn to approve
your app for the relevant product below — this can take longer than the
other platforms.

1. Go to [developer.linkedin.com](https://www.linkedin.com/developers/apps) → **Create app**.
2. Associate the app with your LinkedIn **Company Page** (you must be a page admin).
3. Open the app → **Products** tab → request:
   - **Share on LinkedIn**
   - **Community Management API** (needed for posting *as* the organization,
     not just as yourself)
4. Once approved, open the **Auth** tab:
   - Note the **Client ID** and **Client Secret**.
   - Add an OAuth 2.0 redirect URL (any URL you control works, even
     `http://localhost:3000/callback`, since you only need this once to mint a token).
5. Generate an access token with scope `w_organization_social`:
   - Easiest: use the **Token Generator** on the app's Auth tab if LinkedIn
     offers one for your product, and select `w_organization_social`.
   - Otherwise, do the OAuth flow manually: send the admin to
     `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=<CLIENT_ID>&redirect_uri=<REDIRECT_URI>&scope=w_organization_social`,
     then exchange the returned `code` for a token via POST to
     `https://www.linkedin.com/oauth/v2/accessToken`.
   - This becomes `LINKEDIN_ACCESS_TOKEN`. Note: it expires in ~60 days and
     will need refreshing periodically.
6. Get your Organization URN:
   ```
   GET https://api.linkedin.com/v2/organizationAcls?q=roleAssignee
   Authorization: Bearer <LINKEDIN_ACCESS_TOKEN>
   ```
   The response lists organizations you administer; the `organization` field
   (e.g. `urn:li:organization:12345678`) is `LINKEDIN_ORGANIZATION_URN`.

---

## After setting these

Add the values to `.env` (see `.env.example` for the exact variable names),
restart the server, and either:
- wait for the daily cron (`SOCIAL_POST_CRON`, default noon UTC), or
- trigger one immediately as an admin: `POST /api/admin/social/post-now`.

Each platform posts independently — you don't need all four configured at
once to start using this.
