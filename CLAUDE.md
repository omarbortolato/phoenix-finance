# phoenix-finance

Dashboard finanziaria per Phoenix RE Capital: monitoraggio conti correnti Mercury Bank
+ gestione progettuale dei deal (entitlement / minor subdivision land development).

Produzione: https://mercury.omarbortolato.it — deploy via Coolify (Docker Compose) su Hetzner.

## Struttura

```
phoenix-finance/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan migrations, router registration
│   └── app/
│       ├── auth.py               # JWT cookie auth (2 utenti hardcoded via env)
│       ├── config.py              # Settings (pydantic-settings), discovery MERCURY_TOKEN_*
│       ├── database.py            # SQLAlchemy engine/session (SQLite, Postgres-ready)
│       ├── email_client.py        # smtplib wrapper per alert e recupero password
│       ├── mercury_client.py      # Client REST Mercury, paginazione offset-based
│       ├── models.py              # Tutti i modelli ORM
│       ├── project_kpis.py        # Calcolo KPI progetto: spent/ROI/XIRR/status_color
│       ├── schemas.py             # Pydantic response models (Account/Transaction)
│       ├── sync.py                # sync_all() Mercury + check_project_alerts/_check_alerts
│       └── routers/
│           ├── auth.py             # login/logout/me/forgot-password
│           ├── accounts.py         # CRUD conti, reorder, exclude, alert saldo, balance-history
│           ├── transactions.py     # list/filter, categoria, tag progetto/fase
│           ├── categories.py       # categorie custom (union con mercury_category)
│           ├── projects.py         # CRUD progetti, fasi, template fasi, alert budget, spese manuali
│           └── sync.py             # POST /sync (?full=true per resync storico completo)
├── frontend/
│   └── src/
│       ├── api/client.ts          # Unico punto di accesso API + tipi TS
│       ├── components/            # Layout, TransactionList, BalanceChart, CategoryChart,
│       │                          # ProjectGantt, ProjectBurndownChart
│       ├── pages/                 # Login, Cockpit, AccountDetail, Categorize,
│       │                          # Projects, ProjectDetail, Configuration
│       └── contexts/              # AuthContext, ThemeContext (dark/light)
├── data/                          # SQLite DB (gitignored, volume Docker in produzione)
├── docs/                          # Note architetturali (da verificare se aggiornate)
├── docker-compose.yml             # backend + frontend (nginx), nessun ports: (Traefik/Coolify)
└── .env                           # Secrets (gitignored) — vedi sezione Env Vars sotto
```

## Stack

- **Backend**: FastAPI + SQLAlchemy ORM + SQLite (path Postgres-ready, vedi `func.strftime` da
  sostituire con `to_char` se si migra)
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS (dark mode via classe) + Recharts +
  React Router + date-fns
- **Auth**: JWT in cookie httpOnly, 2 utenti hardcoded (`omar` / `emanuel`) via env var password
- **Deploy**: Coolify (Docker Compose build pack), Traefik reverse proxy + Let's Encrypt
- **Email**: SMTP via `smtplib` (Hostinger) — usato per alert saldo/budget e recupero password

## Moduli principali

### 1. Monitoraggio conti Mercury
- Sync multi-token (`MERCURY_TOKEN_*`), dedup per account ID, solo conti `checking`
- Sync incrementale (cursore `last_sync_at - 2gg`) o full resync (`?full=true`) — **importante**:
  l'API Mercury richiede sempre uno `start` esplicito, altrimenti restituisce solo l'ultimo mese
  circa (bug risolto: vedi `sync.py`, mai chiamare `get_all_transactions` con `start=None` di fatto)
- Paginazione client Mercury basata su `len(batch) < limit`, non su un campo `total` (non sempre
  presente nella risposta)
- Categorie: quelle native Mercury + custom creabili da UI, editabili inline su ogni transazione
- Reorder/esclusione conti dalla sidebar (drag visivo via freccette, escludi è soft-delete globale)
- Alert email su soglia di saldo per conto (`AccountAlert`, cooldown 24h)

