import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const ATUALIZACAO_ATUAL_KEY = ["atualizacao-atual"];
const NOMES = ["Baixando alterações", "Preparando a versão", "Atualizando o banco", "Trocando a versão", "Conferindo o sistema"];

type JobAtual = { id: string; status: string; etapa: number; etapas_total: number; mensagem: string | null; created_at: string; updated_at: string };

/** Acompanha a atualização da VPS em segundo plano em qualquer tela e recarrega ao concluir. */
export function AtualizacaoOverlay() {
  const isAdmin = useIsAdmin();
  const acompanhando = useRef<string | null>(null);
  const [fechado, setFechado] = useState<string | null>(null);
  const { data: job } = useQuery({
    queryKey: ATUALIZACAO_ATUAL_KEY,
    enabled: isAdmin,
    retry: false,
    refetchInterval: q => (q.state.data && ["pendente", "rodando"].includes((q.state.data as JobAtual).status)) || acompanhando.current ? 2000 : 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atualizacao_jobs")
        .select("id, status, etapa, etapas_total, mensagem, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as JobAtual | null;
    },
  });

  const ativo = !!job && (job.status === "pendente" || job.status === "rodando");
  useEffect(() => {
    if (ativo && job) acompanhando.current = job.id;
    if (job && acompanhando.current === job.id && job.status === "concluido") {
      const t = setTimeout(() => window.location.reload(), 1500);
      return () => clearTimeout(t);
    }
    if (job && acompanhando.current === job.id && job.status === "erro") acompanhando.current = null;
  }, [ativo, job]);

  const concluindo = job?.status === "concluido" && acompanhando.current === job.id;
  if (!job || (!ativo && !concluindo)) return null;
  // Pedido na fila há muito tempo sem o serviço responder: não bloqueia a tela.
  if (fechado === job.id && !concluindo) return null;
  // Sem notícia da VPS há mais de 3 min: considera travado e não bloqueia a tela.
  if (!concluindo && Date.now() - new Date(job.updated_at).getTime() > 180_000) return null;

  const pct = concluindo ? 100 : Math.max(5, (job.etapa / job.etapas_total) * 100);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center shadow-lg">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">{concluindo ? "Atualização concluída!" : "Estamos atualizando o sistema"}</h2>
        <p className="text-sm text-muted-foreground">
          {concluindo
            ? "Recarregando a página…"
            : job.status === "pendente"
              ? "Aguardando a VPS iniciar…"
              : `Etapa ${job.etapa}/${job.etapas_total} — ${NOMES[job.etapa - 1] ?? "Iniciando"}`}
        </p>
        <Progress value={pct} />
        {job.mensagem && !concluindo && <p className="truncate text-xs text-muted-foreground">{job.mensagem}</p>}
        <p className="text-xs text-muted-foreground">A página recarrega sozinha quando terminar.</p>
        {!concluindo && (
          <Button variant="outline" size="sm" onClick={() => setFechado(job.id)}>Continuar usando o sistema</Button>
        )}
      </div>
    </div>
  );
}
