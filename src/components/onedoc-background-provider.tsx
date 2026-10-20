import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { statusOnedocJob, type OnedocJob } from "@/lib/onedoc.functions";
import { checkOnedocJobs, restoreOnedocJobs, type TrackedOnedocJob } from "@/lib/onedoc-monitor";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";
import { resumoResultados } from "@/lib/onedoc-history";

type Monitor = {
  tracked: TrackedOnedocJob[];
  jobs: Record<string, OnedocJob>;
  track: (job: TrackedOnedocJob) => void;
};
const Context = createContext<Monitor | null>(null);

export function useOnedocBackground() {
  const value = useContext(Context);
  if (!value) throw new Error("Conferência 1Doc fora da sessão autenticada");
  return value;
}

export function OnedocBackgroundProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const status = useServerFn(statusOnedocJob);
  const qc = useQueryClient();
  const router = useRouter();
  const [tracked, setTracked] = useState<TrackedOnedocJob[]>([]);
  const [jobs, setJobs] = useState<Record<string, OnedocJob>>({});
  const pending = useRef<TrackedOnedocJob[]>([]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const key = `ouvidesk:onedoc-pending:${userId}`;

  function save(next: TrackedOnedocJob[]) {
    pending.current = next;
    setTracked(next);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* Monitoring still works without storage. */ }
  }

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const warned = new Set<string>();
    try { pending.current = restoreOnedocJobs(sessionStorage.getItem(key)); } catch { pending.current = []; }
    setTracked(pending.current);
    setJobs({});

    const tick = async () => {
      await checkOnedocJobs(pending.current, (id) => statusRef.current({ data: { id } }), (trackedJob, job, finished) => {
        if (stopped || !pending.current.some((j) => j.id === trackedJob.id)) return;
        setJobs((previous) => ({ ...previous, [job.id]: job }));
        if (!finished) {
          if (job.status === "pendente" && Date.now() - trackedJob.startedAt > 30_000 && !warned.has(job.id)) {
            warned.add(job.id);
            toast.warning("O agente 1Doc está aguardando. Confira se o serviço está ligado na VPS.");
          }
          return;
        }
        save(pending.current.filter((j) => j.id !== job.id));
        invalidateProtocoloCaches(qc);
        qc.invalidateQueries({ queryKey: ["atrasadas-localizacao"] });
        qc.invalidateQueries({ queryKey: ["onedoc-config"] });
        qc.invalidateQueries({ queryKey: ["onedoc-historico"] });
        const resumo = resumoResultados(job.resultados ?? []);
        const options = {
          id: `onedoc-finished:${job.id}`,
          duration: Infinity,
          closeButton: true,
          description: job.mensagem ?? `${job.processados}/${job.total} verificadas · ${resumo.enderecos} endereços atualizados · ${resumo.concluidos} concluídas`,
          ...(trackedJob.tipo === "lote" ? { action: { label: "Ver histórico", onClick: () => { void router.navigate({ to: "/agente-1doc" }); } } } : {}),
        };
        if (job.status === "erro" || job.erros > 0 || resumo.erros > 0) toast.error("Conferência 1Doc finalizada com falhas", options);
        else toast.success(trackedJob.tipo === "teste" ? "Teste de login 1Doc finalizado" : "Conferência 1Doc finalizada", options);
      });
      if (!stopped) timer = setTimeout(tick, 2000);
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [key, qc, router]);

  function track(job: TrackedOnedocJob) {
    if (!pending.current.some((j) => j.id === job.id)) save([...pending.current, job]);
    toast.info(job.tipo === "teste" ? "Teste de login iniciado" : "Conferência 1Doc iniciada em segundo plano");
  }

  return <Context.Provider value={{ tracked, jobs, track }}>{children}</Context.Provider>;
}