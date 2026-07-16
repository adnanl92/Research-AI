# WashU Research Assistant — Architecture & AI Deep Dive

*Written for a developer coming from healthcare data science. Concepts you'd know from Python/pandas/notebooks are translated as they come up. Everything in here is taken from the actual code — every prompt is quoted verbatim from the source files, with file paths so you can find them.*

---

## 1. The big picture

The app is a suite of AI research tools for university faculty: grounded literature search, grant drafting, IRB protocol drafting, simulated reviewer critique, bibliometrics, meeting-note summarization, and diagram generation. It is **one single Next.js application** — there is no separate backend server, no Python service, no message queue. The "backend" is a set of API routes that live inside the same codebase and deploy as one unit.

Three deliberate design decisions shape everything:

1. **One LLM boundary.** Exactly one file in the whole app talks to a language model: `src/lib/llm/client.ts`. Every tool imports two functions from it. Swapping OpenAI for Azure OpenAI (your HIPAA path) means changing environment variables — zero tool code changes.
2. **Grounded generation, not open-ended chat.** Tools that make factual claims (literature search, grant related-work) retrieve real papers *first* and then instruct the model to answer **only** from that retrieved evidence, citing paper numbers. This is Retrieval-Augmented Generation (RAG) — more on that in §5.
3. **No PHI, by policy and by design.** A permanent footer disclaimer, a README warning, and logging that only ever stores the first 100 characters of any input. §7 covers what it would take to change this posture.

---

## 2. The stack, translated for a data scientist

| Technology | What it is | Closest analogue from your world |
|---|---|---|
| **TypeScript** | JavaScript with a type system checked at build time | Python type hints, except violations are hard errors, not suggestions |
| **Next.js 15 (App Router)** | Full-stack React framework: pages *and* server endpoints in one project | Flask/FastAPI + a frontend framework, fused into one thing |
| **React 19** | UI library; the page is a tree of components that re-render when state changes | Think of a component like a function that returns HTML and re-runs when its inputs change |
| **Prisma** | ORM — you define a schema, it generates a typed database client | SQLAlchemy, but the models live in one `schema.prisma` file and queries are fully autocompleted |
| **Zod** | Runtime schema validation for incoming data | **Pydantic.** Almost exactly pydantic. If you know `BaseModel`, you know Zod |
| **Auth.js (NextAuth v5)** | Authentication framework: sessions, sign-in providers, callbacks | No great DS analogue — it's the login plumbing so you don't hand-roll it |
| **Tailwind CSS 4 + shadcn/ui** | Utility-class styling + a library of pre-built accessible components | Like seaborn defaults vs. hand-writing matplotlib — sane styling out of the box |
| **SQLite → Postgres** | Local file database for dev, real Postgres in production, same Prisma schema | Like developing against a CSV and deploying against the warehouse, except the code is identical |

### Concepts worth internalizing

**Server components vs. client components.** In the App Router, a page file (`page.tsx`) runs *on the server* by default — it can read the database and secrets directly. Any file starting with `"use client"` runs *in the browser* — it handles clicks, form state, and `fetch()` calls. This app uses a consistent pattern: every tool has a thin server `page.tsx` plus a `*-client.tsx` that does the interactive work. **Secrets (API keys) only ever exist in server code.** The browser never sees an OpenAI key; it only calls your own `/api/tools/*` endpoints.

**API routes.** A file at `src/app/api/tools/critique/route.ts` exporting a `POST` function *is* the endpoint `POST /api/tools/critique`. That's it — the file path is the URL. This is your FastAPI `@app.post("/...")`, expressed as a folder structure.

**Environment variables.** Configuration and secrets live in `.env.local` (gitignored) and are read via `process.env.X` — same idea as `os.environ`. The `.env.example` file documents every variable without real values.

**Middleware.** `src/middleware.ts` runs before *every* request. Here it does one job: if you're not signed in and you ask for anything other than `/signin` or `/signup`, you get redirected to sign in. It's a bouncer at the door.

---

## 3. How one request flows through the app

This is the single most useful mental model. Take the Critique tool as the example:

