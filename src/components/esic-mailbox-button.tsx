import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { SearchCheck, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rechecarEsic } from "@/lib/esic-mailbox.functions";
import { esicMailboxCursorSchema, type EsicMailboxCursor } from "@/lib/esic-mailbox";

type Busca = {
  contas: string[]; indice: number; cursor: EsicMailboxCursor;
  lidos: number; encontrados: number; registrados: number; erros: number; pasta: string; ultimoErro?: string;
};

export function EsicMailboxButton({ accountIds, disabled }: { accountIds: string[]; disabled: boolean }) {
  const lote = useServerFn(rechecarEsic);
  const qc = useQueryClient();
  const [busca, setBusca] = useState<Busca | null>(null);
  const [rodando, setRodando] = useState(false);
  const continuar = useRef(false);
  const montado = useRef(true);
  const { user } = getRouteApi("/_authenticated").useRouteContext();
  const storageKey = `ouvidesk-esic-mailbox:${user.id}`;
  useEffect(() => {
    montado.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const salvo = JSON.parse(raw);
        if (esicMailboxCursorSchema.safeParse(salvo.cursor).success && Array.isArray(salvo.contas)) setBusca(salvo);
      }
    } catch { /* Ignore unavailable storage. */ }
    return () => { continuar.current = false; montado.current = false; };
  }, [storageKey]);

  function salvar(b: Busca | null) {
    if (montado.current) setBusca(b);
    try { if (b) sessionStorage.setItem(storageKey, JSON.stringify(b)); else sessionStorage.removeItem(storageKey); } catch { /* Storage optional. */ }
  }
  async function executar(inicio: Busca) {
    continuar.current = true;
    setRodando(true);
    let atual = inicio;
    salvar(atual);
    try {
      while (continuar.current) {
        const r = await lote({ data: atual.cursor });
        const indice = r.proximo ? atual.indice : atual.indice + 1;
        const conta = atual.contas[indice];
        atual = { ...atual, indice, cursor: r.proximo ?? (conta ? { accountId: conta } : atual.cursor),
          lidos: atual.lidos + r.lidos, encontrados: atual.encontrados + r.encontrados,
          registrados: atual.registrados + r.registrados, erros: atual.erros + r.erros, pasta: r.pasta,
          ultimoErro: r.detalhes[0] ?? atual.ultimoErro };
        if (!conta) {
          salvar(null);
          toast[atual.erros ? "warning" : "success"](`Busca completa de e-SIC: ${atual.lidos} e-mails lidos, ${atual.encontrados} encontrados, ${atual.registrados} registrados/vinculados e ${atual.erros} erros.${atual.ultimoErro ? ` ${atual.ultimoErro}` : ""}`, { duration: 15000 });
          break;
        }
        salvar(atual);
      }
    } catch (e) {
      atual = { ...atual, ultimoErro: e instanceof Error ? e.message : "Falha na leitura do e-mail" };
      salvar(atual);
      if (montado.current) toast.error(`Busca pausada: ${atual.ultimoErro}`);
    } finally {
      continuar.current = false;
      if (montado.current) setRodando(false);
      for (const key of ["email-inbox-log", "protocolos", "protocolos-triagem", "triagem-pendentes-count", "triagem-stats", "protocolos-dashboard"]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    }
  }
  function iniciar() {
    if (!confirm("Buscar pedidos e-SIC em toda a caixa de todas as contas ativas, incluindo mensagens antigas e arquivadas? Os novos pedidos entrarão na triagem com a data original do e-mail. Pedidos já vinculados não serão duplicados. Mantenha esta aba aberta; é possível pausar e retomar a busca.")) return;
    const accountId = accountIds[0];
    if (!accountId) return;
    void executar({ contas: accountIds, indice: 0, cursor: { accountId }, lidos: 0, encontrados: 0, registrados: 0, erros: 0, pasta: "Iniciando" });
  }
  return <div className="flex flex-col items-start gap-2 max-w-full">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={disabled || (!busca && accountIds.length === 0)} onClick={() => {
        if (rodando) { continuar.current = false; return; }
        if (busca) void executar(busca); else iniciar();
      }}>
        {rodando ? <Pause className="h-4 w-4 mr-1" /> : busca ? <Play className="h-4 w-4 mr-1" /> : <SearchCheck className="h-4 w-4 mr-1" />}
        {rodando ? "Pausar busca e-SIC" : busca ? "Retomar busca e-SIC" : "Buscar e-SIC em toda a caixa"}
      </Button>
      {busca && !rodando && <Button variant="ghost" onClick={() => { if (confirm("Descartar o progresso da busca? Os pedidos já registrados serão preservados.")) salvar(null); }}>Encerrar busca</Button>}
    </div>
    {busca && <div role="status" className="text-xs text-muted-foreground space-y-1 max-w-lg break-words">
      <p className="flex items-center gap-1">{rodando && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}{rodando ? "Buscando" : "Pausada"} · Conta {busca.indice + 1}/{busca.contas.length} · {busca.pasta}</p>
      <p>{busca.lidos} lidos · {busca.encontrados} e-SIC · {busca.registrados} registrados/vinculados · {busca.erros} erros</p>
      {busca.ultimoErro && <p className="text-destructive">{busca.ultimoErro}</p>}
    </div>}
  </div>;
}
