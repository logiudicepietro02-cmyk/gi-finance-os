# AI

Codice: [lib/ai](../lib/ai) · casi d'uso: [services/copilot.ts](../services/copilot.ts), [services/ai-analysis.ts](../services/ai-analysis.ts), [workers/document-processor.ts](../workers/document-processor.ts).

## Principi

1. **L'AI non calcola.** Estrae valori riportati, interpreta indicatori calcolati dal financial engine, suggerisce.
2. **L'AI non genera alert.** Gli alert sono regole deterministiche; l'AI propone la next best action su un alert.
3. **L'AI non accede al database.** Legge e scrive solo tramite tool autorizzati con i permessi dell'utente.
4. **Tutto è tracciato.** Ogni invocazione → `AIRun`; ogni tool call → `AuditLog` (`actorType=AI`, input, output, esito).
5. **Nessuna AI simulata in prodotto.** Senza provider le funzioni lo dichiarano; la pipeline documentale ripiega sull'estrattore a regole, dichiarato come tale.
6. **Distinzione esplicita** tra DATO, CALCOLO, INTERPRETAZIONE, IPOTESI (negli output strutturati e nel copilot).

## Provider

```ts
interface AIProvider {
  name: "anthropic" | "openai" | "scripted";
  model: string;
  supportsDocumentAI: boolean;
  generateText(params): Promise<{ text; usage }>;
  generateObject<T>(params: { schema: ZodType<T>; pdf?: Uint8Array; ... }): Promise<{ object: T; raw; usage }>;
  runWithTools(params: { messages; tools; executeTool; maxIterations }): Promise<{ text; toolCalls; usage }>;
}
```

| Provider | Implementazione |
|---|---|
| Anthropic (default) | `@anthropic-ai/sdk`, `claude-opus-5`, thinking adattivo (default del modello), richieste in streaming con raccolta del messaggio finale, structured outputs (`output_config.format` JSON schema), PDF inviati come `document` quando il testo non è selezionabile, loop tool-use gestito dal nostro codice. **Fallback server-side sui rifiuti attivo per default** (`fallbacks: "default"`, disattivabile con `ANTHROPIC_FALLBACKS=off`). |
| OpenAI | `openai` SDK, Responses API, structured outputs `json_schema` strict, function calling. |
| Scripted | Solo test automatici: richiede `AI_PROVIDER=scripted` **e** `ALLOW_SCRIPTED_AI=1`, impossibile in produzione, etichettato “Provider di test” in UI. Produce output deterministici conformi allo schema ed esegue i tool reali: serve a verificare plumbing, autorizzazioni, audit e UI. Non usato dalla pipeline documentale. |

Selezione: `getAIProvider()` in [lib/ai/index.ts](../lib/ai/index.ts) in base a `AI_PROVIDER`. Aggiungere un provider = implementare l'interfaccia e registrarlo lì.

### Structured outputs

Gli schemi Zod sono convertiti in JSON Schema “strict” ([lib/ai/json-schema.ts](../lib/ai/json-schema.ts): tutte le proprietà richieste, niente proprietà aggiuntive, rimozione delle keyword non supportate). La risposta è **sempre** rivalidata con lo schema Zod originale (vincoli inclusi); un output non conforme fa fallire l'`AIRun` con l'output grezzo registrato.

## Tool del copilot

[lib/ai/tools/index.ts](../lib/ai/tools/index.ts). `company_id` è opzionale: se omesso si usa l'azienda del contesto della conversazione; `company_name` permette la ricerca per nome (sempre nell'organizzazione dell'utente).

| Tool | Permesso | Input | Output |
|---|---|---|---|
| `get_company` | company:read | company_id? / company_name? | anagrafica, referenti, ultimo fatturato; oppure elenco aziende |
| `get_company_financials` | company:read | company_id? | bilanci per anno (valori, stato, documento sorgente), indicatori ultimo anno con formula, variazioni significative |
| `get_company_documents` | document:read | company_id?, type? | documenti con tipo, esercizio, stato, revisione |
| `get_company_operations` | operation:read | company_id?, include_closed? | operazioni con condizioni e documenti obbligatori mancanti |
| `get_company_tasks` | task:read | company_id?, include_done? | task con scadenza e flag scaduto |
| `get_company_alerts` | company:read | company_id? | alert attivi |
| `calculate_financial_ratio` | company:read | ratio, fiscal_year? | valore, formula, input (financial engine) |
| `search_company_knowledge` | document:read | query, limit? | estratti con documento e pagina (full-text Postgres, dizionario italiano) |
| `create_task` | task:write | title, priority, due_date?, operation_id? | `CREATED` (Low/Medium) o `PENDING_APPROVAL` (High/Critical → `ApprovalRequest`) |

