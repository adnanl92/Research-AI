# WashU Research Assistant

An AI-powered suite of research tools for university faculty: grounded
literature search (Consensus-style), grant drafting, IRB protocol drafts,
reviewer-simulation critique, bibliometrics, meeting-note summaries, and
diagram generation — in one Next.js app with a deliberately minimal backend.

> ⚠️ **No PHI.** This application must never be used to store or process
> Protected Health Information in this configuration. It is not a
> HIPAA-compliant environment and no BAA covers the AI backend. A permanent
> disclaimer is shown in the app footer.

## Architecture at a glance

- **Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui** — one
  deployable app; API routes only, no separate backend service.
- **Auth.js (NextAuth v5)** — email/password (bcrypt) today; a commented,
  ready-to-activate Microsoft Entra ID block for WashU SSO (see Handoff).
- **Prisma** — SQLite locally, Postgres in production, same schema.
- **One shared LLM client** (`src/lib/llm/client.ts`) — every tool calls
  `generateCompletion` / `generateStructured`; the backend (Azure AI Foundry
  or Anthropic) is selected by env vars and swappable without touching tools.
- **No vector database.** Literature search calls live scholarly APIs
  (OpenAlex, PubMed, Semantic Scholar, Unpaywall) on every request and caches
  merged results in a plain SQL table (`ApiCache`) with a 24-hour TTL.
- **Grounded generation, always.** Cited answers are retrieve-first,
  generate-second; the model is instructed to say "the retrieved literature
  does not address this" rather than fabricate, and can only cite papers that
  were actually retrieved.
- **Tool registry** (`src/lib/tools/registry.ts`) — the single source of
  truth for navigation. Roadmap tools (podcast summaries, team workspaces,
  promotion packets, invention disclosure, accessibility checker) are listed
  there as `status: "roadmap"` and render greyed-out in the sidebar; to build
  one later, flip its status and add its page/API route. Nothing else changes.

## Active tools

| Tool | What it does |
|---|---|
| Literature Search | Grounded, cited answers from OpenAlex/PubMed/Semantic Scholar, with a yes/no consensus meter |
| Grant Editor | Specific Aims drafter + a retrieval-grounded "related work" landscape summary |
| IRB Draft Assistant | Guided multi-step form → structured first-draft protocol document |
| Critique Assistant | Reviewer-persona critique (grant reviewer / IRB member / peer reviewer) with severity-tagged concerns |
| Bibliometric Snapshot | Citation counts, h-index, timeline chart, top venues/co-authors from OpenAlex |
| Meeting Notes | Raw notes/transcript → attendees, decisions, action items, open questions |
| Diagram Builder | Plain-language description → editable Mermaid diagram, rendered client-side |
| AI Policies | Static institutional-policy reference page |

## Prerequisites

- **Node.js 20 or later** and **npm** (check with `node -v`)
- **Git**
- At least one LLM backend credential — either:
  - An **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com)), or
  - An **Azure AI Foundry / Azure OpenAI** deployment (endpoint + key + deployment name)

## Running it locally, step by step

```bash
# 1. Clone the repo and install dependencies
git clone git@github.com:<your-org>/Research-AI.git
cd Research-AI
npm install

# 2. Create your local environment file from the template
cp .env.example .env.local
```

Now open `.env.local` and fill in:

- **`AUTH_SECRET`** — generate one with `openssl rand -base64 32` and paste it in.
- **One LLM backend** — either:
  - `ANTHROPIC_API_KEY` (simplest for local dev), or
  - all four `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` /
    `AZURE_OPENAI_API_VERSION` / `AZURE_OPENAI_DEPLOYMENT_NAME` values.
  - The app auto-detects whichever is configured — see `src/lib/llm/client.ts`.
- **`OPENALEX_MAILTO`** and **`UNPAYWALL_EMAIL`** — just your email address;
  no signup required. These improve rate limits / enable open-access links.
- Everything else in `.env.example` is optional for local dev.

