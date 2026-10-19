# Project rules
- Keep the health-unit donut and its separate legend in HealthUnitChart so chart sizing never depends on the number of legend entries.
- Keep map icon choices in `secretarias.icone` and resolve markers through the shared icon catalog, so all map views honor the same persisted selection.- Regra: políticas do TanStack Query (staleTime por prefixo, retry, limpeza no logout) ficam em src/lib/query-policies.ts — um só lugar para ajustar cache.
