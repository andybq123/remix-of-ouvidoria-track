export type TrackedOnedocJob = {
  id: string;
  scope: string;
  tipo: "teste" | "unitario" | "lote";
  startedAt: number;
};

export function onedocScope(tipo: string, protocoloId?: string, secretariaId?: string) {
  return `${tipo}:${protocoloId ?? secretariaId ?? "todas"}`;
}

export function restoreOnedocJobs(raw: string | null): TrackedOnedocJob[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((j): j is TrackedOnedocJob =>
      !!j && typeof j.id === "string" && typeof j.scope === "string" &&
      ["teste", "unitario", "lote"].includes(j.tipo) && Number.isFinite(j.startedAt));
  } catch { return []; }
}

/** Each failed read stays tracked; a transient connection error never ends a job. */
export async function checkOnedocJobs<T extends { status: string }>(
  jobs: TrackedOnedocJob[],
  read: (id: string) => Promise<T>,
  receive: (tracked: TrackedOnedocJob, job: T, finished: boolean) => void,
) {
  await Promise.all(jobs.map(async (tracked) => {
    try {
      const job = await read(tracked.id);
      receive(tracked, job, job.status === "concluido" || job.status === "erro");
    } catch { /* Keep monitoring after temporary network errors. */ }
  }));
}