Esecuzione ([`executeTool`](../lib/ai/tools/index.ts)): tool esistente → autorizzazione RBAC → validazione input → esecuzione org-scoped → validazione output → audit. Gli errori non interrompono la conversazione: tornano al modello come `tool_result` di errore e sono comunque auditati. Una risorsa di un'altra organizzazione risulta “non trovata”.

## Casi d'uso

| Funzione | Input (preparato dal sistema) | Output (schema) | Persistenza |
|---|---|---|---|
| Copilot | cronologia (ultimi 20 messaggi), contesto azienda | testo markdown + tool call + fonti | `AIConversation`, `AIMessage` |
| Interpretazione finanziaria | bilanci, indicatori formattati, variazioni, alert | situazione, positività, criticità, variazioni, rischi, azioni (ognuna con basis e riferimenti) | `Insight FINANCIAL_INTERPRETATION` |
| Client briefing | anagrafica, bilanci+indicatori, variazioni, operazioni, task, alert, documenti recenti — ognuno con id fonte `S1…Sn` | executive summary, posizione finanziaria, cambiamenti, rischi, operazioni aperte, informazioni mancanti, domande, prossime azioni | `Insight CLIENT_BRIEFING` con `sourceRefs` |
| Next best action | alert + contesto azienda | azione, motivazione, priorità, confidenza | `Insight NEXT_BEST_ACTION` |
| Sintesi operazione | operazione, checklist, documenti disponibili, task | sintesi, valutazione, documenti mancanti (anche fuori checklist), prossimi passi, rischi | `Insight OPERATION_SUMMARY` |
| Briefing giornaliero | elenco deterministico “richiede attenzione” | headline, elementi per azienda, focus del giorno | `Insight DAILY_BRIEFING` (una volta al giorno, automatico) |

Le azioni proposte non vengono mai eseguite: il consulente può trasformarle in task con un click.

## Pipeline documentale

```
EXTRACT_TEXT  unpdf per pagina → DocumentChunk (ricerca)
CLASSIFY      regole sempre; AI se configurata (in caso di errore → regole)
              associazione automatica all'azienda tramite P.IVA
EXTRACT_DATA  bilanci/situazioni contabili:
              AI (testo con marcatori di pagina, o PDF se scansionato) → unità → controllo incrociato con regole → derivazioni
              senza AI o in caso di errore → estrattore a regole
VALIDATE      schema Zod + controlli contabili
SAVE          DocumentExtraction (PENDING_REVIEW) con fonte per campo
UPDATE        solo bilanci annuali: nuovo esercizio → bilancio EXTRACTED;
              stesso documento non verificato → aggiornamento;
              bilancio verificato o da altro documento → ApprovalRequest (nessuna sovrascrittura)
METRICS       financial engine → FinancialMetric
ALERTS        alert engine
INSIGHTS      variazioni deterministiche; sintesi AI per documenti non finanziari
```

Documenti oltre 400.000 caratteri non vengono troncati in silenzio: l'AI viene saltata con messaggio esplicito e si usa l'estrattore a regole.

## Governance

| L'AI può autonomamente | Richiede approvazione | Mai |
|---|---|---|
| classificare, estrarre, sintetizzare, analizzare, suggerire | modificare dati finanziari già verificati (o da altro documento) · creare task High/Critical | comunicazioni esterne, invii email, azioni con impatto sul cliente |

Le approvazioni sono in **/approvals** (Owner/Advisor). L'approvazione di un'estrazione passa sempre da un umano con ruolo `financials:approve`; le modifiche manuali in revisione sono registrate come `MANUAL` nella fonte del dato e nell'audit.

## Costi e prestazioni

- Modello di default `claude-opus-5`; effort differenziato: `low` per classificazione e briefing giornaliero, `medium` per estrazione, next best action e sintesi operazione, `high` per interpretazione e briefing cliente.
- La classificazione usa un estratto delle prime pagine (fino a 12.000 caratteri), dichiarato nel prompt.
- Il briefing giornaliero è generato al massimo una volta al giorno; gli altri output solo su richiesta.
- Token e durata di ogni esecuzione sono visibili in **Attività → Esecuzioni AI**.
