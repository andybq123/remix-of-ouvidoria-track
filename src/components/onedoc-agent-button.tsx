import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enfileirarOnedoc, statusOnedocJob, type OnedocJob } from "@/lib/onedoc.functions";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";

const SITUACAO: Record<string, string> = { arquivada: "arquivada", baixada: "baixada", em_andamento: "ainda em andamento" };

export function OnedocAgentButton({ tipo, protocoloId, label, size = "sm", onDone }: {
  tipo: "teste" | "unitario" | "lote"; protocoloId?: string; label: string;
  size?: "sm" | "default"; onDone?: (job: OnedocJob) => void;
}) {
  const enfileirar = useServerFn(enfileirarOnedoc);
  const status = useServerFn(statusOnedocJob);
  const qc = useQueryClient();
  const [job, setJob] = useState<OnedocJob | null>(null);
  const [rodando, setRodando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function iniciar() {
    if (tipo === "lote" && !confirm("Conferir no 1Doc todas as ouvidorias em aberto com link? Isso roda em segundo plano.")) return;
    setRodando(true);
    try {
      const { id } = await enfileirar({ data: { tipo, protocoloId } });
      const inicio = Date.now();
      let avisou = false;
      const tick = async () => {
        const j = await status({ data: { id } });
        setJob(j);
        if (j.status === "pendente" && !avisou && Date.now() - inicio > 30_000) {
          avisou = true;
          toast.warning("O agente 1Doc não respondeu. Ele funciona só na VPS; confira se o serviço está ligado.");
        }
        if (j.status === "concluido" || j.status === "erro") {
          setRodando(false);
          invalidateProtocoloCaches(qc);
          qc.invalidateQueries({ queryKey: ["onedoc-config"] });
          if (j.status === "erro") toast.error(j.mensagem || "Falha no agente 1Doc");
          else if (tipo === "unitario") {
            const r = (j.resultados || [])[0];
            if (r?.erro) toast.error(`1Doc: ${r.erro}`);
            else toast.success(`1Doc: ${SITUACAO[r?.situacao] ?? "conferida"}${r?.concluido ? " — marcada como concluída" : ""}`);
          } else toast.success(j.mensagem || "Concluído");
          onDone?.(j);
          return;
        }
        timer.current = setTimeout(tick, 2000);
      };
      tick();
    } catch (e: any) {
      setRodando(false);
      toast.error(e?.message || "Não foi possível iniciar");
    }
  }

  const prog = rodando && job && job.total > 1 ? ` ${job.processados}/${job.total}` : "";
  return (
    <Button size={size} variant="outline" onClick={iniciar} disabled={rodando}>
      {rodando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Bot className="h-4 w-4 mr-1" />}
      {rodando ? (job?.status === "pendente" ? "Aguardando agente…" : `Conferindo…${prog}`) : label}
    </Button>
  );
}