```bash
# 3. Create the local SQLite database
# (The Prisma CLI reads DATABASE_URL from a plain .env file, not .env.local,
#  so this step creates that file too.)
echo 'DATABASE_URL="file:./dev.db"' > .env
npm run db:push

# 4. Start the dev server
npm run dev
```

Open **http://localhost:3000** in your browser.

> If port 3000 is already in use by something else on your machine, run
> `npx next dev -p 3001` (or any free port) instead.

5. Click **"Create one"** on the sign-in page to make an account (email +
   password — no external auth needed for local dev), then sign in.
6. Try the **Literature Search** tool first — it's the core feature. You
   should see a grounded, cited answer with real outbound links to papers.
7. To confirm the LLM backend is wired up correctly at any time, visit
   `/api/tools/_test` while signed in — it returns a live test completion.

### Getting the (free) scholarly API keys

None of these require payment; all are optional except the two email fields.

| Variable | Where to get it | Required? |
|---|---|---|
| `OPENALEX_MAILTO` | Just your email — no signup. Grants OpenAlex "polite pool" rate limits. | Recommended |
| `UNPAYWALL_EMAIL` | Just your email — no signup. | Required for open-access links |
| `SEMANTIC_SCHOLAR_API_KEY` | Free at semanticscholar.org/product/api (without it the app rate-limits itself to 1 req/3s) | Optional |
| `NCBI_API_KEY` | Free in your NCBI account settings; raises PubMed to 10 req/s | Optional |

### Troubleshooting

- **"No LLM backend configured" error** — double-check `.env.local` has
  either `ANTHROPIC_API_KEY` or all four `AZURE_OPENAI_*` variables set, then
  restart `npm run dev`.
- **Prisma errors on `npm run db:push`** — make sure the plain `.env` file
  (step 3 above) exists with `DATABASE_URL` — the Prisma CLI does not read
  `.env.local`.
- **Port already in use** — see the note in step 4 above.
- **Literature Search returns no papers** — check your internet connection;
  the tool calls live external APIs (OpenAlex, PubMed, Semantic Scholar) on
  every uncached query.

## Deploying to Vercel (Postgres)

1. Create a Postgres database (Neon or Vercel Postgres) and copy its
   connection string.
2. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"`. **This is the only code change needed** — the
   schema itself is compatible with both (JSON payloads are stored as
   strings for that reason).
