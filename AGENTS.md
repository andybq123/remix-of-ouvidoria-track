# Project rules
- Keep BI positive-volume filtering in a browser-safe visualization helper and its regression test, so zero-demand departments stay hidden without changing public aggregate queries.
- Keep the health-unit donut and its separate legend in HealthUnitChart so chart sizing never depends on the number of legend entries.
- Keep map icon choices in `secretarias.icone` and resolve markers through the shared icon catalog, so all map views honor the same persisted selection.- Regra: políticas do TanStack Query (staleTime por prefixo, retry, limpeza no logout) ficam em src/lib/query-policies.ts — um só lugar para ajustar cache.
- The 1Doc agent (local-docker/agente-1doc) runs only as a queue worker on the VPS reading onedoc_jobs; never run a browser inside the web server, since workerd cannot.
- Department-scoped 1Doc batches pass explicit protocol IDs through the shared queue endpoint, which rechecks open status and 1Doc links before enqueueing, so a scoped action never falls back to a global batch.
- 1Doc history persists department snapshots in job context and full per-protocol outcome snapshots only after successful writes; shared paginated history reads remain admin-only so later edits cannot rewrite audit results.
- Track browser-started 1Doc jobs in a user-scoped authenticated-layout provider with session storage recovery; page buttons only enqueue, so navigation cannot cancel completion notifications or cache refreshes.
- Edit manual 1Doc links through a focused control in the shared protocol detail dialog using the existing protocol URL field; save only the link and refresh detail/list caches so imported rows follow the same flow without completing triage or changing other fields.
- VPS updates: build-vps.yml paths-ignore must match IGNORAR_BUILD in local-docker/atualizar.sh, so the VPS knows when no new build will be published.
