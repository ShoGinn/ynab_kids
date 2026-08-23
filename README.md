# Kids Budget (YNAB)

A small, password-protected family budget dashboard backed by the YNAB API and designed to run
as a Railway service.

## How it works

1. Railway runs the Node.js web service in `server.mjs`.
2. An authenticated page view requests `/api/budget`.
3. The server fetches the selected categories and recent transactions from YNAB only when its
   in-memory cache is empty or expired.
4. The result is cached for 10 minutes by default, so repeated page loads do not repeatedly call
   YNAB.
5. The browser receives only the fields it displays. YNAB credentials, plan IDs, category IDs,
   and transaction IDs remain server-side.

There is no scheduled polling, generated data file, or deployment workflow.

## Configuration

Copy `.env.example` to `.env` for local development. Configure the same variables in Railway:

- `YNAB_ACCESS_TOKEN` — YNAB personal access token.
- `YNAB_PLAN_ID` — plan to read.
- `YNAB_GROUP_IDS` — optional comma-separated category group IDs.
- `YNAB_GROUP_NAMES` — optional comma-separated category group names.
- `YNAB_CATEGORY_NAMES` — optional comma-separated category names within the selected groups.
- `SITE_USERNAME` — browser login name; defaults to `family`.
- `SITE_PASSWORD` — browser password; required, with no enforced minimum length.
- `CACHE_TTL_SECONDS` — on-demand cache lifetime; defaults to `600` (10 minutes).

Set at least one of `YNAB_GROUP_IDS` or `YNAB_GROUP_NAMES`.

Keep `.env` private. It is excluded by `.gitignore`; `.env.example` contains placeholders only.

## Run locally

```bash
pnpm install
cp .env.example .env
# Replace placeholders in .env, then:
pnpm run start:local
```

Open `http://localhost:3000` and enter `SITE_USERNAME` and `SITE_PASSWORD` when prompted.

## Quality checks

```bash
pnpm run check
```

## Deploy on Railway

1. Create a Railway project and add a service from this GitHub repository.
2. Connect the `main` branch. Railway automatically deploys later pushes to that branch.
3. Add the variables listed above in the service's **Variables** tab. Seal sensitive values where
   available.
4. In **Networking → Public Networking**, generate a Railway domain (or add a custom domain).
5. Open the domain and sign in with the site credentials.

`railway.json` selects Railpack, starts the Node.js server, and configures `/health` as Railway's
unauthenticated deployment health check. All dashboard routes and data remain password-protected.

## Privacy and security

- Never commit `.env`, a YNAB response, or generated budget data.
- The site intentionally displays the selected balances, payees, memos, and transaction amounts to
  authenticated users.
- HTTP Basic authentication is appropriate for this small private dashboard because Railway serves
  public domains over HTTPS. Use a unique, randomly generated password.
- The cache is process-local and disappears whenever the Railway service restarts.
- The public repository starts from a clean history and contains no generated budget snapshots.

The page includes YNAB attribution in accordance with the API terms. This project is not affiliated
with YNAB.
