import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getOnedocHistorico, type OnedocJob } from "@/lib/onedoc.functions";
import { resumoResultados } from "@/lib/onedoc-history";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";

const estados: Record<string, string> = { pendente: "Aguardando agente", executando: "Conferindo", concluido: "Finalizado", erro: "Falha" };
const dataHora = (data: string) => new Date(data).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Lote({ job }: { job: OnedocJob }) {
  const [aberto, setAberto] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [detalhe, setDetalhe] = useState<{ id: string } | null>(null);
  const resultados = Array.isArray(job.resultados) ? job.resultados : [];
  const resumo = resumoResultados(resultados);
  const secretarias = job.contexto?.secretarias?.map((s) => s.nome).join(", ") || "Secretaria não registrada";
  return <div className="border-b py-4 last:border-0">
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="ghost" onClick={() => setAberto(!aberto)} aria-expanded={aberto} aria-label={`Detalhes do lote de ${dataHora(job.created_at)}`}>
        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium break-words">{secretarias}</p>
        <p className="text-xs text-muted-foreground">{dataHora(job.created_at)}</p>
      </div>
      <Badge variant={job.status === "erro" ? "destructive" : "secondary"}>{estados[job.status] ?? job.status}</Badge>
      <p className="text-sm">{job.processados}/{job.total} conferidas · {resumo.enderecos} endereços · {job.atualizados} concluídas · {job.erros} erros</p>
    </div>
    {aberto && <div className="mt-3 space-y-3">
      {job.mensagem && <p className="text-sm text-muted-foreground break-words">{job.mensagem}</p>}
      {job.finalizado_em && <p className="text-xs text-muted-foreground">Finalizado em {dataHora(job.finalizado_em)}</p>}
      {resultados.length < job.processados && <p className="text-sm text-muted-foreground">Este lote antigo não preservou todos os resultados individuais.</p>}
      {!resultados.length ? <p className="text-sm text-muted-foreground">Nenhuma conferência registrada neste lote.</p> : <>
        <Table>
          <TableHeader><TableRow><TableHead>Ouvidoria</TableHead><TableHead>Secretaria</TableHead><TableHead>Conferência</TableHead><TableHead>Assunto / Categoria</TableHead><TableHead>Endereço</TableHead><TableHead>Conclusão</TableHead></TableRow></TableHeader>
          <TableBody>{resultados.slice(pagina * 25, pagina * 25 + 25).map((r) => <TableRow key={r.id}>
            <TableCell className="min-w-36"><Button variant="link" size="sm" onClick={() => setDetalhe({ id: r.id })}>{r.numero ?? r.id}</Button>{r.assunto && <p className="text-xs text-muted-foreground break-words">{r.assunto}</p>}</TableCell>
            <TableCell className="min-w-36">{r.secretaria_nome ?? "Não registrada"}</TableCell>
            <TableCell className="min-w-36">{r.erro ? <span className="text-destructive break-words">{r.erro}</span> : "Verificada"}{r.verificado_em && <p className="text-xs text-muted-foreground">{dataHora(r.verificado_em)}</p>}</TableCell>
            <TableCell className="min-w-56 max-w-80 break-words">
              {r.assunto_atualizado && <div><Badge variant="secondary">Assunto atualizado</Badge><p>{r.assunto_novo}</p><p className="text-xs text-muted-foreground">Anterior: {r.assunto_anterior ?? "—"}</p></div>}
              {r.categoria_atualizada && <div className="mt-1"><Badge variant="secondary">Categoria atualizada</Badge><p>{r.categoria_nova}</p><p className="text-xs text-muted-foreground">Anterior: {r.categoria_anterior ?? "—"}</p></div>}
              {!r.assunto_atualizado && !r.categoria_atualizada && "Sem alteração"}
            </TableCell>
            <TableCell className="min-w-56 max-w-80 break-words">
              {r.endereco_atualizado ? <><Badge variant="secondary">Atualizado</Badge><p className="mt-1">{r.endereco_novo}</p>{r.endereco_anterior && <p className="text-xs text-muted-foreground">Anterior: {r.endereco_anterior}</p>}</> : r.endereco_atualizado === false ? "Sem alteração" : "Não registrado"}
              {r.localizacao_atualizada && <p className="text-xs text-muted-foreground">Ponto no mapa atualizado</p>}
            </TableCell>
            <TableCell className="min-w-36">{r.concluido ? <><Badge>Concluída</Badge>{r.data_conclusao && <p className="text-xs mt-1">{r.data_conclusao.split("-").reverse().join("/")}</p>}</> : "Não concluída pelo agente"}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
        {resultados.length > 25 && <div className="flex items-center justify-end gap-2"><Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anteriores</Button><span className="text-xs">{pagina + 1}/{Math.ceil(resultados.length / 25)}</span><Button size="sm" variant="outline" disabled={(pagina + 1) * 25 >= resultados.length} onClick={() => setPagina(pagina + 1)}>Próximas</Button></div>}
      </>}
    </div>}
    <ProtocoloDetailDialog protocolo={detalhe} open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)} />
  </div>;
}

export function OnedocBatchHistory({ secretariaId }: { secretariaId?: string }) {
  const [pagina, setPagina] = useState(0);
  const getHistorico = useServerFn(getOnedocHistorico);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["onedoc-historico", secretariaId ?? "todas", pagina],
    queryFn: () => getHistorico({ data: { pagina, secretariaId } }),
    refetchInterval: (query) => query.state.data?.jobs.some((j) => j.status === "pendente" || j.status === "executando") ? 5000 : false,
  });
  return <section className="space-y-2 border-t pt-5">
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Histórico de conferências em lote</h2><Button size="icon" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar histórico" title="Atualizar histórico"><RefreshCw className="h-4 w-4" /></Button></div>
    {isLoading ? <p className="text-sm text-muted-foreground">Carregando histórico…</p> : error ? <p className="text-sm text-destructive">Não foi possível carregar o histórico.</p> : !data?.jobs.length ? <p className="text-sm text-muted-foreground">Nenhuma conferência em lote registrada.</p> : data.jobs.map((j) => <Lote key={j.id} job={j} />)}
    {(pagina > 0 || (data?.total ?? 0) > 20) && <div className="flex items-center justify-end gap-2"><Button size="sm" variant="outline" disabled={!pagina || isFetching} onClick={() => setPagina(pagina - 1)}>Anteriores</Button><span className="text-sm">Página {pagina + 1}</span><Button size="sm" variant="outline" disabled={isFetching || (pagina + 1) * 20 >= (data?.total ?? 0)} onClick={() => setPagina(pagina + 1)}>Próximas</Button></div>}
  </section>;
}