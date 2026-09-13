# Implementation plan

Ogni milestone: implementa → test → fix → verifica UX → aggiorna docs.

## M0 — Fondamenta ✅
- [x] Documentazione: product-spec, architecture, data-model, implementation-plan
- [x] Scaffold Next.js 16 + Tailwind v4 + shadcn/ui (preset radix-nova, tema navy)
- [x] Prisma 7 (`prisma-client` + `@prisma/adapter-pg`) + schema completo + migrazione iniziale
- [x] Postgres locale senza Docker (`npm run db:start`, embedded) + docker-compose alternativo + `.env.example`

## M1 — Piattaforma ✅
- [x] Auth: login/logout, sessioni DB con token hashato, rate limit, `proxy.ts`, `requireUser`
- [x] RBAC Owner/Advisor/Analyst + `ServiceContext` org-scoped (404 cross-tenant)
- [x] Audit log per utenti, AI, sistema
- [x] App shell: sidebar, topbar, Ctrl/Cmd+K, scorciatoie G+lettera

## M2 — Company 360 + Financial engine ✅
- [x] Financial engine deterministico (10 indicatori, MISSING/NOT_MEANINGFUL) + unit test
- [x] Companies CRUD, Company 360 (panoramica, analisi, finanziamenti, documenti, task, timeline, briefing)
- [x] KPI, trend, ratios con formula al click, dati di bilancio con fonte per campo, modifica/verifica

## M3 — Documenti ✅
- [x] Storage local/S3, upload PDF (validazione magic bytes), viewer, download
- [x] Pipeline in 9 step con log persistito e avanzamento live
- [x] Estrattore a regole CEE + derivazioni + validazione + cross-check AI
- [x] Revisione con modifica, approvazione, rifiuto; proposta di modifica per bilanci verificati

## M4 — Operatività ✅
- [x] Operazioni: pipeline board + elenco, dettaglio, checklist da template per tipo con auto-collegamento documenti
- [x] Checklist: crea richiesta, scadenza, stato, collega/carica documento, assegna task
- [x] Task con viste oggi / 7 giorni / scaduti / in attesa / aperti / completati
- [x] Alert engine (5 regole) con sync, dedupe, auto-risoluzione + unit/integration test
- [x] Dashboard operativa con ranking “richiede attenzione”

## M5 — AI ✅
- [x] AIProvider (Anthropic, OpenAI, provider di test) + AIRun
- [x] 9 tool con input/output schema, permesso, audit
- [x] Copilot contestuale (sheet in Company 360 + pagina dedicata con conversazioni)
- [x] Interpretazione finanziaria, client briefing con fonti, next best action, sintesi operazione, briefing giornaliero automatico
- [x] ApprovalRequest per task ad alta priorità e modifiche a dati verificati

## M6 — P1 ✅
- [x] Ricerca globale e command palette con azioni
- [x] Attività (registro + esecuzioni AI con input/output), approvazioni, impostazioni (soglie, utenti, stato AI)

## M7 — Qualità e consegna ✅
- [x] Seed realistico tramite servizi reali e pipeline vera (5 aziende, 3 esercizi, 22 documenti PDF, 8 operazioni, 16 task, ~10 alert, 2 organizzazioni)
- [x] Test unit (75), integration (17), Playwright API + flusso E2E completo
- [x] README, setup, ai, financial-engine

## Decisioni rispetto alla spec

| Spec | Scelta | Motivo |
|---|---|---|
| Supabase Auth o equivalente | Sessioni DB proprie | Zero dipendenze esterne per l'MVP locale; `lib/auth` isola l'implementazione |
| AI simulata vietata | Provider di test solo per E2E | Verificare il flusso completo senza chiavi; bloccato in produzione e dichiarato in UI |
| Elaborazione asincrona | Sincrona con log per step e polling | Semplicità e affidabilità; entry point pronto per una coda |
| Situazione contabile | Estratta ma non applicata al bilancio annuale | Evita di confondere dati infrannuali con l'esercizio |
| Ricerca full-text | Postgres `to_tsvector('italian')` senza indice dedicato | Volumi MVP; indice GIN o pgvector aggiungibili senza cambiare le API |

## Prossimi passi suggeriti (post-MVP)

- Coda job (pg-boss) per pipeline e AI in background; notifiche in-app.
- Indice GIN sul testo e embeddings (pgvector) per `search_company_knowledge`.
- OCR locale per scansioni senza AI.
- Import XBRL dei bilanci depositati.
- Dati Centrale Rischi strutturati e integrazione open banking.
- Rate limiting distribuito e sessioni su Redis per deploy multi-istanza.