```
Browser (critique-client.tsx)
  │  user pastes draft, picks "peer-reviewer", clicks submit
  │  fetch POST /api/tools/critique  { text, persona }
  ▼
middleware.ts ──── not signed in? → redirect to /signin
  ▼
route.ts: requireToolAccess()        (src/lib/tools/guard.ts)
  │   1. auth() — is there a valid session JWT?        → 401 if not
  │   2. count ToolRun rows for this user in last hour → 429 if ≥ 30
  ▼
route.ts: Zod validation of the request body           → 400 with message if invalid
  ▼
[retrieval step — only for grounded tools]              (src/lib/retrieval/*)
  │   cache check → OpenAlex / PubMed / Semantic Scholar → merge, rank, cache
  ▼
LLM client (src/lib/llm/client.ts)
  │   picks Azure / OpenAI / Anthropic from env vars
  │   generateCompletion (prose) or generateStructured (JSON + Zod + retry)
  ▼
logToolRun()                          (src/lib/tools/log.ts)
  │   writes: toolId, first 100 chars of input, token counts, latency
  ▼
NextResponse.json({ ... })  →  back to the browser, rendered as markdown/cards
```

Every one of the seven AI tool routes follows this exact shape. Once you've read one route file, you've read them all — only the schema, the prompt, and the response shape differ.

### The security/cost layers, in order

1. **Middleware** — unauthenticated users never reach a tool page or API route.
2. **`requireToolAccess()`** — session check + a sliding-window rate limit of **30 tool calls per user per hour**. Clever detail: there's no Redis or rate-limit service. Every successful call already writes a `ToolRun` row, so *counting rows in the last hour is the rate limiter*. Exceeding it returns HTTP 429 with a `Retry-After` header.
3. **Zod validation** — every request body is parsed against a schema with min/max lengths (pydantic-style), so garbage never reaches the LLM.
4. **Per-call `maxTokens` caps** — each tool bounds the maximum output size (and therefore cost) of any single call.
5. **Minimal logging** — `ToolRun` stores only a 100-char input summary, token counts, and latency. Full prompts and outputs are never persisted in logs.

---

## 4. The database (Prisma schema)

Six tables in `prisma/schema.prisma`, in two groups:

**Auth.js tables** (standard shapes the framework expects):
- `User` — email, `hashedPassword` (bcrypt), name. The password is *hashed*, never stored raw — bcrypt is a deliberately slow one-way function, so even a database leak doesn't reveal passwords.
- `Account`, `Session`, `VerificationToken` — Auth.js bookkeeping. `Account` is what will link a WashU Entra ID identity to a `User` row when SSO is turned on.

**Application tables:**
- `ToolRun` — the write-only usage log described above. Doubles as the rate limiter. Indexed on `(userId, createdAt)` precisely so the "count last hour" query is fast.
- `SavedItem` — one generic table for every tool's saved outputs (a literature answer, an aims draft, an IRB draft…). `content` and `sourceMetadata` are JSON stored as strings so the same schema works on SQLite (which has no native JSON type) and Postgres.
- `ApiCache` — a TTL cache of merged scholarly-API results, keyed by a SHA-256 hash of the normalized query. This is the app's substitute for a vector database (see next section). Expired rows are lazily deleted on read.

Sessions use the **JWT strategy**: the proof-of-login is a signed, encrypted cookie rather than a database row per session. That's why the middleware can check auth at the edge without a database connection — it just verifies the cookie signature using `AUTH_SECRET`.

---

## 5. The AI plumbing

### 5.1 The LLM client — `src/lib/llm/client.ts`

The only module that talks to a model. Three interchangeable backends, resolved from env vars in priority order:

1. **Azure OpenAI / AI Foundry** — active when all four `AZURE_OPENAI_*` vars are set. *This is the production and HIPAA target.*
2. **OpenAI** (`api.openai.com`) — when `OPENAI_API_KEY` is set. Default model `gpt-4.1-mini`.
3. **Anthropic Claude** — when `ANTHROPIC_API_KEY` is set. Default model `claude-opus-4-8`.

You can force one with `LLM_PROVIDER=azure|openai|anthropic`. All three paths share one internal interface, so tools are completely backend-agnostic.

It exposes exactly two functions:

**`generateCompletion({ system, messages, temperature, maxTokens })`** — plain prose out. Used for drafts, answers, diagrams.

**`generateStructured({ ..., schema, schemaDescription })`** — machine-readable JSON out. This one is worth understanding because it's the pattern behind every "structured" feature (critique, meeting notes, stance classification):

