# GI FINANCE OS

> Il copilota operativo del consulente finanziario.

MVP per **G.I. Finance**: un cockpit che ogni mattina mostra al consulente dove serve il suo giudizio, legge i bilanci in automatico, calcola indicatori deterministici con formula e fonte, gestisce operazioni, documenti e task, e offre un copilot AI che usa solo strumenti interni autorizzati e tracciati.

```
entra al mattino → vede cosa richiede attenzione → apre un cliente → carica un bilancio
→ dati estratti automaticamente → KPI e ratios → cosa è cambiato → operazioni e documenti mancanti
→ chiede un'analisi all'AI → briefing pronto per l'incontro → conclusioni trasformate in task
```

## Indice

- [Funzionalità](#funzionalità)
- [Avvio rapido](#avvio-rapido)
- [Variabili d'ambiente](#variabili-dambiente)
- [Database, migrazioni e seed](#database-migrazioni-e-seed)
- [Provider AI](#provider-ai)
- [Test](#test)
- [Struttura](#struttura)
- [Documentazione](#documentazione)

## Funzionalità

| Modulo | Cosa fa |
|---|---|
| **Dashboard** | Task oggi / 7 giorni / scaduti / in attesa, operazioni in corso, documenti da verificare, alert, aziende che richiedono attenzione (ranking deterministico) + sintesi AI giornaliera |
| **Company 360** | Anagrafica, snapshot finanziario, trend 3 anni, finanziamenti, documenti, task, timeline, briefing |
| **Documenti** | Upload PDF, viewer, classificazione, associazione azienda (anche automatica via P.IVA), pipeline di analisi con avanzamento per step, revisione e approvazione dei dati estratti |
| **Analisi finanziaria** | KPI, grafici, tabella ratios con formula e input al click, fonte (documento/pagina/testo) di ogni valore, interpretazione AI (dato / calcolo / interpretazione / ipotesi) |
| **Operazioni** | Pipeline Lead → Completed/Rejected, condizioni, checklist documentale (richieste, scadenze, task, collegamento/upload documenti), AI summary con documenti mancanti |
| **Task** | Priorità, stato, scadenza, assegnatario, viste operative |
| **Alert engine** | Regole deterministiche: DSCR sotto soglia, PFN/EBITDA sopra soglia, scadenze finanziamenti, documenti obbligatori mancanti, task scaduti; next best action AI su richiesta |
| **AI Copilot** | Chat contestuale all'azienda con 9 tool interni (schema, autorizzazione, audit), client briefing con fonti |
| **Governance e audit** | Approvazioni per azioni AI sensibili, registro attività di utenti/AI/sistema, log di ogni esecuzione AI |
| **Ricerca e Ctrl/Cmd+K** | Command palette con ricerca globale, azioni rapide e scorciatoie `G` + `D/C/O/F/T/A/L/S` |

## Avvio rapido

Requisiti: **Node.js ≥ 22** (testato con 24), npm. PostgreSQL non è obbligatorio: se non lo hai, lo avvia `npm run db:start`.

```bash
npm install
```

```bash
cp .env.example .env
```

In un terminale dedicato (lascialo aperto):

```bash
npm run db:start
```

Poi:

```bash
npm run setup
```

```bash
npm run dev
```

Apri http://localhost:3000 e accedi con uno degli utenti dimostrativi (password `GiFinance2026!`):

| Ruolo | Email |
|---|---|
| Owner | giulia.ferri@gifinance.demo |
| Advisor | marco.bellini@gifinance.demo |
| Analyst | sara.colombo@gifinance.demo |
| Altra organizzazione (verifica isolamento) | luca.neri@studioesempio.demo |

Tutti i dati (aziende, persone, banche, numeri) sono **fittizi**.

> Senza chiave AI l'app è pienamente utilizzabile: la pipeline documentale usa l'estrattore a regole per bilanci in schema CEE, indicatori e alert sono deterministici. Le funzioni AI (copilot, interpretazione, briefing, next best action) dichiarano esplicitamente di non essere configurate.

Dettagli, alternative (Docker, Supabase) e troubleshooting: [docs/setup.md](docs/setup.md).

## Variabili d'ambiente

Tutte in [.env.example](.env.example). Nessun segreto nel repository.

| Variabile | Default | Descrizione |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:54329/gi_finance_os` | Database applicativo |
| `TEST_DATABASE_URL` | `…/gi_finance_os_test` | Database per i test di integrazione |
| `E2E_DATABASE_URL` | `…/gi_finance_os_e2e` | Database per Playwright |
| `PG_DATA_DIR` | `~/.gi-finance-os/postgres` | Dati del Postgres embedded (tienili fuori da cartelle sincronizzate) |
| `APP_URL` | `http://localhost:3000` | URL pubblico |
| `STORAGE_DRIVER` | `local` | `local` oppure `s3` (S3-compatible, incluso Supabase Storage) |
| `STORAGE_LOCAL_DIR` | `./storage` | Cartella file per il driver locale |
| `MAX_UPLOAD_MB` | `25` | Dimensione massima PDF |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | — | Driver S3 |
| `AI_PROVIDER` | `anthropic` | `anthropic`, `openai` oppure `none` |
| `ANTHROPIC_API_KEY` | — | Chiave Anthropic |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Modello Claude |
| `ANTHROPIC_FALLBACKS` | `default` | Fallback server-side in caso di rifiuto del modello (`off` per disattivarlo) |
| `OPENAI_API_KEY` | — | Chiave OpenAI |
| `OPENAI_MODEL` | `gpt-5` | Modello OpenAI |

## Database, migrazioni e seed

| Comando | Effetto |
|---|---|
| `npm run db:start` | Avvia PostgreSQL locale (binari ufficiali via `embedded-postgres`) e crea i database app/test/e2e |
| `npm run db:deploy` | Applica le migrazioni (`prisma migrate deploy`) |
| `npm run db:migrate` | Crea una nuova migrazione in sviluppo (`prisma migrate dev`) |
| `npm run db:reset` | Ricrea il database da zero |
| `npm run seed` | Rigenera i dati dimostrativi (idempotente: sostituisce solo le organizzazioni demo) |
| `npm run setup` | `db:deploy` + `seed` |
| `npm run db:studio` | Prisma Studio |

Il seed usa i servizi reali dell'applicazione: genera PDF (bilanci CEE, visure, Centrale Rischi, contratto, business plan, situazione contabile), li fa passare dalla **pipeline documentale vera**, approva i bilanci, crea operazioni con checklist, task ed esegue l'alert engine. Risultato: 5 aziende con profili finanziari diversi, 3 esercizi, 22 documenti, 8 operazioni, 16 task, ~10 alert, un bilancio in attesa di verifica.

Schema dati: [prisma/schema.prisma](prisma/schema.prisma) · [docs/data-model.md](docs/data-model.md).

## Provider AI

Livello di astrazione in [lib/ai](lib/ai): l'applicazione dipende dall'interfaccia `AIProvider`, non da un SDK.

```
AIProvider
 ├── AnthropicProvider   (default, claude-opus-5)
 ├── OpenAIProvider
 └── ScriptedProvider    (solo test automatici, bloccato in produzione)
```

- Output strutturati validati con Zod (schema JSON inviato al modello + validazione lato server).
- Il copilot non esegue query libere: usa 9 tool con input/output schema, ciascuno autorizzato via RBAC, filtrato per organizzazione e tracciato in audit log.
- Ogni invocazione è registrata in `AIRun` (provider, modello, input, output, token, durata, esito).
- Con Claude è attivo per default il **fallback server-side** in caso di rifiuto (`ANTHROPIC_FALLBACKS=default`); impostalo a `off` per disattivarlo.

Dettagli su prompt, tool, governance e pipeline: [docs/ai.md](docs/ai.md).

## Test

| Comando | Cosa verifica |
|---|---|
| `npm run test:unit` | Financial engine (tutti i ratios, casi limite, nessun NaN), variazioni, alert rules, RBAC, schema di estrazione, parser a regole, validazione |
| `npm run test:integration` | Su Postgres reale (`TEST_DATABASE_URL`): isolamento tenant su servizi e tool AI, RBAC, pipeline documentale end-to-end su PDF reali, approvazioni, sync alert, copilot e briefing con provider di test |
| `npm run test:e2e` | Playwright: API core (auth, validazione, tenant isolation via HTTP, RBAC, documenti, copilot) e percorso completo del consulente (login → azienda → upload → analisi → dati → ratios → operazione → task → copilot → briefing) |
| `npm run typecheck` · `npm run lint` | TypeScript strict · ESLint |

Prerequisito per integrazione ed E2E: `npm run db:start` attivo. Playwright usa il browser già installato (Edge su Windows, Chrome altrove; `PW_CHANNEL` per cambiarlo), avvia un'istanza isolata su porta 3100 con database e cartella di build dedicati.

## Struttura

```
app/            UI (App Router) e API (/app/api)
components/     UI per modulo + primitive shadcn/ui
lib/            moduli puri e infrastruttura: financial, alerts, documents, ai, auth, permissions, storage, audit, db
services/       casi d'uso org-scoped (unico accesso al DB insieme ai workers)
workers/        pipeline documentale
prisma/         schema, migrazioni, seed
tests/          unit + integration (Vitest)
e2e/            Playwright
docs/           documentazione
```

## Documentazione

- [docs/product-spec.md](docs/product-spec.md) — obiettivi, scope, principi, decisioni sui punti ambigui
- [docs/architecture.md](docs/architecture.md) — modular monolith, flussi, sicurezza, estensibilità
- [docs/data-model.md](docs/data-model.md) — entità e relazioni
- [docs/financial-engine.md](docs/financial-engine.md) — formule, regole alert, estrazione
- [docs/ai.md](docs/ai.md) — provider, tool, prompt, governance
- [docs/setup.md](docs/setup.md) — installazione, alternative, troubleshooting
- [docs/implementation-plan.md](docs/implementation-plan.md) — milestone e stato