3. In Vercel project settings → Environment Variables, set everything from
   `.env.example`: `DATABASE_URL` (the postgres:// URL), `AUTH_SECRET`, the
   LLM backend vars, and the scholarly API vars.
4. Push the schema once from your machine:
   `DATABASE_URL="postgres://..." npx prisma db push`
5. Deploy. Note: several tool routes declare `maxDuration = 120`; on the
   Vercel Hobby plan functions cap at 60s, so use a plan that allows longer
   function durations for comfortable literature searches.

## Security & cost controls

- All `/api/tools/*` routes require a session **and** pass a per-user
  sliding-window rate limit: 30 tool calls/hour, counted from `ToolRun` rows
  (no external rate-limit service). Exceeding it returns 429 + `Retry-After`.
- Every request body is Zod-validated (400 with a clear message on failure).
- `ToolRun` logs only: tool id, the first 100 characters of input, token
  counts, latency. Full prompts/outputs are never logged.
- Per-tool `maxTokens` caps bound the cost of any single call.
- Secrets live only in env vars; `.env*` is gitignored (except
  `.env.example`, which contains placeholders only). Never commit a real
  API key, database URL, or auth secret.

## Project map

```
src/
  lib/
    llm/client.ts        # THE LLM boundary — swap backends here only
    retrieval/           # openalex / pubmed / semanticScholar / unpaywall
                         # + merge (dedupe/rank) + cache (SQL TTL) + http
    tools/registry.ts    # single source of truth for all tools + roadmap
    tools/guard.ts       # auth + rate limit for every tool route
    tools/log.ts         # write-only ToolRun usage log
    auth.ts, auth.config.ts, db.ts
  app/
    (auth)/signin, signup
    (app)/               # sidebar shell + all tool pages
    api/tools/*          # one route per AI tool
    api/saved-items      # generic save/list endpoint used by every tool
  middleware.ts          # redirects unauthenticated users to /signin
prisma/schema.prisma     # User/Auth tables + ToolRun + SavedItem + ApiCache
```

---

# Handoff to WashU IT

This section is written for an engineer who has never seen this codebase.

## 1. Swap sign-in to WashU SSO (Microsoft Entra ID)

The Entra provider is already written and commented out in
**`src/lib/auth.ts`**:

1. Register the app in the WashU Entra tenant (redirect URI:
   `https://<host>/api/auth/callback/microsoft-entra-id`).
2. Set in the environment:
   `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`,
   `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` (they are already stubbed in
   `.env.example`).
3. In `src/lib/auth.ts`, uncomment the `MicrosoftEntraID` import and the
   provider block (step-by-step notes are inline in that file).
4. Optionally remove the Credentials provider and the `/signup` page to make
   SSO the only path. Users are matched/created by email via the Prisma
   adapter, so existing saved items survive the switch as long as emails
   match.

## 2. Move the database to Azure

The app talks to the database exclusively through Prisma.

- **Azure Database for PostgreSQL (recommended):** change the datasource
  `provider` to `"postgresql"` in `prisma/schema.prisma`, point
  `DATABASE_URL` at the Azure Postgres connection string (with
  `sslmode=require`), run `npx prisma db push` once. No application code
  changes.
- **Azure SQL:** possible (`provider = "sqlserver"`) but not tested here;
  Postgres is the assumed path.
- Data worth migrating: `User`, `SavedItem` (faculty work products),
  `ToolRun` (usage history). `ApiCache` is disposable.

## 3. Secrets → Azure Key Vault

All secrets are read from `process.env` at runtime — nothing is hardcoded.
Wire the app-hosting platform (App Service / Container Apps) to Key Vault
references for: `AUTH_SECRET`, `DATABASE_URL`, `AZURE_OPENAI_API_KEY` (plus
endpoint/version/deployment vars), and the optional scholarly API keys.
If the temporary Anthropic backend is still configured, `ANTHROPIC_API_KEY`
belongs in Key Vault too — or simply remove it and set the `AZURE_OPENAI_*`
vars, at which point the app switches to Azure AI Foundry automatically (the
selection logic is at the top of `src/lib/llm/client.ts`).

## 4. Outbound network access

Wherever this is hosted, the server needs **outbound HTTPS (443)** to:

| Host | Purpose |
|---|---|
| `api.openalex.org` | Literature search + bibliometrics (primary source) |
| `api.semanticscholar.org` | TLDRs, citation enrichment, fallback search |
| `eutils.ncbi.nlm.nih.gov` | PubMed E-utilities (biomedical queries) |
| `api.unpaywall.org` | Open-access link resolution |
| `<your-resource>.openai.azure.com` (or your AI Foundry endpoint) | LLM backend |
| `api.anthropic.com` | Only if the Anthropic backend is used |

If egress is proxied/filtered, allowlist these. All calls are plain HTTPS
`fetch` with 10–20s timeouts and bounded retries (`src/lib/retrieval/http.ts`).

## 5. Pre-production checklist

- Replace the placeholder content in `src/app/(app)/tools/ai-policies/page.tsx`
  with WashU's official policy language (each section is marked
  `[PLACEHOLDER]`).
- Review the rate limit (30 calls/user/hour) in `src/lib/tools/guard.ts`.
- Confirm the no-PHI posture with the privacy office; the footer disclaimer
  is in `src/app/(app)/layout.tsx`.
- Set the model/deployment choices intentionally (`ANTHROPIC_MODEL` or
  `AZURE_OPENAI_DEPLOYMENT_NAME`); per-tool token caps are set in each route
  under `src/app/api/tools/`.
