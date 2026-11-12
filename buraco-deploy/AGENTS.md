# Buraco Brusque deploy kit

- Buraco Brusque (separate app) deploys to the same VPS via this standalone kit (ports 54331+/8081, project buraco-local, marked Caddy block); it must never touch OuviDesk containers, ports, or its Caddy block, and it applies the other repo's drizzle/migrations via tracked psql runs.
