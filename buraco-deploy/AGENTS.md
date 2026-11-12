# Buraco Brusque deploy kit

- Buraco Brusque (separate app) deploys to the same VPS via this standalone kit (ports 54331+/8081, project buraco-local, marked Caddy block); it must never touch OuviDesk containers, ports, or its Caddy block, and it applies the other repo's drizzle/migrations via tracked psql runs.
- Additional domains are appended only to the single marked Caddy site header by dominio-config.mjs and applied via deploy.sh dominio with validation and reload rollback; this preserves the existing app, database, primary auth URL and unrelated sites without rebuilding services.
