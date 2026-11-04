import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ScrollText, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { COLUNAS_CARTAO_ESIC, filtrarEsicPorMes, mesesDisponiveisEsic } from "@/lib/esic-lista";

export const Route = createFileRoute("/_authenticated/esic")({
  head: () => ({ meta: [
    { title: "e-SIC | OuviDesk" },
    { name: "description", content: "Todos os pedidos de acesso à informação (e-SIC), com filtro por mês." },
    { property: "og:title", content: "e-SIC | OuviDesk" },
    { property: "og:description", content: "Todos os pedidos de acesso à informação (e-SIC), com filtro por mês." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EsicPage,
});

const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const STATUS: Record<string, string> = { aberto: "Aberto", em_andamento: "Em andamento", concluido: "Concluído", arquivado: "Arquivado" };

function EsicPage() {
  const [mes, setMes] = useState("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<any | null>(null);

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["protocolos", "esic-lista"],
    queryFn: () => fetchAllPaginated<any>((from, to) =>
      supabase.from("protocolos")
        .select(COLUNAS_CARTAO_ESIC)
        .eq("tipo", "esic")
        .order("data_abertura", { ascending: false })
        .range(from, to) as any),
  });

  const meses = useMemo(() => mesesDisponiveisEsic(lista), [lista]);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return filtrarEsicPorMes(lista, mes).filter((p: any) => !t ||
      [p.numero_esic, p.numero, p.assunto, p.solicitante].some(v => String(v ?? "").toLowerCase().includes(t)));
  }, [lista, mes, busca]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScrollText className="h-6 w-6" /> e-SIC</h1>
        <p className="text-sm text-muted-foreground">Todos os pedidos de acesso à informação recebidos.</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {meses.map(m => {
              const [a, mm] = m.split("-");
              return <SelectItem key={m} value={m}>{MESES[Number(mm) - 1]} de {a}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8 w-64" placeholder="Buscar nº, assunto, solicitante" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtrados.length} pedido(s)</span>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : filtrados.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum pedido e-SIC neste período.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((p: any) => (
            <Card key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setAberto(p)}>
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">e-SIC {p.numero_esic ?? p.numero}</p>
                  <p className="text-sm truncate">{p.assunto || "(sem assunto)"}</p>
                  <p className="text-xs text-muted-foreground">{p.solicitante || "—"}{p.secretarias?.nome ? ` · ${p.secretarias.nome}` : ""}</p>
                </div>
                <div className="text-right space-y-1">
                  <Badge variant="outline">{STATUS[p.status] ?? p.status}</Badge>
                  <p className="text-xs text-muted-foreground">{p.data_abertura ? format(new Date(p.data_abertura), "dd/MM/yyyy") : "—"}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ProtocoloDetailDialog protocolo={aberto} open={!!aberto} onOpenChange={v => !v && setAberto(null)} />
    </div>
  );
}