1. It appends to the system prompt: *"Respond with a single JSON object only — no markdown fences, no commentary. The JSON must match this shape: …"* followed by a literal shape description.
2. Where the backend supports it (OpenAI/Azure), it also sets the API's native JSON mode (`response_format: json_object`) as a belt-and-braces measure.
3. The model's reply is stripped of accidental ```` ```json ```` fences, `JSON.parse`d, then validated with **Zod** — exactly like calling `MyModel.model_validate_json()` in pydantic.
4. If parsing or validation fails, it does **one self-correction round**: it sends the model its own broken output plus the specific error ("JSON did not match the required shape: concerns.0.severity: …") and asks it to try again. Fail twice → clean `LLMError` to the user.

Other details you'll appreciate later:
- 90-second request timeout, 2 SDK-level retries on rate limits/transient errors.
- All failures are wrapped into a single `LLMError` type with human-readable messages ("The Anthropic API key was rejected…"), so route handlers have one catch block.
- The Azure path has a **parameter-fallback loop**: newer reasoning models reject `max_tokens` (they want `max_completion_tokens`) and non-default `temperature`. The client tries the standard params first and silently retries with the newer ones if the deployment complains — so you can swap Azure deployments without touching tool code.

**What "temperature" means:** a sampling knob from 0 to ~2. Low (0.2–0.3) = focused, deterministic, good for extraction and factual work. Higher (0.4+) = more varied phrasing, good for drafting. You'll see each tool picks a deliberate value.

### 5.2 The retrieval pipeline — RAG without a vector database

**The concept.** LLMs hallucinate citations — famously. Retrieval-Augmented Generation fixes this by inverting the flow: instead of asking the model what it "knows," you (1) fetch real documents from a trusted source, (2) paste them into the prompt as numbered evidence, and (3) instruct the model to answer *only* from that evidence, citing the numbers. The model becomes a reading-comprehension engine rather than a memory oracle.

**The classic implementation** embeds documents into vectors and does similarity search over a vector database. **This app skips all of that**, because the scholarly world already has excellent search APIs. Why maintain an index of 200M papers when OpenAlex will rank them for you in 300ms?

The pipeline (`src/lib/retrieval/merge.ts` → `searchLiterature()`):

```
query → normalize → cache check (ApiCache, 24h TTL) → hit? return
  ├─ OpenAlex (primary, relevance-ranked)
  ├─ PubMed E-utilities (only when the "biomedical" filter is on;
  │    its metadata is then preferred over OpenAlex's)
  └─ Semantic Scholar search (fallback, only if the above found < 5 papers)
→ merge & dedupe   (by DOI, falling back to normalized-title match;
                    gaps in the primary record filled from duplicates)
→ enrich           (Semantic Scholar TLDRs + citation counts, batched by DOI)
→ rank             (score = -position + 1.5·log10(citations + 1)
                    — source relevance order, boosted by log-scaled citations
                    so a 10k-citation classic rises without drowning fresh work)
→ cap at 20 papers
→ Unpaywall        (resolve free open-access PDF links by DOI)
→ cache 24h → return
```

