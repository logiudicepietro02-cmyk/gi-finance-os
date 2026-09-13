# GI FINANCE OS — Product Spec (MVP)

> Il copilota operativo del consulente finanziario.

## 1. Problema

Il consulente di G.I. Finance segue PMI su pianificazione finanziaria, rapporti bancari, merito creditizio e operazioni di finanziamento. Oggi la maggior parte del tempo va in lavoro operativo: leggere bilanci, ricopiare numeri in Excel, ricalcolare indici, inseguire documenti per le pratiche bancarie, ricordarsi scadenze, preparare gli incontri.

## 2. Obiettivo

Un **cockpit** che ogni mattina dice al consulente *dove il suo giudizio crea valore*, e che toglie lavoro manuale:

1. entra al mattino → vede cosa richiede attenzione;
2. apre un cliente → Company 360;
3. carica un bilancio → i dati vengono estratti automaticamente, con riferimento alla fonte;
4. vede KPI e ratios (calcolati in modo deterministico, con formula);
5. capisce cosa è cambiato (variazioni YoY, alert);
6. vede operazioni e documenti mancanti;
7. chiede all'AI un'analisi (copilot con tool interni);
8. ottiene un briefing pronto per l'incontro, con fonti;
9. trasforma le conclusioni in task.

## 3. Utenti e ruoli

| Ruolo | Chi | Può |
|---|---|---|
| **Owner** | Partner / responsabile studio | Tutto, incluse impostazioni organizzazione, soglie, utenti, eliminazioni |
| **Advisor** | Consulente senior | Gestione clienti, operazioni, approvazione dati estratti e proposte AI, audit |
| **Analyst** | Analista | Caricare/analizzare documenti, task, usare il copilot; non approva dati finanziari né modifica operazioni |

Ogni utente vede **solo** i dati della propria organization (multi-tenant per `organizationId`).

## 4. Moduli MVP

| # | Modulo | Contenuto |
|---|---|---|
| A | Dashboard | Oggi (task, scadenze, operazioni, documenti da verificare, alert, clienti che richiedono attenzione) + AI Briefing |
| B | Companies | Anagrafica, Company 360 (overview, snapshot, trend, finanziamenti, documenti, task, timeline) |
| C | Documents | Upload PDF, viewer, classificazione, associazione azienda, pipeline di analisi |
| D | Financial Analysis | KPI cards, trend 3 anni, tabella ratios con formula, interpretazione AI |
| E | Financing Operations | Pipeline operazioni, checklist documentale, task, timeline, AI summary |
| F | Tasks | Task con priorità/stato/scadenza, viste Oggi / 7 giorni / Overdue / Waiting |
| G | AI Copilot | Chat contestuale all'azienda, tool interni autorizzati e tracciati, briefing cliente, next best action |
| H | Activity / Audit | Log di ogni azione utente, AI e di sistema |

P1 incluso: ricerca globale e command palette (Ctrl/Cmd+K), timeline attività.

## 5. Fuori scope MVP

Client portal, billing, marketplace, workflow builder, agenti autonomi, integrazioni bancarie/email/calendario reali, finanza agevolata completa, mobile app, microservizi. L'architettura lascia i punti di estensione (vedi `architecture.md`).

## 6. Principi non negoziabili

- **I numeri li calcola il codice, non l'LLM.** Il financial engine è deterministico e testato. Se un input manca: “Dato non disponibile”, mai un valore inventato.
- **Tracciabilità.** Ogni dato estratto conserva documento, pagina e testo sorgente. Ogni ratio mostra formula e input.
- **L'AI distingue** dato / calcolo / interpretazione / ipotesi.
- **Alert deterministici.** Le regole generano gli alert; l'AI può solo interpretarli e suggerire azioni.
- **Governance.**
  - AI autonoma: classificazione, estrazione, sintesi, analisi, suggerimenti.
  - Richiede approvazione umana: modifica di dati finanziari già verificati, creazione di task ad alta priorità, qualsiasi comunicazione esterna o azione con impatto sul cliente.
  - Nessun invio email automatico.
- **Nessuna AI simulata in prodotto.** Se nessun provider AI è configurato, le funzioni AI lo dichiarano esplicitamente; la pipeline documentale continua a funzionare con l'estrattore a regole (dichiarato come tale).

## 7. Decisioni su punti ambigui (scelta più semplice, documentata)

| Tema | Decisione |
|---|---|
| Autenticazione | Sessioni server-side su Postgres (cookie httpOnly, token hashato, bcrypt). Equivalente a Supabase Auth per l'MVP, zero dipendenze esterne; sostituibile dietro `lib/auth`. |
| Database locale | Postgres reale. Se non disponibile (niente Docker), `npm run db:start` avvia un Postgres embedded (binari ufficiali via `embedded-postgres`). Qualsiasi `DATABASE_URL` Postgres funziona (Supabase, Neon, Docker). |
| Storage | Driver `local` (cartella `storage/`) di default, driver `s3` (S3-compatible, incl. Supabase Storage S3) via env. |
| Estrazione senza AI | Estrattore a regole per bilanci in schema CEE (art. 2424/2425 c.c.) — deterministico, marcato `RULES`. Con AI configurata si usa l'LLM con output JSON validato da schema, e le regole fanno da controllo incrociato. |
| Dati estratti vs approvazione | Il primo bilancio di un anno viene salvato come `EXTRACTED` (visibile, badge “Da verificare”). Se esiste già un bilancio **verificato** per lo stesso anno, l'estrazione non lo sovrascrive: resta proposta in attesa di approvazione. |
| DSCR | DSCR semplificato = EBITDA / (Oneri finanziari + Quota capitale annua). Formula mostrata in UI. |
| PFN | PFN = Debiti finanziari − Disponibilità liquide. Positiva = indebitamento netto. |
| Creazione task da AI | Priorità Low/Medium: creata direttamente (marcata come creata da AI). High/Critical: richiesta di approvazione. |
| Briefing dashboard | Elenco “richiede attenzione” calcolato deterministicamente (sempre disponibile); sintesi narrativa AI generata una volta al giorno se il provider è configurato. |
| Elaborazione documenti | Sincrona nella richiesta HTTP (con avanzamento per step) tramite `workers/document-processor.ts`, pronta per essere spostata su una coda. |
| Provider di test | `AI_PROVIDER=scripted` esiste solo per i test E2E, richiede `ALLOW_SCRIPTED_AI=1`, è bloccato in produzione ed è etichettato in UI. |

## 8. Criterio di successo

Il flusso del §2 funziona end-to-end su dati di seed realistici, senza passaggi manuali fuori dall'app, ed è coperto da un test E2E.
