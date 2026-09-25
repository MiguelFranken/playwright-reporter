# Öffentliche REST-API: Plan und Entscheidungsvorlage

> Status: **entschieden, in Umsetzung** (oRPC v2, Fumadocs, TanStack Query) · Stand: 2026-09-25 · Scope: `apps/web` (Route Handler), `packages/protocol`
> (Schemas), Doku (neu) · Vorbild: der MCP-Plan (Commit `50dcf77`)

Die App stellt Playwright-Reports heute im Browser und über den MCP-Server dar. Mit einer öffentlichen REST-API sollen
dieselben Daten auch für Skripte, CI-Pipelines, Dashboards (Grafana, Backstage), Slack-Bots und eigene Tools
zugänglich werden. Dieser Plan

1. inventarisiert, was die App heute an HTTP-Schnittstellen hat,
2. vergleicht das mit der öffentlichen API von Testdino,
3. schlägt einen Endpunkt-Katalog vor,
4. stellt **mehrere Ansätze** für Implementierung, Spezifikation und Doku gegenüber, **zur Auswahl**, und
5. skizziert die Phasen danach.

Es geht noch nicht um die Implementierung. Die Stellen, an denen entschieden werden muss, sind mit **Entscheidung**
markiert und in [Abschnitt 9](#9-entscheidungen-auf-einen-blick) gesammelt.

---

## 1. Bestandsaufnahme: welche Schnittstellen es heute gibt

Die App hat 27 Route Handler in vier Gruppen. Keine davon ist eine öffentliche, dokumentierte Lese-API.

| Gruppe | Pfade | Auth | Zweck | Als öffentliche API nutzbar? |
|---|---|---|---|---|
| **Ingest** | `POST /api/ingest/runs`, `…/events`, `…/heartbeat`, `…/finish`, `…/attachments/upload-urls`, `…/attachments/:id/complete`, `PUT /api/ingest/uploads/:id` | Projekt-Token `pwr_…` (Bearer), Header `x-pw-reporter-protocol: 1` | Reporter schreibt Runs, Events, Artefakte | Ja, als **Schreib-API**. Die Schemas sind schon sauber in zod definiert (`packages/protocol/src/index.ts`). Damit ließe sich z. B. ein Reporter für eine andere Sprache bauen. Bisher undokumentiert. |
| **UI-Hilfsrouten** | `/api/teams/:team/projects/:project/…` (`live`, `runs/items`, `runs/:id/results`, `…/live`, `…/events`, `…/summary`, `tests/:id/overview`) | Session-Cookie (Better Auth) | Daten für Client-Komponenten, SSE-Live-Updates | Nein. Sie sind auf die UI zugeschnitten (ID-Listen statt Pagination, Plain-Text-Fehler, Cookie-Auth). |
| **MCP** | `POST/GET/DELETE /api/mcp` | PAT `pwr_pat_…` oder OAuth `pwr_oat_…`, Scope `read` | 16 read-only Tools für KI-Assistenten | Indirekt. Die **Domänenlogik** dahinter ist genau das, was eine REST-API bräuchte. |
| **Infrastruktur** | `/api/auth/*`, `/api/oauth/*`, `/.well-known/*`, `/api/artifacts/:id` (signierte URLs), `/api/avatars/…`, `/api/cron/*` | unterschiedlich | Login, OAuth-Server, Artefakt-Auslieferung, Cron | Nur `/api/artifacts` (signierte, kurzlebige Download-Links) wird von der API mitgenutzt. |

### Was wir wiederverwenden können

Für eine REST-API fehlt erstaunlich wenig:

- **Auth und Rechte sind fertig.** Personal Access Tokens (`personal_access_tokens`: Scopes, Einschränkung auf Teams
  oder ein Projekt, Ablaufdatum) und OAuth-Tokens werden in `lib/mcp/auth.ts` zu einem `Principal`. Dieser wird bei
  jedem Aufruf gegen die aktuelle Mitgliedschaft geprüft (`lib/auth/principal.ts`). Das Prinzip „404 statt 403“ und die
  Rollen (admin/member/viewer, superadmin) gelten für eine REST-API unverändert.
- **Die Lese-Schicht ist fertig.** `lib/db/queries/{runs,mcp,mcp-analysis,dashboard,explorer,branches,pull-requests}.ts`
  enthalten alle Abfragen, die die MCP-Tools nutzen: `searchRuns`, `searchRunResults`, `getResultDetail`, `searchTests`,
  `testExecutions`, `diffRunRows`, `dashboardStats` usw. Die Funktionen machen bewusst keine Auth-Prüfung, die
  übernimmt der Aufrufer.
- **DTO-Mapper und Output-Schemas existieren** für die MCP-Tools (`lib/mcp/tools/shared.ts`, `runSummarySchema`).
- **Parameter-Parsing existiert** (`lib/mcp/params.ts`): Projekt als `team/project`, Run als `#128`, `latest` oder
  `latest-failed`, `since`/`until` als Dauer oder ISO-Datum, Cursor-Pagination.
- **Rate-Limiting existiert** (`lib/mcp/rate-limit.ts`, Tabelle `rate_limits`, 120 Aufrufe pro Minute pro Credential).

### Was fehlt

- Kein **OpenAPI**, keine Versionierung (`/api/v1`), kein einheitliches Fehlerformat. Ingest antwortet mit `{error}`,
  die UI-Routen mit Plain Text, MCP mit `{error:{code,message,hint}}`.
- Kein CORS außer auf den OAuth-Endpunkten.
- Kein Rate-Limit auf Ingest, nur die 4 MB Obergrenze für den Body.
- Keine Webhooks, keine Schreib-Endpunkte außer Ingest. Die Berechtigung `run:delete` existiert, wird aber nirgends
  angeboten.
- Doku gibt es nur für MCP (`docs/mcp-tools.md`, **aus dem Code generiert** mit `nub run mcp:docs`). Genau dieses
  Muster, Doku aus dem Code statt von Hand, sollten wir für REST übernehmen.

---

## 2. Testdino im Vergleich

Quelle: [docs.testdino.com/api-reference](https://docs.testdino.com/api-reference/overview), abgerufen am 2026-09-25.

### Wie Testdino es macht

- **Doku:** Mintlify mit einer OpenAPI-3.0.3-Spezifikation, Playground, `llms.txt` für KI-Agenten.
- **Base URL:** `https://api.testdino.com/api/v1/public/{projectId}/…`. Jede Route ist projektgebunden.
- **Auth:** zwei Token-Arten.
  - API-Key `td_api_…` ist projektgebunden und nur fürs Hochladen gedacht.
  - PAT `td_pat_…` ist nutzergebunden, auf Orgs und Projekte eingrenzbar und gilt für die öffentliche API und MCP.
  - Beide laufen nach 30, 60, 90 oder 180 Tagen ab. Schreibzugriff erfordert zusätzlich eine Schreibrolle.
  - **Wir haben exakt dasselbe Modell:** `pwr_…` für Ingest und `pwr_pat_…` für MCP.
- **Envelope:** `{ success, data, pagination? }` bzw. `{ success:false, error:{ code, message } }` mit stabilen Codes
  (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMIT_EXCEEDED`).
- **Pagination:** meist `page`/`limit` mit festen Werten (10/25/50/100) und `{page, limit, total, hasNext, hasPrev}`,
  bei einigen Endpunkten `offset`/`limit`. **Nicht einheitlich.**
- **Datumsfilter:** bei Runs `start_date`/`end_date` (RFC 3339), bei Explorer und Analytics `days` (7/30/90).
  **Ebenfalls nicht einheitlich.**
- **Rate Limits:**
  - pro Token: 100 Lesezugriffe/min, 60 Schreibzugriffe/min, 1 PDF/min
  - pro IP vor der Auth: 200/min
  - Header `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`
- **Webhooks:** `run.started` und `run.finished` (mit Filter auf das Ergebnis), HMAC-SHA256-Signatur über
  `<timestamp>.<body>`, Retries nach 1/5/30/120 min, Auto-Deaktivierung nach 5 Fehlschlägen, Delivery-Log.

### Endpunkt-Gruppen: Testdino und wir

| Testdino-Gruppe | Endpunkte (Auszug) | Unser Gegenstück heute (MCP / Query) | Bewertung |
|---|---|---|---|
| Token Info | `GET /{projectId}/token-info` | `whoami` | ✅ übernehmen, als `GET /v1/me` |
| Test Runs | `GET /test-runs` (Filter: status, branch, env, author, tags, search, Datumsbereich, sort), `GET /test-runs/{id}` | `list_runs`, `get_run` (`searchRuns`, `getRunByNumber`) | ✅ direkt abbildbar. Wir können zusätzlich nach PR, Commit, Executor (CI/lokal) filtern und Runs per `#128`/`latest` ansprechen. |
| Test Cases | `GET /test-cases/{id}`, `GET /test-cases/history?title=` | `get_result`, `get_test_history` | ✅ Wir sind stärker: stabile Test-IDs statt Suche über den Titel, Aufschlüsselung nach Environment und Branch, Sibling-Browser. |
| Specs | `GET /specs` (Health pro Spec-Datei, 7/30/90 Tage) | `listRunSpecs` (nur pro Run) | ➕ neu: projektweite Spec-Health, aus `searchTests` aggregiert nach `file` |
| Test Case Explorer | `GET /test-case-explorer` (flaky/chronic/stable, Sortierung nach reliability, p95…) | `find_tests` (`searchTests`, `exploreTests`) | ✅ 1:1 vorhanden |
| Debug Bundle | `GET /debug-bundle?runId|suiteId|caseId`, `as=json|markdown`, `view=full|brief`, `budgetChars` | `get_failure_context`, `summarize_failures` | ✅ Wir sind stärker (Verdict, Regressionsfenster, „ruled out“). Die Idee mit `as=markdown` und dem Budget übernehmen wir über `Accept: text/markdown`. |
| Dashboard | `GET /dashboard` (feste 30 Tage, aktive Runs) | `project_health`, `dashboardStats`, `listActiveRuns` | ✅ Wir sind flexibler (`since`, `branch`). |
| Filters | `GET /filters` | `list_filters` (`listFacets`) | ✅ 1:1 |
| Analytics | `GET /analytics/summary` (top failing, flaky, slowest, tags) | `project_health`, `topErrorSignatures`, `passFailTrend` | ✅ in `health` enthalten, dazu `trend` als eigener Endpunkt |
| Reports | `POST /reports/pdf` | — | ⏸ eher später. Stattdessen Exporte als **JUnit-XML/CSV/JSON**, die in CI und Tools nützlicher sind als PDF. |
| Webhooks | CRUD + Deliveries | — (nur Web-Push) | ➕ neu, Phase 3 |
| Usage | `GET /usage` (Abo-Limits) | — | ⏸ Wir sind self-hosted, es gibt kein Abo. Allenfalls Admin-Endpunkt für Speicher- und Retention-Status. |
| Manual Tests / Manual Runs / Releases / Sessions | CRUD | — | ❌ Nicht-Ziel. Diese Domänen haben wir nicht, und der MCP-Plan hat sie bewusst ausgeschlossen. |

### Was wir darüber hinaus bieten können und Testdino nicht

- **Diagnose-Endpunkte:**
  - `compare` (Run gegen Run oder Branch gegen Base-Branch)
  - `verify-fix` (hat der Fix gehalten?)
  - `flakiness` (Verdict mit Konfidenz)
  - `rerun-command` (fertiger `npx playwright test …`-Befehl)
  
  Alle vier existieren als MCP-Logik.
- **Branches und Pull Requests als Ressourcen** (`branchList`, `getPullRequestOverview`), z. B. für ein PR-Status-Check.
- **Live-Stream** eines laufenden Runs per SSE. Er existiert schon für die UI und muss nur mit Bearer-Auth versehen
  werden.
- **Artefakte** mit kurzlebigen signierten Links und Trace-Viewer-Link.
- **Badges** (`/badges/{team}/{project}.svg`) fürs README: günstig und sichtbar.
- **Dokumentiertes Ingest-Protokoll**, damit Dritte eigene Reporter bauen können.

### Was wir von Testdino übernehmen und was wir besser machen

| Übernehmen | Besser machen |
|---|---|
| Ein Credential-Modell für API und MCP (PAT) | **Eine** Pagination-Art überall (Cursor), nicht mal `page`, mal `offset` |
| Stabile, maschinenlesbare Fehlercodes | **Ein** Zeitfilter überall (`since`/`until`, Dauer oder ISO-Datum), nicht mal `start_date`, mal `days` |
| `RateLimit-*`-Header, getrennte Lese- und Schreiblimits | Beliebige `limit`-Werte (1–100) statt fester Werte |
| `url` (Deep-Link in die UI) in jeder Ressource | Ressourcen über lesbare Referenzen adressierbar (`acme/web`, `#128`, `latest`), nicht nur über interne IDs |
| `llms.txt` und Markdown-Antworten für Agenten | Die Spezifikation wird **aus dem Code generiert** und in CI auf Breaking Changes geprüft |
| Webhooks mit HMAC-Signatur und Delivery-Log | Webhook-Payloads nach dem **Standard Webhooks**-Format (`webhook-id`, `webhook-timestamp`, `webhook-signature`), damit fertige Libraries sie prüfen können |

---

## 3. Leitlinien für die API

Diese Leitlinien gelten unabhängig vom gewählten Ansatz. Mit Ausnahme von Envelope und Pfadschema sind sie Vorschläge,
über die nicht separat entschieden werden muss.

1. **Dieselben Daten wie in der UI, nie mehr.** Wir nutzen denselben `Principal`, dieselben Rollen und „404 statt
   403“. Die Rechteprüfung passiert einmal in einem gemeinsamen Wrapper, nicht in jedem Handler.
2. **Eine Domänenschicht, mehrere Oberflächen.** REST und MCP rufen dieselben Query-Funktionen und DTO-Mapper auf. Ein
   MCP-Tool ist dann „REST-Ressource plus Rendering für Modelle“. Vorbedingung dafür ist eine Refaktorierung:
   `lib/mcp/tools/*` → `lib/api/*` (siehe Phase 0).
3. **Self-hosted zuerst.** Jede Instanz hat eine eigene Base-URL. Die Spezifikation beschreibt deshalb `servers` mit
   einer Variablen, und jede Instanz liefert ihre **eigene** Spezifikation und Doku aus, passend zu ihrer Version.
4. **Lesen zuerst.** v1 ist read-only (Scope `read`). Schreibzugriffe kommen später mit Scope `write`.
5. **Versionierung im Pfad:** `/api/v1/…`. Änderungen innerhalb von v1 sind nur additiv. CI erzwingt das (siehe
   Abschnitt 7).
6. **Einheitlich:**
   - Cursor-Pagination (`limit`, `cursor` → `nextCursor`)
   - Zeitfenster `since`/`until`
   - Zeitstempel in ISO 8601 UTC
   - Felder in camelCase
   - IDs als UUID, zusätzlich die lesbaren Referenzen
7. **Fehlerformat — Entscheidung E1:**
   - **(a) RFC 9457 `application/problem+json`**
     - Format: `{type, title, status, detail, code, …}`
     - Vorteil: IETF-Standard, von OpenAPI-Tools und Clients gut unterstützt.
     - Erfolgsantworten bleiben ohne Envelope: die Ressource bzw. `{data, nextCursor}`.
     - *Empfehlung.*
   - **(b) Testdino-Envelope `{success, data, error}`**
     - Vorteil: sehr einfach zu konsumieren.
     - Nachteil: `success` doppelt den HTTP-Status, und Tools können den Envelope schlechter typisieren.
   - Die Fehlercodes übernehmen wir in beiden Fällen aus `lib/mcp/errors.ts`, damit MCP und REST dieselben Codes haben.
8. **Content-Negotiation:** `Accept: application/json` (Standard) oder `text/markdown` bei den Diagnose-Endpunkten.
   Dafür verwenden wir die vorhandenen MCP-Renderer (`lib/mcp/render`).
9. **Caching:** `ETag`/`If-None-Match` auf abgeschlossenen Runs und Ergebnissen (diese sind unveränderlich), und
   `Cache-Control: private`.
10. **CORS:** standardmäßig aus. Per Instanz-Einstellung lassen sich erlaubte Origins freischalten, etwa für interne
    Dashboards.

---

## 4. Vorgeschlagener Endpunkt-Katalog

Die Präfixe sind `/api/v1` und `P = /projects/{team}/{project}`. Die Spalte „Quelle“ zeigt, woraus der Endpunkt
entsteht:

- **M** = als MCP-Tool vorhanden, wird nur neu verpackt
- **Q** = Query vorhanden, braucht einen neuen DTO
- **N** = neu

**Entscheidung E2 (Pfadschema):**

- **(a)** Lesbare Slugs im Pfad: `/projects/acme/web/runs/128`. Das passt zur UI-URL und zu MCP-Referenzen.
  *Empfehlung.*
- **(b)** Nur UUIDs: `/projects/{projectId}/runs/{runId}`, wie bei Testdino. Robuster gegen Umbenennungen, aber
  unhandlich in Skripten.

Bei (a) akzeptieren wir UUIDs zusätzlich, und Antworten enthalten immer `id` **und** `ref`.

### Phase 1: read-only Kern (v1.0)

| Methode | Pfad | Zweck | Quelle |
|---|---|---|---|
| GET | `/me` | Token-Info: Nutzer, Credential-Art, Scopes, Einschränkungen, Ablauf, Rate-Limit | M `whoami` |
| GET | `/teams` | Teams des Aufrufers | Q `listMyTeams` |
| GET | `/teams/{team}/projects` | Projekte eines Teams | Q `listTeamProjects` |
| GET | `P` | Projekt-Metadaten (Default-Branch, Run-Zähler, Links) | Q |
| GET | `P/filters` | Branches, Environments, Browser, Tags, Autoren | M `list_filters` |
| GET | `P/runs` | Runs filtern und sortieren (status, branch, pullRequest, environment, author, commit, tag, executor, search, since, until, sort) | M `list_runs` |
| GET | `P/runs/{run}` | Ein Run (`128`, `latest`, `latest-failed`, UUID) mit Zählern, Git- und CI-Kontext; `include=failures,specs,shards,metadata` | M `get_run` |
| GET | `P/runs/{run}/results` | Testergebnisse eines Runs, Fehler zuerst, filterbar | M `list_run_results` |
| GET | `P/results/{resultId}` | Ein Ergebnis mit allen Attempts, Fehlern, Steps, optional Logs | M `get_result` |
| GET | `P/results/{resultId}/attachments` | Artefakt-Metadaten mit signierten Links | Q `attachmentsOfResult` |
| GET | `P/attachments/{attachmentId}` | Ein Artefakt: Metadaten und Download-Link (302 bei `?download`) | M `get_artifact` |
| GET | `P/tests` | Explorer: flakiest, failing, chronic, slowest, getting slower, Suche | M `find_tests` |
| GET | `P/tests/{testId}` | Ein Test über die Zeit: Reliability, Raten, p95, Trend, nach Env und Branch | M `get_test_history` |
| GET | `P/tests/{testId}/executions` | Historie der Ausführungen (paginiert) | Q `testExecutions` |
| GET | `P/specs` | Health pro Spec-Datei (wie Testdino) | N (Aggregation) |
| GET | `P/health` | Projekt-Überblick: Pass-Rate, Reliability, Fix-First-Liste, Top-Fehler | M `project_health` |
| GET | `P/trend` | Pass-, Fail- und Flaky-Verlauf pro Tag | Q `passFailTrend` |

### Phase 2: Diagnose und Integration (v1.1)

| Methode | Pfad | Zweck | Quelle |
|---|---|---|---|
| GET | `P/runs/{run}/failure-groups` | Fehler nach Root Cause (Signatur) gruppiert, neu oder schon bekannt | M `summarize_failures` |
| GET | `P/results/{resultId}/failure-context` | „Debug Bundle“: Verdict, Regressionsfenster, Ausbreitung, ruled out; auch `text/markdown` | M `get_failure_context` |
| GET | `P/runs/{run}/compare?base=` | Diff zweier Runs oder Branch gegen Base | M `compare_runs` |
| GET | `P/tests/{testId}/flakiness` | Flaky, broken oder zu wenig Daten, mit Evidenz | M `check_flakiness` |
| GET | `P/tests/{testId}/verify-fix?baselineRun=` | Hat der Fix gehalten? | M `verify_fix` |
| GET | `P/runs/{run}/rerun-command` | `npx playwright test …` pro Browser-Projekt | M `get_rerun_command` |
| GET | `P/runs/{run}/export?format=junit\|csv\|json` | Export für CI und Reporting-Tools | N |
| GET | `P/runs/{run}/events` | Live-Stream (SSE) bzw. Polling (`since`) für laufende Runs | Q `eventsSince` |
| GET | `P/branches`, `P/branches/{branch}` | Branch-Liste und -Überblick | Q `branchList`, `getBranchOverview` |
| GET | `P/pull-requests`, `P/pull-requests/{number}` | PR-Liste und -Überblick (für Status-Checks) | Q `pullRequestList`, `getPullRequestOverview` |
| GET | `/badges/{team}/{project}.svg` | Status-Badge (öffentlich per Projekt-Einstellung, sonst per Token) | N |

### Phase 3: Schreiben und Webhooks (v1.2, Scope `write`)

| Methode | Pfad | Zweck |
|---|---|---|
| GET/POST | `P/webhooks` | Webhooks auflisten und anlegen (Events: `run.started`, `run.finished`, `run.failed`, `test.flaky`, `test.regressed`) |
| GET/PATCH/DELETE | `P/webhooks/{id}` | Webhook lesen, ändern, löschen |
| GET | `P/webhooks/{id}/deliveries` | Delivery-Log inkl. Redeliver |
| DELETE | `P/runs/{run}` | Run löschen (die Berechtigung `run:delete` existiert schon) |
| PATCH | `P/runs/{run}` | Tags und Notizen setzen |
| GET/POST/DELETE | `P/tokens` | Ingest-Tokens verwalten, z. B. für die Automatisierung von Projekt-Setups |
| POST | `/teams/{team}/projects` | Projekt anlegen (Terraform- und IaC-Anwendungsfälle) |

### Ingest: dokumentieren, nicht neu bauen

Die vorhandenen `/api/ingest/*`-Routen bekommen einen eigenen Abschnitt in der Spezifikation: Tag „Ingest“, eigenes
Security-Schema „Projekt-Token“. Die Pfade bleiben, denn der veröffentlichte Reporter nutzt sie. Die Versionierung läuft
dort weiter über den Header `x-pw-reporter-protocol`. Die zod-Schemas in `packages/protocol` werden zur Quelle dieses
Abschnitts.

---

## 5. Implementierung und Spezifikation

Die Kernfrage: **Wer ist die Quelle der Wahrheit, der Code oder das OpenAPI-Dokument?** Eine OpenAPI-Spezifikation
brauchen wir auf jeden Fall. Doku-Frameworks, Playgrounds, SDK-Generatoren, Contract-Tests, Breaking-Change-Checks und
KI-Agenten setzen alle darauf auf. Die Frage ist nur, wie sie entsteht.

Für die Wahl wichtig: Das Repo nutzt schon **zod 4** (`^4.6.5`), und alle Ingest-Schemas liegen als zod in
`packages/protocol`. zod 4 erzeugt JSON Schema nativ (`z.toJSONSchema`). Die Domänen-Schemas müssen in keinem der
folgenden Ansätze doppelt gepflegt werden.

### Was Scalar selbst für Next.js empfiehlt

Scalar dokumentiert **drei Rezepte** für Next.js. In allen dreien wird die Referenz gleich eingebunden: ein Route
Handler `app/…/route.ts` mit `ApiReference({ url: '/…/openapi.json' })` aus `@scalar/nextjs-api-reference`. Scalar
selbst erkennt keine Routen und erzeugt keine Spezifikation, es rendert nur, was man ihm gibt. Die Rezepte
unterscheiden sich also darin, **woher die Spezifikation kommt**:

| Rezept | Wie die Spezifikation entsteht | Einordnung |
|---|---|---|
| **Route Handler + zod** | zod-Schemas in normalen Route Handlern. Die Spezifikation wird **von Hand** in einem eigenen Route Handler zusammengesetzt: Pfade, Methoden und Statuscodes ausschreiben, Schemas per `z.toJSONSchema()` einsetzen. | Minimal, gut für eine Handvoll Endpunkte. Bei rund 30 Endpunkten müssten wir Pfad, Methode, Parameter und Antwort zweimal pflegen, im Handler und im Dokument, oder einen eigenen `defineRoute`-Helper bauen. Das war mein Ansatz A, und der Eigenbau darin ist genau das, was die beiden anderen Rezepte fertig mitbringen. **Du hast richtig beobachtet: Das ist nicht der übliche Weg für eine API dieser Größe.** |
| **Hono + `@hono/zod-openapi`** | Ein Catch-all-Handler `app/api/v1/[[...route]]/route.ts` gibt die Anfragen an eine Hono-App weiter. Jede Route wird mit `createRoute({ method, path, request, responses })` deklariert und mit `app.openapi(route, handler)` registriert. `app.getOpenAPI31Document()` erzeugt die Spezifikation. | Der **verbreitetste code-first-Weg** im TypeScript-Umfeld. Spezifikation, Validierung und Typen kommen aus einer Deklaration. |
| **oRPC + `@orpc/openapi`** | Procedures mit `.route({ method, path })` und zod-Input und -Output. Ein Catch-all-Handler mit `OpenAPIHandler`, die Spezifikation aus `OpenAPIGenerator`. | Contract-first in TypeScript, typsicherer Client inklusive. Jünger und weniger verbreitet als Hono. |

### Revidierte Empfehlung: Hono im Catch-all-Handler

Ich empfehle, E3 von „A: zod + Route Handler“ auf **Hono mit `@hono/zod-openapi`** zu ändern. Das ist weiterhin
„zod 4 + Next.js Route Handler“, nur dass ein einziger Handler die Hono-App einbindet, statt jede Route als eigene Datei
anzulegen.

```
apps/web/
├── app/api/v1/[[...route]]/route.ts   → export const GET = handle(api), POST = …   (hono/vercel)
├── app/api/v1/openapi.json/route.ts   → api.getOpenAPI31Document({ info, servers })
├── app/api/docs/route.ts              → ApiReference({ url: '/api/v1/openapi.json' })   (Scalar)
└── lib/api/
    ├── app.ts          → OpenAPIHono-Instanz, Middleware: Auth (Principal), Rate-Limit, Fehler, ETag
    ├── routes/runs.ts  → createRoute(…) + Handler, rufen lib/db/queries/* auf
    └── schemas/…       → zod-Schemas (mit .meta() für Beschreibungen und Beispiele)
```

**Kein zusätzlicher Server.** Hono ist hier nur eine Router-Bibliothek, kein eigener Prozess und kein eigener Port.

- Next.js nimmt die Anfrage wie bei jedem anderen Route Handler an. Der Handler gibt das Web-Standard-`Request`-Objekt
  an `app.fetch(req)` weiter und gibt die `Response` zurück. `handle` aus `hono/vercel` ist wörtlich
  `(app) => (req) => app.fetch(req)`.
- Alles läuft im selben Next.js-Prozess und im selben Deployment, auf Vercel in derselben Function.
- `proxy.ts`, Datenbank-Verbindung, `lib/db/queries/*` und `lib/auth/*` werden unverändert genutzt.
- Was sich ändert: Die Segment-Konfiguration (`runtime`, `maxDuration`) gilt für den ganzen Catch-all statt pro Route.
  Die Endpunkte von `/api/v1` liegen in einem gemeinsamen Bundle.

**Warum Hono:**

1. **Kein Eigenbau.** Validierung, Typen, Spezifikation, Fehler-Hooks und Middleware (Bearer-Auth, CORS, ETag,
   Secure Headers) sind fertig. Unser Eigenanteil sind nur der Auth-Adapter auf den vorhandenen `Principal` und das
   Fehlerformat.
2. **Gut für KI-Agenten.** Hono und `createRoute` kommen in Trainingsdaten und Beispielen sehr häufig vor. Ein Agent
   kann einen neuen Endpunkt nach dem Muster eines bestehenden anlegen, ohne unseren Helper zu verstehen.
3. **Die Spezifikation kann nicht driften.** Eine Route, die nicht über `app.openapi()` registriert ist, erscheint
   nicht in der Spezifikation. Die Registrierung ist aber zugleich der einzige Weg, die Route überhaupt auszuliefern.
4. **Bestehende Routen bleiben unberührt.** Nur `/api/v1/*` läuft über Hono. Ingest, MCP und die UI-Routen bleiben
   normale Route Handler. Die Ingest-Routen können wir trotzdem dokumentieren, ohne sie umzubauen:
   `api.openAPIRegistry.registerPath(…)` mit den Schemas aus `packages/protocol`.
5. **Testbar ohne Server.** `api.request('/api/v1/runs', { headers })` ruft die App in Vitest direkt auf. Der
   typsichere Client `hc<typeof api>` eignet sich für Integrationstests.

**Nachteile:**

- Ein zweiter Router neben dem App Router. Für `/api/v1` gelten dann Hono-Konventionen statt Next.js-Konventionen.
- `@hono/zod-openapi` baut intern auf `@asteasolutions/zod-to-openapi` auf. Die Unterstützung für zod 4 ist dort
  vorhanden. Im Proof of Concept prüfen wir, dass unsere Schemas aus `packages/protocol` sauber durchlaufen.

**Wann oRPC besser wäre:** wenn wir den **Vertrag** der API als eigenes Paket veröffentlichen wollen, etwa einen
Contract in `packages/protocol` mit typsicherem Client für Dritte. Für eine API, die nicht das Kernprodukt ist, lohnt
sich das nicht.

### oRPC v2 (Beta) geprüft

> Stand 2026-09-25: die stabile Version ist v1.15.4. v2 ist bei `2.0.0-beta.40` (Betas 38–40 erschienen zwischen dem
> 21. und 23.09.), ohne angekündigten Termin für die stabile Version.
> Quellen: GitHub-Releases, orpc.dev (Migrationsleitfaden von v1).

**Serverless, Vercel und Self-Hosting: kein Problem.**

- oRPC läuft wie Hono **innerhalb** eines Next.js Route Handlers: `app/api/v1/[[...rest]]/route.ts` ruft
  `OpenAPIHandler.handle(request, { prefix: '/api/v1', context })` auf, über den Fetch-Adapter.
- Der Handler ist zustandslos pro Anfrage. Es gibt keinen eigenen Server und keine dauerhaften Verbindungen.
- **Überall, wo unsere Next.js-App läuft, läuft auch oRPC:** Vercel, Docker bzw. Node, Netlify, Cloudflare über
  OpenNext. Ob die Instanz portabel ist, entscheidet Next.js, nicht oRPC.
- Falls wir die API je aus Next.js herauslösen: Es gibt offizielle Adapter für Node HTTP, AWS Lambda, Cloudflare
  Workers, Hono, Express, Fastify u. a.

Worauf wir serverless achten müssen, gilt für jeden Ansatz gleich:

- **Keine In-Memory-Helfer.** Für Rate-Limit oder Publisher/Subscriber braucht es Speicher-Adapter für
  Datenbank oder Redis. Wir haben mit `rate_limits` schon eine Datenbank-Variante und nutzen die weiter.
- **Keine WebSockets auf Vercel.** Streams (SSE bzw. Event-Iterator) funktionieren, aber nur innerhalb von
  `maxDuration`. Unsere Live-Routen machen das heute schon so.
- **Cold Start:** den Router auf Modulebene aufbauen, große Teilbereiche bei Bedarf per `lazy()` nachladen.

**Was für oRPC v2 spricht:**

- Zielt ausschließlich auf zod 4, passt zu uns.
- Der Contract (Pfade, Schemas, Fehler) kann in `packages/protocol` liegen, getrennt von der Implementierung in
  `apps/web`. Das passt zur Rolle von `packages/protocol` als Vertrag zwischen Reporter und App.
- Typsicherer Client geschenkt, z. B. für Tests, spätere SDKs oder das Admin-Tooling.
- Die OpenAPI-Erzeugung ist eingebaut und lässt sich als Build-Skript ausführen (`OpenAPIGenerator.generate`).
- Eingebaute Helfer für Rate-Limit, CORS, Tracing (OpenTelemetry) und Logging (pino).
- **Wer jetzt neu anfängt, spart sich die Migration von v1 auf v2.** Der Umbau ist groß: `.route()` entfällt, das
  Routing wandert in `openapi`-Metadaten, das Fehlermodell ändert sich.

**Was gegen v2 zum jetzigen Zeitpunkt spricht:**

- **Es kommen noch Breaking Changes.** `beta.37` hat vor wenigen Tagen Adapter-Interceptors und -Plugins entfernt.
  Mit einer Beta kann sich das Verhalten unserer **öffentlichen** API ändern, ohne dass wir selbst etwas ändern, etwa
  beim Fehler-Body, bei Coercion oder bei GET-Regeln.
- **Standard ist OpenAPI 3.2.** `fumadocs-openapi` und die meisten Tools erwarten 3.1. Wir setzen deshalb
  `version: '3.1.1'` explizit.
- **GET-Anfragen lehnt v2 standardmäßig ab.** Die erlaubten Methoden müssen explizit gesetzt werden
  (`allowMethods`). Im Proof of Concept prüfen, wie sich das mit `OpenAPIHandler` und unseren GET-Endpunkten verhält.
- **Nur oRPC-Routen landen in der Spezifikation.** Die Ingest-Routen, die normale Route Handler bleiben, müssen als
  eigenes Fragment dazugemischt werden, erzeugt aus den zod-Schemas in `packages/protocol`. Bei Hono geht das direkt
  über `openAPIRegistry.registerPath`.
- Weniger verbreitet als Hono, also auch weniger Beispiele für KI-Agenten. Die Doku stellt aber `llms.txt` bereit.

**Leitplanken, falls wir v2 nehmen:**

1. Exakte Version pinnen, ohne `^`. Updates nur bewusst per PR, mit Changelog-Review.
2. Eigenes Fehlerformat (Problem Details) über `customErrorResponseBodySchema` und Handler-Konfiguration festlegen,
   damit Änderungen an den Standardwerten von oRPC unsere API nicht verändern.
3. Contract-Tests auf HTTP-Ebene in `test:integration`, dazu `oasdiff` in CI (Abschnitt 7). Beides schlägt an, wenn ein
   oRPC-Update das Verhalten oder die Spezifikation verändert.
4. Die öffentliche Freigabe von `/api/v1` erst, wenn v2 stabil ist oder die Tests aus Punkt 3 alle Endpunkte abdecken.

**Entscheidung E3:**

- **oRPC v2, exakt gepinnt, mit den Leitplanken** *(neue Empfehlung, wenn euch der Contract-Ansatz gefällt)*
- Hono mit `@hono/zod-openapi` (reifer, stabile Version, nur Code statt Contract)
- oRPC v1.15 (stabil, aber später die große Migration auf v2)
- zod + einzelne Route Handler mit eigenem Helper (bisher A)

---

## 6. Dokumentation

### Anforderungen (Stand 2026-09-25)

1. **Kostenlos**, und das dauerhaft, nicht nur im Einstiegstarif.
2. **Eigene Domain.**
3. **Produkt-Doku steht im Vordergrund:**
   - worum es im Projekt geht
   - Deployment und Konfiguration
   - Admin-Oberfläche, Teams, Tokens, Retention
   - Reporter und MCP
   
   Die REST-Referenz ist zweitrangig, soll aber dabei sein.
4. **Moderner Stack, mit dem wir gut arbeiten können**, gut KI-unterstützt:
   - `llms.txt`
   - jede Seite als Markdown
   - Docs-MCP-Server
   - Inhalte, die ein Agent im selben PR wie den Code ändern kann
5. **Eigenbau ist in Ordnung.** Mit KI-Agenten sind fehlende Teile schnell ergänzt.

Diese Anforderungen verschieben die Bewertung deutlich. Gehostete Plattformen verlieren, weil ihre kostenlosen Tarife
genau die Dinge weglassen, die wir später wollen. **Frameworks, die wir selbst hosten**, gewinnen.

### Die Kandidaten

| | Fumadocs | Starlight | Docusaurus | Nextra 4 | Mintlify Starter | Scalar Docs Free | Zudoku |
|---|---|---|---|---|---|---|---|
| Art | Framework (Next.js, React) | Framework (Astro) | Framework (React, eigener Build) | Framework (Next.js) | gehostete Plattform | gehostete Plattform | Framework (React, Vite) |
| Kosten | 0 $, MIT | 0 $, MIT | 0 $, MIT | 0 $, MIT | 0 $ | 0 $ | 0 $, MIT |
| Eigene Domain | ✅ (eigenes Hosting) | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Gleicher Stack wie wir (Next.js 16, React 19, Tailwind 4) | ✅ | ❌ (Astro) | ◐ (React, aber kein Next.js und kein Tailwind-Standard) | ✅ | — | — | ◐ (React, Vite) |
| `packages/ui` wiederverwendbar | ✅ | ◐ (React-Islands) | ◐ | ✅ | ❌ | ❌ | ◐ |
| Produkt-Doku (MDX, Komponenten, Navigation) | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ◐ (API-zentriert) |
| OpenAPI-Referenz mit Playground | ✅ `fumadocs-openapi`, gleiches Design | ◐ Plugin `starlight-openapi` | ◐ Plugin `docusaurus-openapi-docs` | ❌ (Scalar einbetten) | ✅ | ✅ | ✅ (Kernfunktion) |
| `llms.txt`, `llms-full.txt`, Markdown pro Seite | ✅ eingebaut, auch per `Accept`-Header | ◐ per Plugin | ◐ per Plugin | ◐ Eigenbau | ✅ | ✅ | ◐ |
| Docs-MCP-Server | ✅ eingebaut (`/api/mcp`: Seiten auflisten, suchen, lesen) | ◐ Community-Plugins | ❌ Eigenbau | ❌ Eigenbau | ✅ | ❌ (ab Pro) | ◐ |
| „Ask AI“-Chat | ✅ Komponente, eigener LLM-Anbieter (Kosten nur pro Nutzung) | ❌ | ❌ | ❌ | ❌ (ab Pro) | ◐ | ❌ |
| Suche | ✅ eingebaut (Orama), optional Algolia | ✅ eingebaut (Pagefind) | ◐ Algolia DocSearch | ✅ eingebaut | ✅ | ✅ | ✅ |
| Mehrsprachigkeit | ✅ | ✅ (sehr gut) | ✅ (sehr gut) | ✅ | ❌ (ab Pro) | ❌ | ◐ |
| Versionierung der Doku | ◐ per Ordner oder Deployment pro Release | ◐ per Plugin | ✅ eingebaut | ◐ | ❌ (ab Pro) | ❌ | ◐ |
| Preview pro PR | ✅ (über das Hosting) | ✅ | ✅ | ✅ | ❌ (ab Pro) | ❌ | ✅ |

Kurz zu jedem:

- **Fumadocs:**
  - Next.js-natives Doku-Framework, in einer Reihe von Vergleichen 2026 der Favorit, wenn die Doku sich wie ein Teil
    eines Next.js-Produkts anfühlen soll.
  - **Die KI-Funktionen sind eingebaut, nicht als Plugins:**
    - `llms.txt` und `llms-full.txt`
    - `.md`-Variante jeder Seite, Content-Negotiation per `Accept: text/markdown`
    - Buttons „Markdown kopieren“ und „In ChatGPT/Claude öffnen“
    - ein MCP-Endpunkt mit Werkzeugen zum Auflisten, Suchen und Lesen der Seiten
    - ein Ask-AI-Chat, den man an einen eigenen LLM-Anbieter anschließt
  - `fumadocs-openapi` erzeugt API-Seiten mit Playground aus `openapi.json`, im selben Design wie der Rest.
  - Keine eingebaute Versionierung.
- **Starlight:**
  - hervorragend für reine Content-Doku, schnell, beste Mehrsprachigkeit
  - Aber es ist **Astro**, ein zusätzlicher Stack. `packages/ui` lässt sich nur als React-Islands einbinden.
  - Das offizielle `llms.txt` ist 2026 aus Astros eigener Doku entfernt worden. Die Community setzt stärker auf
    MCP-Plugins, der Weg ist im Fluss.
- **Docusaurus:**
  - der Veteran, eingebaute Versionierung und Mehrsprachigkeit, riesiges Ökosystem
  - Der Stack wirkt aber älter: eigener Build, kein Next.js, kein Tailwind als Standard.
  - Die KI-Funktionen kommen nur über Plugins oder Eigenbau.
  - Wäre die Wahl, wenn Versionierung der Doku das wichtigste Kriterium wäre.
- **Nextra 4:** Next.js und schlicht, gut für Content. Aber keine OpenAPI- und keine KI-Funktionen eingebaut. Mit
  Fumadocs bekommen wir auf demselben Stack deutlich mehr.
- **Mintlify Starter:**
  - Erfüllt „kostenlos + eigene Domain“, ist aber proprietär.
  - Alles, was wir später wollen, liegt im Pro-Tarif für 450 $ im Monat: Preview pro PR, Versionierung,
    Mehrsprachigkeit, Ask AI.
  - Das Design passt nicht zu `packages/ui`.
  - Bleibt die Wahl für „null Aufwand“, falls wir die Doku doch nicht selbst betreiben wollen.
- **Scalar Docs Free:** ohne eigene Domain und ohne Guides per Git-Sync. **Scheidet aus.** Die Open-Source-Komponente
  Scalar API Reference bleibt davon unberührt (siehe unten).
- **Zudoku (von Zuplo):** Open Source und API-first. Stark, wenn die API das Produkt ist. Bei uns ist sie zweitrangig.

### Empfehlung: Fumadocs als eigenes App `apps/docs`

| Baustein | Werkzeug | Warum |
|---|---|---|
| Doku-Seite | **Fumadocs** in einem neuen Workspace `apps/docs` (Next.js 16, Tailwind 4) | Unser Stack, wir kennen ihn. Keine Lizenzkosten, eigene Domain über das Hosting, volle Kontrolle. |
| Design | Tokens und Komponenten aus `packages/ui` | Die Doku sieht aus wie die App. Screenshots und Live-Beispiele passen. |
| Inhalte | MDX in `apps/docs/content/` im Monorepo | Doku ändert sich im selben PR wie der Code, und ein Agent (Claude Code) schreibt sie mit. |
| KI-Zugang | `llms.txt`, Markdown pro Seite, Docs-MCP-Endpunkt, alles eingebaut; optional Ask AI | Nutzer können unsere Doku direkt in Claude Code, Cursor usw. einbinden. |
| API-Referenz, öffentlich | `fumadocs-openapi` liest `openapi.json` (aus `apps/web` generiert und eingecheckt) | Gleiches Design wie die Guides. Die API ist ein Abschnitt der Doku, nicht eine eigene Seite. |
| API-Referenz, pro Instanz | **Scalar API Reference** (Open Source) unter `/api/docs` in `apps/web` | Jede self-hosted Instanz hat ihre versionsgenaue Referenz mit API-Client. Kosten: 0 $. |
| Screenshots | Playwright gegen Storybook oder die Demo-Instanz, als Skript in `apps/docs` | Screenshots der Admin-Oberfläche veralten nicht. Das passt zu einem Playwright-Produkt. |

**Warum ein eigenes App und nicht `/docs` in `apps/website`?** Die Website ist ein Payload-CMS mit Catch-all-Route
`[[...slug]]`. Fumadocs dort einzubauen ist möglich, koppelt die Doku aber an CMS-Build und CMS-Deployment. Ein eigenes
`apps/docs` ist leichter zu bauen, zu cachen und zu deployen. Es kann trotzdem unter derselben Domain erscheinen, z. B.
per Rewrite `website.com/docs/*` → `apps/docs`. Alternativ bekommt es eine Subdomain `docs.…`.

**Hosting, kostenlos und mit eigener Domain:**

1. **Vercel**, wie `apps/web`. Einfachster Weg, und Preview pro PR ist inklusive.
   - Achtung: Der Hobby-Tarif ist laut Vercel-Bedingungen **nur für nicht-kommerzielle Nutzung**.
   - Solange das Projekt ein privates MIT-Open-Source-Projekt ist, passt das.
   - Wird es kommerziell (etwa über denkwerk), braucht es Vercel Pro oder eine der Alternativen.
2. **Cloudflare Workers** (über OpenNext) oder **Netlify**: kostenlos auch kommerziell, eigene Domain, voller
   Funktionsumfang inklusive MCP-Endpunkt.
3. **Statischer Export** auf GitHub Pages oder Cloudflare Pages: kostenlos, eigene Domain.
   - `llms.txt` und die `.md`-Dateien werden beim Build erzeugt.
   - Nur der MCP-Endpunkt und Ask AI brauchen einen Server. Das ließe sich über die App-Instanz lösen oder später
     nachrüsten.

**Was wir selbst bauen müssten:**

- das Theme auf Basis von `packages/ui`
- Versionierung, falls gewünscht (Ordner pro Major-Version oder Deployment pro Release)
- das Screenshot-Skript
- die CI-Anbindung der `openapi.json`

Das alles ist überschaubar und gut für Agenten geeignet.

**Risiken:**

- Fumadocs ist im Kern ein Projekt eines kleinen Teams. Es ist aber weit verbreitet (über 10.000 GitHub-Sterne), und
  die Inhalte sind Standard-MDX. Ein Umzug zu Nextra, Docusaurus oder Mintlify bliebe machbar.
- Ohne eingebaute Versionierung müssen wir früh festlegen, wie ältere Versionen dokumentiert werden (Vorschlag: nur
  die aktuelle Version, dazu Changelog und Upgrade-Guides).

**Entscheidung E4 (neu):** Fumadocs in `apps/docs` + Scalar pro Instanz *(Empfehlung)* · Docusaurus (wenn
Versionierung Pflicht ist) · Starlight (wenn Astro in Ordnung ist) · Mintlify Starter (wenn wir nichts selbst
betreiben wollen).

### Proof of Concept (etwa 1–2 Tage, mit Agent)

1. **API:**
   - `apps/web`: Hono-Catch-all unter `/api/v1` mit `GET /me` und `GET …/runs`
   - Auth-Middleware auf den bestehenden `Principal`, Fehler als Problem Details
   - `openapi.json`-Route und Scalar unter `/api/docs`
   - Prüfen: zod-4-Schemas aus `packages/protocol` laufen durch `@hono/zod-openapi`, und `api.request()` funktioniert
     in Vitest.
2. **Doku:**
   - `apps/docs` mit Fumadocs
   - Theme aus `packages/ui`
   - drei Seiten: Überblick, Deployment, Admin-Oberfläche mit einem Playwright-Screenshot
   - der Abschnitt „REST API“ aus der `openapi.json` von Schritt 1
   - Prüfen: `llms.txt`, `.md`-Routen und der MCP-Endpunkt in Claude Code
3. **Deployment:** Preview auf dem gewählten Hosting mit eigener Subdomain.

---

## 7. Automatisierung (unabhängig von den Optionen)

Der Kern: **Die Spezifikation ist ein Build-Artefakt, und CI behandelt sie wie Code.**

| Schritt | Werkzeug | Wann |
|---|---|---|
| Spec erzeugen (`nub run api:spec`) und prüfen, dass die eingecheckte `docs/openapi.json` aktuell ist | eigenes Skript (wie `mcp:docs`, das bereits einen Test gegen Drift hat) | jeder PR |
| Spec linten: Beschreibungen, Beispiele, `operationId`, Fehlerantworten vorhanden | Redocly CLI oder Spectral mit eigenem Regelset | jeder PR |
| **Breaking-Change-Check** gegen `main` | `oasdiff breaking` (schlägt bei entfernten Feldern oder neuen Pflichtparametern fehl, außer bei Label `api-breaking`) | jeder PR |
| Contract-Tests: echte Antworten gegen die Spec validieren | Integrationstests (`test:integration`) validieren jede Antwort mit dem Response-Schema; optional Schemathesis für Fuzzing | CI |
| Changelog der API | `oasdiff changelog` im semantic-release-Schritt, als Abschnitt der Release Notes | Release |
| TS-Client generieren und veröffentlichen (optional) | `@hey-api/openapi-ts` → `packages/api-client` | Release |
| Doku deployen | Scalar: mit der App. Fumadocs: `apps/docs` über Turborepo, Preview pro PR über das Hosting | Release |
| `llms.txt` / Markdown | durch Plattform (Mintlify, Fumadocs) oder als eigene Route | Build |

Semantic-release passt dazu:

- neue Endpunkte als `feat(api)`
- Breaking Changes nur mit `/v2`, das eine Übergangszeit parallel zu `/v1` läuft
- abgekündigte Endpunkte bekommen `deprecated: true` in der Spezifikation und die Header `Deprecation` und `Sunset`

---

## 8. Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **0: Fundament** | Domänenlogik aus `lib/mcp/tools/*` in eine transport-neutrale Schicht `lib/api/` heben (Query + DTO + Schemas); MCP-Tools darauf umstellen, Verhalten unverändert. oRPC- bzw. Hono-Handler unter `/api/v1` (je nach E3), Fehlerformat (E1), Auth-Wrapper, Rate-Limit mit `RateLimit-*`-Headern, Spec-Generator, CI-Checks. | Ein Endpunkt `GET /api/v1/me` live, Spec und Scalar unter `/api/docs` |
| **1: Lese-Kern** | Endpunkte aus Abschnitt 4, Phase 1. Guides: Quickstart, Auth, Pagination, Fehler, Rate Limits. PAT-UI um den Hinweis „auch für REST“ ergänzen. | v1.0 der öffentlichen API |
| **2: Diagnose und Integration** | Endpunkte aus Phase 2, Markdown-Antworten, Export, SSE mit Bearer-Auth, Badges. Rezept-Guides (GitHub Actions PR-Check, Slack, Grafana). Ingest-Protokoll dokumentieren. Öffentliches Doku-Portal `apps/docs` (E4). | v1.1 |
| **3: Schreiben und Webhooks** | Scope `write` für PATs (und OAuth), Webhooks nach Standard Webhooks mit Delivery-Log und Retries, Run löschen und taggen, Token- und Projekt-Verwaltung. | v1.2 |
| **später** | SDKs (Option 5), PDF-Berichte, Admin-Endpunkte (Retention, Speicher) | nach Bedarf |

---

## 9. Entscheidungen auf einen Blick

| # | Frage | Optionen | Empfehlung |
|---|---|---|---|
| E1 | Fehler- und Antwortformat | (a) RFC 9457 Problem Details + schlanke Erfolgsantworten · (b) Envelope `{success,data,error}` wie Testdino | (a) |
| E2 | Pfadschema | (a) Slugs `/projects/acme/web/runs/128`, UUID zusätzlich · (b) nur UUIDs | (a) |
| E3 | Implementierung und Spec-Quelle | oRPC v2 (gepinnt) · Hono + `@hono/zod-openapi` · oRPC v1.15 · zod + einzelne Route Handler | oRPC v2 mit Leitplanken, falls Contract-Ansatz gewünscht, sonst Hono (siehe Abschnitt 5) |
| E4 | Doku | Fumadocs in `apps/docs` + Scalar pro Instanz · Docusaurus · Starlight · Mintlify Starter | Fumadocs + Scalar pro Instanz (siehe Abschnitt 6) |
| E5 | Umfang v1.0 | nur Phase 1 · Phase 1 + Diagnose aus Phase 2 | Phase 1, Diagnose direkt danach |

## 10. Offene Fragen

1. **Zielgruppe:** Sind die Hauptnutzer eigene Teams (Skripte, CI) oder Dritte (Integrationen, Partner)? Bei Dritten
   gewinnen öffentliches Portal, SDKs und Stabilität deutlich an Gewicht.
2. **Token-Scopes:** Reicht `read`/`write`, oder wollen wir feinere Scopes (`runs:read`, `webhooks:write`) wie Testdino?
   Feinere Scopes sind später schwer nachzurüsten, ohne bestehende Tokens zu brechen.
3. **Rate Limits:** Teilen sich REST und MCP ein Budget pro Credential (heute 120/min für MCP), oder getrennte Budgets?
4. **Öffentliche Endpunkte ohne Token** (Badges, öffentliche Projekte): gewünscht?
5. **Ingest dokumentieren:** Wollen wir fremde Reporter (andere Sprachen, andere Test-Runner) aktiv unterstützen? Dann
   wird das Ingest-Protokoll ein öffentlicher Vertrag mit eigener Stabilitätszusage.
6. **Demo-Instanz:** Soll die Live-Demo einen read-only Demo-Token anbieten, damit der Playground in der Doku sofort
   echte Daten zeigt? Testdino hat das nicht, es wäre ein spürbarer Vorteil beim Evaluieren.

---

## 11. Entscheidungen vom 2026-09-25 und Umsetzungsplan

**Entschieden:**

- **E3:** oRPC v2, exakt gepinnt (`2.0.0-beta.40`), mit den Leitplanken aus Abschnitt 5.
- **E4:** Fumadocs als eigenes App `apps/docs`. Kein Scalar: Jede Instanz liefert nur die Spezifikation als JSON
  unter `/api/v1/openapi.json` aus. Die API-Referenz rendert ausschließlich Fumadocs (`fumadocs-openapi`).
- **E1:** Fehler als Problem Details (RFC 9457).
- **E2:** Slugs im Pfad.
- **TanStack Query** kommt für die Daten, die Client-Komponenten nachladen.
  - Vorlage ist der oRPC-Beitrag „Next.js SSR with oRPC and TanStack Query“ (orpc.dev/blog, 19.08.2026).
  - Transport ist oRPC `RPCHandler`, der Client ist `createTanstackQueryUtils`.
  - Ein `QueryClient` mit `RPCJsonSerializer` sorgt dafür, dass `Date`s ohne eigenes „reviveDates“ ankommen.

### Architektur: zwei Handler, eine Domänenschicht

| | Öffentliche REST-API | Interne RPC-API der App |
|---|---|---|
| Pfad | `/api/v1/*` (`OpenAPIHandler`) | `/api/rpc/*` (`RPCHandler`) |
| Auth | Bearer: Personal Access Token oder OAuth-Token, Scope `read` | Better-Auth-Session (Cookie) |
| Vertrag | stabil, versioniert, OpenAPI 3.1, in CI auf Breaking Changes geprüft | intern, darf sich mit der UI ändern, typsicher über `RouterClient` |
| Nutzer | Skripte, CI, Integrationen | Client-Komponenten über TanStack Query |
| Router | `apps/web/lib/api/v1/*` | `apps/web/lib/rpc/*` |

Beide Handler nutzen denselben Zugriff (`Principal`, `resolveProjectFor`) und dieselben Queries. Die REST-Prozeduren
verpacken die **vorhandenen MCP-Tool-Handler** über einen Adapter:

- Das zod-Input des Tools wird zu Pfad- und Query-Parametern.
- Das Output-Schema des Tools wird zur Antwort.
- Ein `ToolError` wird zu Problem Details mit HTTP-Status.

Damit gibt es die Logik genau einmal. REST und MCP können nicht auseinanderlaufen.

### Schritte (je ein Commit oder mehrere)

1. **oRPC-Grundlage:**
   - Pakete gepinnt
   - Kontext, Auth-Middleware (Bearer und Session), Rate-Limit (Tabelle `rate_limits`)
   - Fehler-Mapping auf Problem Details
2. **REST v1:**
   - Endpunkte aus Abschnitt 4, Phase 1, soweit es MCP-Tools gibt, dazu Phase 2 (Diagnose)
   - `me`, `teams`, `projects`
   - `/api/v1/openapi.json` (reines JSON, ohne Referenz-UI in der App)
   - generierte `docs/openapi.json` mit Test gegen Drift
   - Integrationstests
3. **Interne RPC und TanStack Query:**
   - Prozeduren für die heutigen JSON-UI-Routen: `runs/items`, `runs/:id/results`, `runs/:id/summary`,
     `tests/:id/overview`
   - `QueryClientProvider` im Root-Layout
   - Explorer-Drawer auf `useQuery`
   - Live-Nachladen über `queryClient.fetchQuery`, das die eigene Request-Deduplizierung ersetzt
   - die alten Route Handler entfernen
   - Die SSE-Streams (`live`, `events`) bleiben Route Handler. Sie sind auf `Last-Event-ID`, Polling-Fallback und die
     300-s-Grenze von Vercel abgestimmt. Ein Umzug auf oRPC-Event-Iteratoren ist ein eigener Schritt.
4. **Doku `apps/docs`:**
   - Fumadocs mit Next.js 16 und Tailwind 4
   - Tokens aus `packages/ui`
   - Seiten: Überblick, Schnellstart, Deployment, Konfiguration, Administration, Reporter, MCP, REST-API-Guides
   - API-Referenz aus `apps/web/docs/openapi.json` über `fumadocs-openapi`
   - `llms.txt`, `llms-full.txt`, Markdown pro Seite
5. **CI:** Breaking-Change-Check der Spezifikation (`oasdiff`) gegen `main`.
6. **README und AGENTS.md** um REST-API, RPC-Muster und Doku-App ergänzen.

**Bewusst nicht in diesem Schritt**, jeweils ein eigener PR:

- Schreib-Endpunkte und Scope `write`, Webhooks (Phase 3)
- Badges, JUnit/CSV-Export, Branches und PRs als REST-Ressourcen
- Markdown-Antworten per `Accept`
- Umzug der SSE-Streams auf oRPC
- Deployment der Doku-Seite (Domain und Hosting richtet ihr ein)

### Stand der Umsetzung (2026-09-25)

| Schritt | Stand |
| --- | --- |
| 1. oRPC-Grundlage | ✅ `apps/web/lib/api/{base,auth,errors,from-tool,handler}.ts`, oRPC `2.0.0-beta.40` exakt gepinnt |
| 2. REST v1 | ✅ 17 Endpunkte unter `/api/v1`, `/api/v1/openapi.json`, `docs/openapi.json` mit Drift-Test, Integrationstests |
| 3. Interne RPC und TanStack Query | ✅ `/api/rpc` mit `runs.items`, `runs.results`, `runs.summary`, `tests.overview`; Explorer-Drawer auf `useQuery`, Live-Nachladen über `fetchQuery`; die vier alten Route Handler sind entfernt |
| 4. Doku `apps/docs` | ✅ Fumadocs mit Guides, API-Referenz aus `docs/openapi.json`, `llms.txt`, Markdown pro Seite, Docs-MCP unter `/api/mcp` |
| 5. CI | ✅ Job „REST API contract“ (`oasdiff breaking`) gegen den Basis-Branch; greift ab dem ersten PR, nach dem `main` die Datei hat |
| 6. README und AGENTS.md | ✅ |

Abweichungen vom Plan:

- **Kein Scalar**, auf Wunsch. Die Instanz liefert nur `/api/v1/openapi.json` aus, die Referenz rendert
  `fumadocs-openapi` mit dem eigenen Playground. `fumadocs-openapi` bringt zwei kleine Parser-Bibliotheken von Scalar als
  interne Abhängigkeiten mit (`@scalar/json-magic`, `@scalar/openapi-upgrader`). Die optionale UI
  `@scalar/api-client-react` ist nicht installiert.
- **OAuth-Tokens** gelten nur für MCP (Audience-Bindung nach RFC 8707). Die REST-API nimmt Personal Access Tokens.
- **Das Rate-Limit** teilt sich eine Token-Quote mit MCP (`MCP_RATE_LIMIT_PER_MINUTE`).
- **Deployment der Doku-Seite** steht noch aus. Beim Hosting auf Vercel gilt: Hobby ist nur für nicht-kommerzielle
  Nutzung erlaubt (siehe Abschnitt 6).