### 2. Projects (land entitlement & minor subdivision)
- `Project`: code univoco, tipo (`entitlement`/`minor_subdivision`), budget, revenue stimata,
  date inizio/fine
- `ProjectPhase`: fasi con budget proprio, date pianificate/effettive, stato, % completamento —
  drill-down dei costi a livello di fase (non solo progetto)
- `PhaseTemplate` (sezione **Configuration**, globale): nome + `duration_days` — il sync genera le
  fasi di un nuovo progetto incatenando le date a partire dallo `start_date` del progetto
- Tag transazioni Mercury **e** spese manuali (`ProjectManualExpense`, per costi pre-conto o cash) a
  progetto e/o fase specifica
- KPI (`project_kpis.py`): spent_so_far, budget_remaining, margin/ROI stimato, **IRR stimato**
  (XIRR via bisezione su cash flow reali + un'unica revenue futura proiettata a `end_date_estimated`),
  semaforo budget pace-based (verde/giallo/rosso confrontando % spesa vs % tempo trascorso)
- Gantt custom (no Recharts, div-based): barre stimato (tratteggiate) vs effettivo (piene) in base
  allo stato fase; toggle "Compare estimated vs actual" per vista a doppia barra; tooltip on
  hover/click con date, giorni, budget/spent
- Burndown chart: ideale (lineare) vs spesa cumulata reale
- Alert email su soglia % di budget progetto (`ProjectBudgetAlert`, stesso pattern degli account)
- "Sync phases from templates" è non distruttivo di default (aggiunge solo le fasi mancanti); con
  progresso già inserito chiede conferma prima di un reset forzato (`force=true`) che tocca solo le
  fasi che corrispondono a un template, lasciando intatte quelle custom

### 3. Sicurezza / convenzioni
- Mai loggare token Mercury o password in chiaro
- `.env` sempre gitignored
- Validazione date server-side: qualsiasi data con anno < 2000 viene rifiutata (422) — guardia
  contro il bug di digitazione nei campi `<input type="date">` (impostare sempre `min`/`max` anche
  lato frontend)
- **Gotcha SQLAlchemy**: dopo `db.commit()` gli oggetti ORM vengono "expired" — se si ritorna
  l'oggetto direttamente (senza `response_model` Pydantic), serve sempre `db.refresh(obj)` prima del
  `return`, altrimenti FastAPI serializza un oggetto vuoto/parziale (bug reale riscontrato e
  corretto in `update_phase_template` e `update_manual_expense`)

## Env vars principali (vedi `.env` in produzione, gitignored)

```
DATABASE_URL=sqlite:////app/data/phoenix_finance.db
AUTH_PASSWORD_OMAR=... / AUTH_PASSWORD_EMANUEL=...
AUTH_SECRET_KEY=...
AUTH_EMAIL_OMAR=... / AUTH_EMAIL_EMANUEL=...     # per "password dimenticata"
COOKIE_SECURE=true                                # false solo in dev locale http
ALLOWED_ORIGINS=https://mercury.omarbortolato.it
MERCURY_TOKEN_LP1=... MERCURY_TOKEN_GP1=... MERCURY_TOKEN_QUEEN=... MERCURY_TOKEN_GREGG=...
MERCURY_EXCLUDED_ACCOUNTS=Smylife LLC
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USE_SSL=true
SMTP_USER=info@phoenixrecapital.us
SMTP_PASSWORD=...
SMTP_FROM=info@phoenixrecapital.us
```

⚠️ `.env.example` nella repo è un template generico ereditato da un altro progetto (menziona
LiteLLM/Qdrant/Postgres/Concierge che non esistono qui) — non rispecchia le var reali sopra, da
sistemare se diventa fonte di confusione.

## Note operative

- Le migrazioni DB sono **automatiche** all'avvio (`main.py::_migrate()`), idempotenti — nessun
  comando manuale necessario dopo un redeploy
- Redeploy: push su `main` → Coolify pulla e ribuilda automaticamente (webhook GitHub configurato)
- SSH GitHub: `git@github.com:omarbortolato/phoenix-finance`
- `secrets/` e `.env` gitignored — non committare mai credenziali
