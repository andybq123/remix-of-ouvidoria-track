import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Bot, Pause, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMuseStatus, setMusePausado, type MuseStatus } from "@/lib/muse.functions";
import type { OnedocJob } from "@/lib/onedoc.functions";

export function useMuseStatus(enabled: boolean) {
  const getStatus = useServerFn(getMuseStatus);
  return useQuery({
    queryKey: ["muse-status"],
    queryFn: () => getStatus(),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.jobs.some((j) => j.status === "pendente" || j.status === "executando")
        ? 5000
        : false,
  });
}

export function resumoJob(job: OnedocJob): {
  encerradas: number;
  continuam: number;
  erros: number;
} {
  const resultados = Array.isArray(job.resultados) ? job.resultados : [];
  return {
    encerradas: resultados.filter((r) => r.concluido === true).length,
    continuam: resultados.filter((r) => !r.erro && r.concluido !== true).length,
    erros: job.erros ?? resultados.filter((r) => !!r.erro).length,
  };
}

function UltimaConferenciaTexto(job: OnedocJob): string {
  const r = resumoJob(job);
  return `${job.processados}/${job.total} conferidas · ${r.encerradas} encerradas · ${r.continuam} continuam atrasadas · ${r.erros} erros`;
}

/** Botão Pausar/Retomar a integração (admin-only, via setMusePausado). */
export function MusePausarButton({ pausado, onDone }: { pausado: boolean; onDone?: () => void }) {
  const pausar = useServerFn(setMusePausado);
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  async function clicar() {
    setSalvando(true);
    try {
      await pausar({ data: { pausado: !pausado } });
      toast.success(pausado ? "Integração Muse retomada" : "Integração Muse pausada");
      qc.invalidateQueries({ queryKey: ["muse-status"] });
      onDone?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível alterar a pausa");
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={clicar} disabled={salvando}>
      {pausado ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
      {pausado ? "Retomar integração" : "Pausar integração"}
    </Button>
  );
}

/** Cartão "Assistente Muse" — status, última conferência e freio manual. */
export function MuseStatusCard() {
  const { data, isLoading, error } = useMuseStatus(true);
  const ultimo = data?.jobs?.[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" /> Assistente Muse
          <Badge variant="secondary">Muse</Badge>
        </CardTitle>
        <CardDescription>
          O Muse confere as ouvidorias atrasadas no 1Doc e encerra no OuviDesk as que já foram
          baixadas lá. Ele nunca escreve direto em protocolos: só enfileira a conferência, e o
          agente do 1Doc aplica a regra de baixa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando status…</p>
        ) : error ? (
          <p className="text-sm text-destructive">Não foi possível carregar o status do Muse.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Status:</span>
              {data?.configurado ? (
                <Badge>Token configurado</Badge>
              ) : (
                <Badge variant="destructive">Token não configurado</Badge>
              )}
              {data?.pausado && <Badge variant="secondary">Integração pausada</Badge>}
              {!data?.configurado && (
                <span className="text-muted-foreground">
                  Crie MUSE_API_TOKEN no .env.local da VPS e reinicie o app.
                </span>
              )}
            </div>
            {ultimo ? (
              <p className="text-sm">
                Última conferência do Muse: {new Date(ultimo.created_at).toLocaleString("pt-BR")} —{" "}
                {UltimaConferenciaTexto(ultimo)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma conferência pedida pelo Muse ainda.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {data && <MusePausarButton pausado={data.pausado} />}
              <Button size="sm" variant="outline" asChild>
                <Link to="/muse">Ver Assistente Muse</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Faixa compacta com a última conferência do Muse, para a tela Atrasados. */
export function MuseUltimaConferenciaFaixa({ status }: { status: MuseStatus }) {
  const ultimo = status.jobs?.[0];
  if (!ultimo) return null;
  return (
    <Card className="border-primary/40">
      <CardContent className="p-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">Muse</Badge>
        <span>
          Última conferência do Muse em {new Date(ultimo.created_at).toLocaleString("pt-BR")}:{" "}
          {UltimaConferenciaTexto(ultimo)}
        </span>
        <Link to="/muse" className="ml-auto text-primary underline underline-offset-2">
          Ver Assistente Muse
        </Link>
      </CardContent>
    </Card>
  );
}
