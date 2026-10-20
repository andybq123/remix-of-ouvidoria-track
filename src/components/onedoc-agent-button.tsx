import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enfileirarOnedoc, type OnedocJob } from "@/lib/onedoc.functions";
import { useOnedocBackground } from "@/components/onedoc-background-provider";
import { onedocScope } from "@/lib/onedoc-monitor";

export function OnedocAgentButton({ tipo, protocoloId, protocoloIds, secretariaId, confirmacao, disabled = false, label, size = "sm", onDone }: {
  tipo: "teste" | "unitario" | "lote"; protocoloId?: string; protocoloIds?: string[]; secretariaId?: string; confirmacao?: string; disabled?: boolean; label: string;
  size?: "sm" | "default"; onDone?: (job: OnedocJob) => void;
}) {
  const enfileirar = useServerFn(enfileirarOnedoc);
  const qc = useQueryClient();
  const { tracked, jobs, track } = useOnedocBackground();
  const [iniciando, setIniciando] = useState(false);
  const [startedId, setStartedId] = useState<string>();
  const delivered = useRef<string | undefined>(undefined);
  const scope = onedocScope(tipo, protocoloId, secretariaId);
  const active = tracked.find((j) => j.scope === scope);
  const job = jobs[active?.id ?? startedId ?? ""];
  const rodando = iniciando || !!active;
  useEffect(() => {
    if (!job || (job.status !== "concluido" && job.status !== "erro") || delivered.current === job.id) return;
    delivered.current = job.id;
    onDone?.(job);
  }, [job, onDone]);

  async function iniciar() {
    if (tipo === "lote" && !confirm(confirmacao ?? "Conferir no 1Doc todas as ouvidorias em aberto com link? Isso roda em segundo plano.")) return;
    setIniciando(true);
    try {
      const { id } = await enfileirar({ data: { tipo, protocoloId, protocoloIds, secretariaId } });
      setStartedId(id);
      track({ id, tipo, scope, startedAt: Date.now() });
      qc.invalidateQueries({ queryKey: ["onedoc-historico"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar");
    } finally {
      setIniciando(false);
    }
  }

  const prog = rodando && job && job.total > 1 ? ` ${job.processados}/${job.total}` : "";
  return (
    <Button size={size} variant="outline" onClick={iniciar} disabled={rodando || disabled}>
      {rodando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bot className="h-4 w-4 mr-1" />}
      {rodando ? (job?.status === "pendente" ? "Aguardando agente…" : `Conferindo…${prog}`) : label}
    </Button>
  );
}
