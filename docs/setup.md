# Setup

## 1. Prerequisiti

- Node.js ≥ 22 (sviluppato e testato con Node 24) e npm.
- Uno tra: nessun database (usa il Postgres embedded), Docker, oppure un PostgreSQL esistente (locale, Supabase, Neon…).
- Per gli E2E: Microsoft Edge (Windows) o Google Chrome installati.

## 2. Installazione

```bash
npm install
```

`postinstall` genera il client Prisma in `lib/generated/prisma` (non versionato).

```bash
cp .env.example .env
```

## 3. Database

### Opzione A — Postgres embedded (consigliata in locale, nessun Docker)

```bash
npm run db:start
```

- Scarica/usa i binari ufficiali PostgreSQL tramite il pacchetto `embedded-postgres`.
- Legge porta e credenziali da `DATABASE_URL` (default porta **54329**).
- Crea i database `gi_finance_os`, `gi_finance_os_test`, `gi_finance_os_e2e`.
- I dati restano in `PG_DATA_DIR` (default `~/.gi-finance-os/postgres`). **Non** metterli in cartelle sincronizzate (OneDrive, Dropbox): la sincronizzazione dei file di Postgres corrompe il cluster.
- Ctrl+C lo arresta.

### Opzione B — Docker

```bash
docker compose up -d
```

Stessa porta e credenziali del default; `docker/initdb` crea i database di test.

### Opzione C — PostgreSQL esistente / Supabase

Imposta `DATABASE_URL` (e, se esegui i test, `TEST_DATABASE_URL` ed `E2E_DATABASE_URL`) con una connection string diretta (non pooler in modalità transaction per le migrazioni).

## 4. Migrazioni e dati dimostrativi

```bash
npm run setup
```

Equivale a `prisma migrate deploy` + `tsx prisma/seed.ts`. Il seed è ripetibile: elimina e ricrea solo le organizzazioni dimostrative.

## 5. Avvio

```bash
npm run dev
```

http://localhost:3000 — credenziali demo nel [README](../README.md#avvio-rapido).

Build di produzione:

```bash
npm run build
```

```bash
npm run start
```

In produzione i cookie di sessione sono `secure`: servire l'app in HTTPS.

## 6. AI

```env
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="..."
ANTHROPIC_MODEL="claude-opus-5"
```

oppure

```env
AI_PROVIDER="openai"
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5"
```

Riavvia `npm run dev` dopo aver modificato `.env`. Lo stato del provider è visibile in alto a destra e in **Impostazioni → Provider AI**. `AI_PROVIDER="none"` disattiva l'AI esplicitamente.

## 7. Storage S3 / Supabase Storage

```env
STORAGE_DRIVER="s3"
S3_ENDPOINT="https://<project>.supabase.co/storage/v1/s3"
S3_REGION="eu-central-1"
S3_BUCKET="documents"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_FORCE_PATH_STYLE="true"
```

## 8. Test

```bash
npm run test:unit
```

```bash
npm run test:integration
```

```bash
npm run test:e2e
```

- Integrazione: applica le migrazioni su `TEST_DATABASE_URL`, crea organizzazioni isolate per ogni file di test e le elimina alla fine.
- E2E: `scripts/e2e-server.mjs` applica migrazioni e seed su `E2E_DATABASE_URL`, avvia `next dev` su porta 3100 con `AI_PROVIDER=scripted` (provider di test) e build dir `.next-e2e`. Report HTML in `playwright-report/`.

## Troubleshooting

| Problema | Soluzione |
|---|---|
| `DATABASE_URL non configurata` | Copia `.env.example` in `.env` |
| `P1001 Can't reach database server` | Avvia `npm run db:start` (o Docker) e verifica la porta |
| Porta 54329 occupata | Cambia la porta in tutte e tre le URL del `.env` |
| `db:start` fallisce dopo un arresto brusco | Termina eventuali processi `postgres` rimasti e rilancia; in ultima istanza elimina `PG_DATA_DIR` (perdi i dati locali) e ripeti `npm run setup` |
| Upload rifiutato | Solo PDF reali (magic bytes `%PDF`), massimo `MAX_UPLOAD_MB` |
| PDF scansionato senza testo | Con provider AI configurato il PDF viene inviato al modello; senza AI la pipeline lo segnala e non estrae dati |
| Installazione lenta in OneDrive | È dovuta alla sincronizzazione di `node_modules`: valuta di escludere la cartella dalla sincronizzazione |
| Playwright non trova il browser | Imposta `PW_CHANNEL=chrome` o `msedge`, oppure installa Chromium con `npx playwright install chromium` |
