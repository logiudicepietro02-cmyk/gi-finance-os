# Financial engine

Codice: [lib/financial](../lib/financial) (puro, senza I/O) · test: [tests/unit/financial-ratios.test.ts](../tests/unit/financial-ratios.test.ts).

**Principio:** i numeri li calcola il codice. L'LLM non esegue calcoli: estrae valori riportati nei documenti e interpreta indicatori già calcolati.

## Campi del bilancio normalizzato

`revenue`, `ebitda`, `ebit`, `netIncome`, `cash`, `financialDebt`, `netFinancialPosition`, `equity`, `currentAssets`, `currentLiabilities`, `inventory`, `totalAssets`, `interestExpense`, `principalRepayment`, `depreciation` — importi in euro. Mappatura sulle voci CEE in [data-model.md](data-model.md#campi-del-bilancio-normalizzato).

## Indicatori

| Chiave | Indicatore | Formula | Non significativo quando |
|---|---|---|---|
| `ebitda_margin` | EBITDA margin | EBITDA / Ricavi | Ricavi ≤ 0 |
| `ebit_margin` | EBIT margin | EBIT / Ricavi | Ricavi ≤ 0 |
| `net_debt` | PFN (Net Debt) | Debiti finanziari − Disponibilità liquide | — |
| `net_debt_to_ebitda` | PFN / EBITDA | (Debiti finanziari − Disponibilità liquide) / EBITDA | EBITDA ≤ 0 |
| `debt_to_ebitda` | Debiti finanziari / EBITDA | Debiti finanziari / EBITDA | EBITDA ≤ 0 |
| `current_ratio` | Current ratio | Attivo corrente / Passivo corrente | Passivo corrente ≤ 0 |
| `quick_ratio` | Quick ratio | (Attivo corrente − Rimanenze) / Passivo corrente | Passivo corrente ≤ 0 |
| `interest_coverage` | Interest coverage | EBIT / Oneri finanziari | Oneri finanziari ≤ 0 |
| `dscr` | DSCR (semplificato) | EBITDA / (Oneri finanziari + Quota capitale annua) | Servizio del debito ≤ 0 |
| `net_debt_to_equity` | PFN / Patrimonio netto | (Debiti finanziari − Disponibilità liquide) / Patrimonio netto | Patrimonio netto ≤ 0 |

Ogni risultato (`RatioResult`) contiene: `value`, `status` (`OK` · `MISSING` · `NOT_MEANINGFUL`), `formula`, `inputs` (etichetta e valore di ogni input), `missing` (campi assenti), `note`.

### Regole

- **Dato mancante** → `MISSING`, `value = null`, nota “Dato non disponibile: …”. Nessun valore stimato.
- **Matematicamente non significativo** (divisione per zero, EBITDA negativo in un multiplo di leva, patrimonio netto negativo) → `NOT_MEANINGFUL` con motivazione. In UI: “n.s.”.
- **PFN**: se debiti finanziari o liquidità mancano ma la PFN è riportata nel documento, si usa quella riportata con nota esplicita.
- **Cassa netta**: PFN negativa è valida; gli indicatori basati sulla PFN riportano la nota “Posizione di cassa netta”.
- **DSCR**: definizione semplificata per PMI (flussi di cassa approssimati dall'EBITDA). Un DSCR negativo (EBITDA negativo) è significativo e viene mostrato.
- Precisione: percentuali come frazione (0,125 = 12,5%), arrotondamento a 6 decimali per multipli/percentuali e a 2 per importi. Importi `Decimal(18,2)` nel DB convertiti in `number` nel motore.
- Le metriche sono persistite per bilancio in `FinancialMetric` (ricalcolate a ogni modifica/approvazione) e ricalcolate al volo in UI dagli stessi valori.

In UI ogni indicatore è cliccabile: mostra formula, input con valori, risultato e nota.

## Variazioni

[lib/financial/variations.ts](../lib/financial/variations.ts) confronta l'ultimo bilancio con il precedente: delta assoluto, delta % (importi), punti percentuali (margini), favorevole/sfavorevole secondo la direzione dell'indicatore. Soglie di significatività:

| Voce | Significativa se |
|---|---|
| Ricavi | variazione ≥ 10% |
| EBITDA | ≥ 15% |
| Utile | cambio di segno o ≥ 25% |
| Patrimonio netto | ≥ 15% |
| PFN | ≥ 100 k€ e ≥ 20% |
| EBITDA margin | ≥ 2 pp |
| PFN/EBITDA | ≥ 0,5x |
| DSCR, Current ratio | ≥ 0,2 |

Le variazioni significative diventano `Insight` di tipo `VARIATION` (fonte `RULES`), alimentano la dashboard e il contesto dell'AI.

## Alert engine

[lib/alerts/rules.ts](../lib/alerts/rules.ts) (puro) · sincronizzazione in [services/alerts.ts](../services/alerts.ts).

| Regola | Condizione | Severità |
|---|---|---|
| `DSCR_BELOW_THRESHOLD` | DSCR ultimo bilancio < `dscrMin` | Critico se < 1, altrimenti Attenzione |
| `NET_DEBT_EBITDA_ABOVE_THRESHOLD` | PFN/EBITDA > `netDebtEbitdaMax` | Critico se > 1,5 × soglia |
| ↳ variante | EBITDA ≤ 0 con PFN > 0 | Critico |
| `FINANCING_MATURITY` | Scadenza operazione (non respinta) entro `maturityWarningDays` | Critico se ≤ 30 giorni |
| `MISSING_REQUIRED_DOCUMENT` | Operazione in Documentazione/Presentata/Negoziazione con documenti obbligatori Mancanti/Richiesti | Critico se una richiesta è oltre scadenza |
| `TASK_OVERDUE` | Task non completato con scadenza passata | Critico se priorità Alta/Critica |

Soglie per organizzazione (Impostazioni): default DSCR 1,2 · PFN/EBITDA 4,0 · 60 giorni.

Sincronizzazione: un alert per `dedupeKey` (regola + entità). Nuove condizioni → alert `OPEN`; condizione persistente → aggiornamento; condizione cessata → `RESOLVED` automatico; condizione tornata → riaperto. Un alert archiviato resta archiviato salvo peggioramento di severità. Esecuzione dopo ogni mutazione rilevante e al caricamento della dashboard (massimo ogni 10 minuti, e sempre al primo accesso del giorno, per le regole basate sul tempo).

## Estrazione dei bilanci

Schema: [lib/documents/extraction-schema.ts](../lib/documents/extraction-schema.ts) (`bilancio.v1`, Zod strict). Ogni campo: `value`, `page`, `sourceText`, `confidence`. Campi minimi richiesti: revenue, ebitda, ebit, net_income, cash, financial_debt, net_financial_position, equity, current_assets, current_liabilities (+ inventory, total_assets, interest_expense, principal_repayment, depreciation, bank_debt, other_lenders_debt, bonds).

### Estrattore a regole (schema CEE)

[lib/documents/bilancio-rules.ts](../lib/documents/bilancio-rules.ts): cerca le voci per etichetta (es. “Ricavi delle vendite e delle prestazioni”, “Differenza tra valore e costi della produzione (A − B)”, “Totale patrimonio netto”, “Totale debiti esigibili entro l'esercizio successivo”) e prende il primo importo della colonna dell'esercizio corrente; scarta i match seguiti da parole (intestazioni di sezione). Gestisce formato italiano (1.234.567,89, negativi `-`/parentesi), unità in migliaia, esercizio, ragione sociale e P.IVA. Ogni valore conserva pagina e testo.

### Derivazioni deterministiche

[lib/documents/derive.ts](../lib/documents/derive.ts), applicate sia all'output AI sia a quello a regole, solo se il campo non è riportato:

- `financial_debt` = debiti verso banche + altri finanziatori + obbligazioni
- `ebitda` = EBIT + ammortamenti e svalutazioni
- conversione migliaia → unità
- PFN calcolata all'aggiornamento del bilancio se non riportata (fonte `COMPUTED`)

### Validazione

[lib/documents/validation.ts](../lib/documents/validation.ts): errori bloccanti (schema non valido, nessun dato chiave, ricavi negativi) e avvisi per la revisione (EBIT > EBITDA, PFN incoerente, liquidità o rimanenze > attivo corrente, patrimonio netto > totale attivo o negativo, utile > ricavi, confidenza bassa). Con AI configurata si aggiungono le discrepanze del controllo incrociato AI ↔ regole (> 2%).
