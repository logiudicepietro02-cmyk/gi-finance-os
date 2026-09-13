# Architettura

## Stack

| Livello | Scelta |
|---|---|
| App | Next.js 16 (App Router, Server Components, Route Handlers), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui (Radix), lucide-react, Recharts, cmdk |
| DB | PostgreSQL + Prisma ORM 7 (`prisma-client` generator, `@prisma/adapter-pg`) |
| Auth | Sessioni DB + cookie httpOnly, bcryptjs |
| Storage | Driver `local` / `s3` (S3-compatible) |
| AI | `AIProvider` → Anthropic (`@anthropic-ai/sdk`), OpenAI (`openai`) |
| PDF | `unpdf` (estrazione testo), `pdf-lib` (generazione PDF di seed/test) |
| Validazione | Zod 4 |
| Test | Vitest (unit + integrazione DB), Playwright (API + E2E) |

## Modular monolith

Un solo deployable. I confini sono **cartelle con responsabilità precise**, non servizi di rete.

```
app/                    Route (UI) e Route Handlers (/api)
  (auth)/login          Login
  (app)/dashboard       Cockpit
  (app)/companies       Lista + Company 360 (/companies/[id])
  (app)/documents       Documenti + viewer
  (app)/operations      Operazioni finanziarie
  (app)/tasks           Task
  (app)/ai              Copilot full-page
  (app)/activity        Audit log
  (app)/settings        Organizzazione, soglie, utenti, provider AI
  api/                  JSON API (tutte autenticate e org-scoped)
components/             UI (ui/ = shadcn primitives, feature components per modulo)
lib/
  db/                   Prisma client singleton
  auth/                 Sessioni, password, getSession/requireUser
  permissions/          RBAC (matrice ruolo → permessi)
  financial/            Financial engine PURO (ratios, variazioni, formattazione)
  alerts/               Regole alert PURE
  documents/            Estrazione testo, classificazione, schema estrazione, parser a regole, validazione
  ai/                   AIProvider, provider Anthropic/OpenAI/scripted, tool registry, prompt
  storage/              Driver storage
  audit/                Scrittura audit log
  validation/           Schemi Zod condivisi per le API
services/               Casi d'uso org-scoped (companies, documents, financials, operations, tasks, alerts, insights, copilot, briefing, search, audit)
workers/                Pipeline asincrone (document-processor) — oggi invocate in-process
prisma/                 schema, migrations, seed
tests/                  unit, integration (Vitest)
e2e/                    Playwright (API + flusso E2E)
docs/
```

### Regole di dipendenza

```
app (pages, api)  →  services  →  lib/*  →  lib/db
                         ↑
                     workers
```

- `lib/financial`, `lib/alerts`, `lib/documents/rules-*`, `lib/permissions` sono **puri** (nessun I/O) → testabili in isolamento.
- `services/*` e `workers/*` sono il modo normale per parlare con il DB. Ogni funzione di servizio riceve un `ServiceContext { userId, organizationId, role }` e filtra **sempre** per `organizationId`.
- Eccezione deliberata: i tool di lettura dell'AI (`lib/ai/tools`) interrogano il DB direttamente (stesso pattern `where: { ..., organizationId }` dei servizi) invece di passare da `services/*`, perché espongono dati in una forma (schema Zod per il modello) diversa da quella delle viste UI. Restano comunque autorizzati via RBAC, org-scoped e tracciati in audit ad ogni chiamata (vedi `executeTool` in `lib/ai/tools/index.ts`); le mutazioni (es. `create_task`) passano invece dai servizi come tutto il resto.

## Request flow

1. `proxy.ts` (ex middleware in Next 16): redirect ottimistico a `/login` se manca il cookie di sessione.
2. Pagina / Route Handler: `requireUser()` valida la sessione su DB (controllo autoritativo) e costruisce il `ServiceContext`.
3. `authorize(ctx, permission)` verifica il ruolo.
4. Il servizio esegue query org-scoped; le mutazioni scrivono `AuditLog`.
5. Le risorse di un'altra org risultano **404** (non 403) per non rivelarne l'esistenza.

## Multi-tenancy e sicurezza

- Tutte le entità di dominio hanno `organizationId` (denormalizzato anche sulle entità figlie per query e isolamento semplici).
- Lookup per id sempre con `where: { id, organizationId }`.
- Token di sessione: 32 byte random, nel DB solo lo SHA-256; cookie `httpOnly`, `sameSite=lax`, `secure` in produzione; scadenza 7 giorni con rinnovo.
- Password: bcrypt (cost 12). Rate limiting di login in-memory (per MVP single instance).
- Upload: solo `application/pdf`, dimensione massima configurabile, nome file sanificato, path generati lato server.
- Segreti solo via env (`.env.example`); nessuna chiave nel repo.

## Document pipeline

`workers/document-processor.ts` — step idempotenti, ognuno registrato in `Document.processingLog`:

```
EXTRACT_TEXT  (unpdf, per pagina → DocumentChunk)
CLASSIFY      (regole + AI se configurata)
EXTRACT_DATA  (AI structured output | parser a regole CEE)
VALIDATE      (schema Zod + controlli di coerenza contabile)
SAVE          (DocumentExtraction con fonti per campo)
UPDATE        (FinancialStatement EXTRACTED | proposta se esiste VERIFIED)
METRICS       (financial engine → FinancialMetric)
ALERTS        (alert engine sull'azienda)
INSIGHTS      (variazioni deterministiche + insight AI opzionale)
```

Per scalare: sostituire l'invocazione diretta con una coda (pg-boss / BullMQ) — l'interfaccia `processDocument(ctx, documentId)` non cambia.

## AI layer

```
AIProvider (interfaccia)
 ├── AnthropicProvider   (claude-opus-5 di default, adaptive thinking, streaming + finalMessage)
 ├── OpenAIProvider
 └── ScriptedProvider    (solo test, bloccato in produzione)
```

Capacità: `generateText`, `generateObject` (JSON validato con Zod), `runWithTools` (loop tool-use gestito dal nostro codice per poter autorizzare e tracciare ogni chiamata).

Ogni invocazione crea un `AIRun` (kind, provider, model, input, output, token, durata, esito). Ogni tool call crea un `AuditLog` con `actorType=AI`.

Tool disponibili: `get_company`, `get_company_financials`, `get_company_documents`, `get_company_operations`, `get_company_tasks`, `get_company_alerts`, `calculate_financial_ratio`, `search_company_knowledge`, `create_task`. Ciascuno: input schema, output schema, permesso richiesto, audit.

## Alert engine

Regole pure in `lib/alerts/rules.ts` → candidati con `dedupeKey`. `services/alerts.ts` sincronizza: crea gli alert nuovi, aggiorna quelli esistenti, risolve automaticamente quelli la cui condizione non vale più. Eseguito dopo ogni mutazione rilevante e al caricamento della dashboard (throttling 10 minuti).

## Punti di estensione (post-MVP)

| Futuro | Dove si innesta |
|---|---|
| Coda job | `workers/*` |
| Email / calendario | nuovo servizio + `ApprovalRequest` (le comunicazioni esterne passano sempre da approvazione) |
| Open banking | nuovo modulo `services/banking` che alimenta `FinancingOperation` / `FinancialStatement` |
| Client portal | nuove route con ruolo esterno; il modello org/company è già pronto |
| Supabase Auth | implementare `lib/auth` con Supabase mantenendo `requireUser()` |
| Vector search | `DocumentChunk` è già la tabella giusta per aggiungere embeddings (pgvector) |