Failure handling is graceful throughout: sources are queried with `Promise.allSettled` (one API being down doesn't kill the search), enrichment and OA resolution are best-effort, and only if the *primary* source fails *and* nothing was found does the user see an error.

The four external hosts, all free: `api.openalex.org`, `eutils.ncbi.nlm.nih.gov`, `api.semanticscholar.org`, `api.unpaywall.org`. Note for the HIPAA discussion later: **the user's search query text is sent to these third parties.**

---

## 6. Feature-by-feature: every tool, every prompt

For each tool: what it does, how the AI call works, and the **actual system prompt from the code**. Reading these is the best prompt-engineering tutorial you'll get, because they encode a consistent philosophy:

- **Give the model a role** ("You are a research literature assistant for university faculty").
- **Fence its knowledge** ("using ONLY the numbered papers provided — never outside knowledge").
- **Give it an honest out** ("say explicitly: 'The retrieved literature does not address this'") — without an explicit escape hatch, models bluff.
- **Placeholders over invention** ("insert a bracketed placeholder like [ADD: …]").
- **Specify the exact output structure** (headed sections, JSON shapes) so the UI can rely on it.

### 6.1 Literature Search — `api/tools/literature-search/route.ts`

**Flow:** query → retrieval pipeline (§5.2) → papers serialized into a numbered evidence block (`[1] "Title" — authors (year), venue. Citations: n. Abstract: …`, abstracts truncated to 1,500 chars) → **two LLM calls run in parallel** (`Promise.all`):

**Call 1 — the grounded answer** (`generateCompletion`, temperature 0.3, maxTokens 1500):

> You are a research literature assistant for university faculty. You answer research questions using ONLY the numbered papers provided — never outside knowledge, never invented citations.
>
> Rules:
> - Every factual claim must cite its source with bracketed markers like [1] or [2][5] that map to the numbered paper list.
> - Only cite numbers that exist in the provided list.
> - If the retrieved papers do not address the question (or only partially), say explicitly: "The retrieved literature does not address this" (or which part it does not address). Never fabricate findings.
> - Be measured and academic: distinguish strong evidence (multiple large studies) from weak (single small study), and note contradictions between papers.
> - Structure: a 1-2 sentence direct answer first, then 2-4 short paragraphs of supporting evidence, then limitations of the retrieved evidence.

**Call 2 — the consensus meter** (only when the query looks like a yes/no question — detected by a regex on leading words like *does/is/can/should*, or forced by a UI toggle). This is a `generateStructured` call that classifies each paper's stance:

> You classify whether each numbered paper's abstract supports a yes or no answer to the research question. Judge ONLY from the provided abstracts. Use "mixed" for papers with evidence both ways, "unclear" when the abstract does not address the question.

Required JSON shape: `{"stances": [{"paper": <n>, "stance": "yes" | "no" | "mixed" | "unclear"}, ...]}` — validated with Zod. The route then builds two tallies: raw counts, and **citation-weighted counts** where each paper contributes `1 + log10(citations + 1)` — so a heavily cited paper moves the meter more without silencing new work. The consensus call is wrapped in `.catch(() => null)`: it is *best-effort* and can never block the main answer. That's a pattern worth stealing — decide which parts of a response are essential vs. decorative, and never let a decoration take down the essentials.

### 6.2 Grant Editor — `api/tools/grant-editor/route.ts`

One route, two modes, distinguished by a Zod **discriminated union** on a `mode` field (pydantic's discriminated unions, same idea).

**Mode 1 — "aims": Specific Aims drafter** (`generateCompletion`, temperature 0.4 — slightly higher because this is creative drafting — maxTokens 3000). The user's raw idea is the entire user message; the structure comes from the system prompt:

> You are an experienced grant-writing coach helping a university faculty member draft a Specific Aims page (NIH-style, adaptable to NSF). Work ONLY from the researcher's own description — do not invent preliminary data, citations, or collaborator names.
>
> Produce a structured first draft with these headed sections:
> ## Background & Significance  (2-3 sentences establishing the problem's importance)
> ## The Gap  (what is unknown or unsolved — sharp and specific)
> ## Long-Term Goal & Objective  (one sentence each)
> ## Central Hypothesis  (if the input supports one; otherwise a guiding research question)
> ## Specific Aims  (Aim 1, Aim 2, Aim 3 — each with a one-line title, a working hypothesis or goal, and a 2-3 sentence approach sketch)
> ## Expected Outcomes & Impact  (payoff if aims succeed)
>
> Where the researcher's input lacks information a real aims page needs, insert a bracketed placeholder like [ADD: preliminary data supporting feasibility] rather than inventing content. This is a first-draft aid — keep the tone confident but factual.

**Mode 2 — "related-work": landscape briefing.** This is RAG again: the topic goes through the same `searchLiterature()` pipeline as Literature Search, then (temperature 0.3, maxTokens 2000):

> You are a research-landscape analyst. Using ONLY the numbered papers provided, write a "how your proposal fits into the landscape" briefing for a faculty member planning a grant on the given topic.
>
> Rules:
> - Cite with bracketed markers [n] mapping to the numbered list; never cite numbers not in the list.
> - Structure: ## What is already established (2-3 paragraphs) · ## Active directions and recent momentum · ## Apparent gaps your proposal could fill (bullet list, each tied to what the retrieved papers do NOT cover).
> - If the retrieved papers poorly cover the topic, say so explicitly rather than stretching them.

Notice the "gaps" bullet is anchored to *what the retrieved papers do NOT cover* — grounding applied even to the speculative part.

### 6.3 IRB Draft Assistant — `api/tools/irb-draft/route.ts`

**Flow:** a guided multi-step form collects five structured fields (title, study type from a fixed enum — observational, interventional, retrospective chart review, survey, qualitative interviews, secondary data analysis, other — population, procedures, risks, data handling). The route assembles them into one labeled user message and makes a single `generateCompletion` call (temperature 0.3, maxTokens 4000 — the largest output budget in the app, since protocols are long):

> You are drafting a first-draft IRB protocol document for a university researcher, using ONLY the structured study information they provide. Do not invent details — where required information is missing, insert a bracketed placeholder like [ADD: retention period for identifiable data].
>
> Produce a document with exactly these headed sections, in this order:
> ## Purpose
> ## Background
> ## Study Design
> ## Subject Population
> ## Recruitment & Consent
> ## Procedures
> ## Risks & Benefits
> ## Data Management
> ## Privacy & Confidentiality
>
> Write in formal protocol prose (third person, present/future tense). Match the study type's conventions (e.g., a retrospective chart review should discuss waiver of consent where appropriate — flagged as a suggestion, not a determination). This draft does NOT replace institutional IRB review or legal/compliance guidance, and the document should not claim any approval status.

Three things to notice: the **fixed section list** means the output is always reviewable against a checklist; the **structured form** (rather than free chat) guarantees the model has the minimum facts an IRB draft needs; and the prompt explicitly bounds the tool's authority ("a suggestion, not a determination", "does NOT replace institutional IRB review") — important for a compliance-adjacent tool.

### 6.4 Critique Assistant (peer review / grant review / IRB review) — `api/tools/critique/route.ts`

**Flow:** the user pastes a draft (100–50,000 chars) and picks one of three reviewer **personas**. The persona string is prepended to a shared instruction block, and the whole thing runs as one `generateStructured` call (temperature 0.4, maxTokens 3000).

The three personas (verbatim):

> **grant-reviewer:** You are a skeptical but fair NIH study-section reviewer. You care about: significance, innovation, rigor of approach, feasibility, investigator fit, unstated assumptions, overclaiming, and vague methods. You have seen a thousand proposals and know every way they fail.
>
> **irb-member:** You are an experienced IRB board member. You care about: risk/benefit balance, vulnerable populations, consent adequacy, privacy and data protection, recruitment ethics, coercion/undue influence, and regulatory completeness. You flag anything a board would question.
>
> **peer-reviewer:** You are a rigorous journal peer reviewer (Reviewer 2, but constructive). You care about: clarity of contribution, methodological soundness, statistical validity, overinterpretation of results, missing limitations, reproducibility, and writing clarity.

The shared instruction appended to whichever persona is chosen:

> Critique the submitted draft constructively — this is pre-submission review to help the author improve, not a rejection. Identify 4-10 concrete concerns, each with severity ("major" = would sink the submission or requires substantive rework, "minor" = fixable weakness or polish) and a specific, actionable suggested fix. Base every concern on the actual text; quote or reference specific passages where possible. Start with a 2-3 sentence overall impression that is honest about strengths and weaknesses.

Required JSON shape: `{"overallImpression": "...", "concerns": [{"severity": "major"|"minor", "concern": "...", "suggestedFix": "..."}]}`. Because the output is validated structure rather than free prose, the UI can render severity badges and fix cards reliably. The persona pattern is powerful and cheap: **one route, one schema, three products** — the persona paragraph steers *what the model pays attention to*, the shared block steers *format and tone*.

### 6.5 Bibliometric Snapshot — `api/tools/bibliometric/route.ts`

Mostly *not* an AI feature — a good reminder that not everything needs an LLM. Input is classified by regex into DOI / OpenAlex ID / ORCID / plain name, then OpenAlex REST endpoints supply works counts, citations, h-index, i10, per-year citation series, and (via `group_by` aggregations) top venues and co-authors. Results are cached 24h.

The one LLM call is a tiny, strictly-grounded trend summary (maxTokens 200, best-effort — the charts render even if it fails):

> Write a 2-3 sentence plain-language summary of the citation trend, grounded STRICTLY in the numbers provided. No praise, no speculation beyond the data, no invented facts.

The user message is literally the numbers: `"Author: X. Works: 120. Total citations: 4,502. h-index: 31. Citations by year: 2019:210, 2020:280, …"` — the model narrates data it was handed, nothing more.

### 6.6 Meeting Notes — `api/tools/meeting-notes/route.ts`

Pure extraction, so it gets the **lowest temperature in the app (0.2)** and a `generateStructured` call:

> You summarize raw meeting notes/transcripts into a structured record. Extract ONLY what is actually in the notes — never invent attendees, decisions, or owners.
> - attendees: people explicitly mentioned as present (empty array if none are identifiable).
> - keyDecisions: decisions that were actually made (not topics merely discussed).
> - actionItems: concrete follow-ups; set owner to the named person or null if unassigned.
> - openQuestions: unresolved questions or deferred topics.

JSON shape: `{"attendees": [...], "keyDecisions": [...], "actionItems": [{"item": "...", "owner": "name or null"}], "openQuestions": [...]}`. The per-field definitions in the prompt ("decisions that were actually made, not topics merely discussed") are doing real work — that's the line between a useful summary and a vague one.

### 6.7 Diagram Builder — `api/tools/diagram-builder/route.ts`

Code generation: plain-language description → **Mermaid.js** diagram source (a text markup for flowcharts/sequence/state diagrams), rendered client-side by the `mermaid` library. Temperature 0.3, maxTokens 1500:

> You convert plain-language descriptions of processes, workflows, and study designs into Mermaid.js diagram code.
>
> Rules:
> - Output ONLY raw Mermaid code. No markdown fences, no explanation, no title line outside the diagram.
> - Use valid Mermaid syntax that renders in mermaid v11.
> - Quote node labels that contain parentheses, commas, or special characters: A["Label (detail)"].
> - Prefer clear, short node labels; put detail in edge labels where helpful.
> - For flowcharts use "flowchart TD" (or LR when the flow is wide and shallow).
> - For sequence diagrams use "sequenceDiagram" with named participants.
> - For state diagrams use "stateDiagram-v2".
> - Keep diagrams readable: at most ~20 nodes; group with subgraphs when it helps.

A `diagramType` selector injects either "Pick the diagram type … that best fits" or "Use a flowchart diagram" into the user message. The route still defensively strips markdown fences afterward — prompts reduce misbehavior, code guarantees correctness. The user can then hand-edit the Mermaid source and re-render, which makes the AI output a *starting point* rather than a take-it-or-leave-it artifact.

### 6.8 Non-AI surfaces

- **AI Policies** — static reference page (currently placeholder text to be replaced with official WashU policy language).
- **Saved items** (`api/saved-items/route.ts`) — one generic save/list endpoint shared by all tools.
- **`/api/tools/_test`** — an authenticated connectivity check that makes a real 50-token completion and returns latency + token usage. Handy when wiring up the Azure endpoint; consider removing or admin-gating it in production.

---

## 7. Future: making this HIPAA-friendly

**Where it stands today:** the app is explicitly *not* a HIPAA environment — README warning, permanent footer disclaimer, no BAA on the AI backend. That posture is honest and correct for v1. Here is the realistic path to changing it, in tiers.

A framing that will serve you well: **HIPAA compliance is a property of the whole system and its contracts, not of any single endpoint.** Swapping in a compliant LLM endpoint is necessary but nowhere near sufficient — every service that stores, processes, or transmits PHI needs to be covered, and there are Security Rule obligations (access control, audit, encryption, contingency planning) that are about *your* application code and operations, not Microsoft's.

### Tier 1 — the LLM backend (the change you already know about)

Point the app at the **HIPAA-eligible Azure OpenAI endpoint from WashU's data lake team (Microsoft Foundry)**. Because of the single-LLM-boundary design, this is purely configuration — set in the App Service environment:

```
AZURE_OPENAI_ENDPOINT=https://<washu-resource>.openai.azure.com
AZURE_OPENAI_API_KEY=<key from the datalake team>
AZURE_OPENAI_API_VERSION=2024-10-21          # or per their guidance
AZURE_OPENAI_DEPLOYMENT_NAME=<their deployment name>
```

The client auto-selects Azure when all four are present (`src/lib/llm/client.ts`). Then **remove `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` entirely** from every environment — they are uncovered backends, and you don't want a misconfiguration to silently fall back to one. Belt-and-braces: also set `LLM_PROVIDER=azure` so the choice is explicit rather than inferred. Verify with `/api/tools/_test`.

Things to confirm with the datalake team, not assume:
- Azure OpenAI is **HIPAA-eligible under WashU's Microsoft BAA** — confirm their resource is actually enrolled and that they consider your use case in scope.
- **Abuse-monitoring status.** By default Azure OpenAI may retain prompts/completions up to 30 days for abuse monitoring with potential human review. Enterprise/healthcare tenants typically have a **modified-access exemption** (no retention, no human review). Ask whether their resource has it; for PHI you want it.
- Whether they require **Entra ID (managed identity) auth instead of API keys** — see Tier 3.

### Tier 2 — everything else PHI would touch

If PHI ever enters a text box in this app, all of these must be true:

1. **Hosting under the BAA.** Azure App Service, Azure Database for PostgreSQL, Key Vault, and Application Insights are all HIPAA-eligible Azure services — but they're only covered if deployed in WashU's enrolled tenant/subscription. Host there, not on Vercel or a personal subscription (Vercel does not sign BAAs on standard plans).
2. **The database.** Azure Database for PostgreSQL Flexible Server with encryption at rest (default), `sslmode=require` in `DATABASE_URL`, private networking if possible, and automated backups configured to WashU's retention policy. Remember `SavedItem` stores full tool outputs — if a user pastes PHI into Meeting Notes and saves the summary, **that PHI is now in your Postgres**. The database is a PHI store the moment the policy changes.
3. **Third-party scholarly APIs.** OpenAlex, PubMed, Semantic Scholar, and Unpaywall have no BAA with anyone. Today only the *search query* goes to them, but a PHI-permitted app needs either (a) a hard rule + UI guardrails that queries are research topics only, or (b) those features fenced off from PHI workflows entirely. This is a policy + design decision to make *with the privacy office*, not a code detail.
4. **Logging hygiene.** `ToolRun.inputSummary` stores the first 100 characters of user input — under a PHI policy that becomes a PHI field in a table that outlives the content's usefulness. Change it to store only metadata (tool id, token counts, latency) or a non-reversible hash. Also audit `console.error` paths: error objects can embed request fragments, and App Service captures stdout. Configure Application Insights to scrub/sample accordingly.
5. **HIPAA Security Rule items the *app* owns:**
   - **Audit controls** — HIPAA wants to know *who accessed what, when*. Add an audit log for sign-ins, saved-item reads (not just writes), and admin actions. `ToolRun` is a start but is write-only usage accounting, not an access log.
   - **Automatic logoff** — shorten the session JWT lifetime (Auth.js `session.maxAge`) and consider idle timeout; the default 30-day session is too long for PHI.
   - **Access control** — SSO with MFA (Tier 4 below), and disable self-service `/signup` so only provisioned WashU identities get in.
   - **Transmission security** — TLS everywhere (App Service enforces HTTPS; turn on "HTTPS Only" and minimum TLS 1.2).
   - **Contingency plan** — documented backups/restore for Postgres, and a plan for what happens if the LLM endpoint is down.
6. **Formal steps:** a risk assessment with WashU's compliance office, inclusion in their HIPAA asset inventory, and updating the in-app disclaimer/AI-policies page to reflect the *actual* approved posture. Until all of the above is done, the "No PHI" footer stays.

### Tier 3 — hardening that's good practice regardless

- **Azure Key Vault + managed identity.** Store `DATABASE_URL`, `AUTH_SECRET`, and the Azure OpenAI key in Key Vault; App Service reads them via *Key Vault references* so secrets never sit in App Service config as plain text. Better still, use the App Service's **managed identity** to call Azure OpenAI with Entra ID tokens and no API key at all (the `AzureOpenAI` client supports `azureADTokenProvider` via `@azure/identity`'s `DefaultAzureCredential` — a small, contained change inside `client.ts`).
- **Private networking:** Private Endpoints for Postgres and the Azure OpenAI resource, VNet integration for App Service, so PHI traffic never crosses the public internet.
- **Security headers** (CSP, HSTS) via `next.config.ts`, and periodic `npm audit`/Dependabot.

### De-identification: your data-science superpower applied here

Coming from healthcare data science, you already know HIPAA Safe Harbor's 18 identifiers. A genuinely valuable middle path — before full PHI approval — is a **de-identification assist layer**: client-side or server-side screening of pasted text (regex for MRNs, DOBs, names against common patterns; or a dedicated PHI-detection model / Azure Health Data Services de-id API) that warns users *before* text leaves the browser. That keeps the no-PHI posture enforceable rather than merely stated, and it's a feature WashU compliance will love.

---

## 8. Future: WashU SSO (Microsoft Entra ID) on Azure App Service

The good news: **the provider is already written**, commented out in `src/lib/auth.ts`, with its env vars stubbed in `.env.example`. The app uses Auth.js's Entra ID provider (OIDC under the hood), which is the right approach here — keep auth inside the app rather than using App Service's built-in "Easy Auth", because Auth.js is what creates the `User` rows that `SavedItem`/`ToolRun` foreign-key to.

**Step by step:**

1. **App registration** (WashU IT does this in the WashU Entra tenant, or you request it):
   - Redirect URI (type *Web*): `https://<your-app>.azurewebsites.net/api/auth/callback/microsoft-entra-id` (add your custom domain later as a second URI).
   - Single-tenant ("Accounts in this organizational directory only") — this alone restricts sign-in to WashU accounts.
   - Create a **client secret** (note its expiry — set a renewal reminder) and collect three values: Application (client) ID, the secret, Directory (tenant) ID.
2. **App Service configuration** (Settings → Environment variables, or Key Vault references):
   ```
   AUTH_MICROSOFT_ENTRA_ID_ID=<application/client id>
   AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret>
   AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=<washu tenant id>
   AUTH_SECRET=<openssl rand -base64 32>
   AUTH_URL=https://<your-app>.azurewebsites.net   # explicit is safest behind proxies
   ```
   (`trustHost: true` is already set in `auth.config.ts`, which self-hosting on App Service requires.)
3. **Code change (two uncomments)** in `src/lib/auth.ts`: the `MicrosoftEntraID` import and the provider block. The issuer is already templated as `https://login.microsoftonline.com/<tenant>/v2.0`.
4. **Retire password auth**: remove the `Credentials` provider block and the `/signup` page so WashU SSO is the only door. Existing accounts survive if emails match — the Prisma adapter links the Entra identity to the `User` row by email. (Nuance: Auth.js blocks cross-provider linking by default as a safety measure; since the credentials users are just your test accounts, the cleanest move is a fresh start — let SSO create new users.)
5. **Optional access scoping**: in Entra, set the app's *Assignment required* flag and assign a group (e.g., a faculty group) so not every WashU account can sign in; or check group claims in the Auth.js `signIn` callback.
6. **Test:** sign-in should bounce to `login.microsoftonline.com`, prompt with the WashU account picker (and WashU's MFA policy — you inherit their Duo/conditional-access for free), and land back signed in.

**Deploying the app itself to App Service**, since it's implied: use an App Service Plan (Linux, Node 20+), build with `npm run build`, start with `npm run start` (or a container). Set *all* env vars from `.env.example` in App Service config. Point `DATABASE_URL` at Azure Postgres and run `npx prisma db push` once against it. Allow outbound HTTPS to the scholarly APIs and the Azure OpenAI endpoint (§4 of the README lists exact hosts). Watch the `maxDuration = 120` routes — App Service has no Lambda-style timeout problem, but its default load-balancer idle timeout (~230s) is fine for 120s requests.

---

## 9. Future steps, prioritized

**Near term (deployment-readiness):**
1. Azure App Service + Azure Postgres + Key Vault deployment (§8), Azure OpenAI backend via the datalake team's Foundry endpoint (§7 Tier 1), `LLM_PROVIDER=azure` pinned.
2. Entra ID SSO switch-on; delete credentials/signup path.
3. Replace the AI Policies placeholders with official WashU language; review the 30-calls/hour limit with real usage in mind; remove or admin-gate `/api/tools/_test`.
4. Application Insights for monitoring; a simple usage dashboard is nearly free since `ToolRun` already has tokens + latency per user per tool.

**Medium term (product quality):**
5. **Streaming responses** — the biggest UX win available. Long generations (IRB drafts) currently arrive all at once after up to a minute; the OpenAI/Azure SDKs support streaming, and Next.js route handlers can return a `ReadableStream`. Touches `client.ts` and the tool clients.
6. **Tests** — start with the pure functions (`merge.ts` dedupe/rank, `classifyInput` in bibliometric, `generateStructured`'s parse/retry with a mocked backend). Vitest is pytest for this world.
7. **CI** — GitHub Actions running lint + typecheck + tests on every PR (the repo already has branch rules and a PR template).
8. PHI-screening/de-identification warning layer (§7) — high compliance value, very buildable with your background.

**Longer term (the roadmap in `registry.ts`):**
9. Podcast Summaries and Team Workspaces are pre-wired as `status: "roadmap"` — flip the status, add a page + API route, and navigation updates itself.
10. If/when full HIPAA approval lands: Tier 2 items (audit logging, session tightening, log redaction, private networking) become the work plan, in that order.

---

*Sources: all prompts and behaviors quoted from `src/app/api/tools/*/route.ts`, `src/lib/llm/client.ts`, `src/lib/retrieval/*`, `src/lib/tools/*`, `src/lib/auth*.ts`, and `prisma/schema.prisma` as of commit 76a5ca0.*
