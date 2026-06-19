# phoenix-finance

Piattaforma AI per la gestione e l'analisi finanziaria.

## Struttura

```
phoenix-finance/
├── services/          # Microservizi applicativi
│   ├── concierge/     # API gateway / orchestratore
│   └── analytics/     # Dashboard e report
├── docs/              # Documentazione architetturale
├── scripts/           # Utility: init, reload, backup
├── secrets/           # File sensibili (gitignored)
├── .env               # Variabili d'ambiente (gitignored)
├── .env.example       # Template pubblico
└── docker-compose.yml
```

## Comandi rapidi

```bash
./scripts/init.sh     # Primo avvio
./scripts/reload.sh   # Aggiorna e riavvia
./scripts/backup.sh   # Backup PostgreSQL
```

## Note

- `.env` e `secrets/` sono gitignored — non committare mai credenziali.
- SSH GitHub: git@github.com:omarbortolato/phoenix-finance
