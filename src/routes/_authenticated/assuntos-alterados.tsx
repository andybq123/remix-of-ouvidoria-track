import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Undo2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { assuntosSuspeitos, type Suspeito } from "@/lib/assuntos-alterados";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/assuntos-alterados")({
  head: () => ({
    meta: [
      { title: "Assuntos alterados — OuviDesk" },
      { name: "description", content: "Ouvidorias com o assunto trocado automaticamente, para correção individual." },
      { property: "og:title", content: "Assuntos alterados — OuviDesk" },
      { property: "og:description", content: "Corrija o assunto das ouvidorias afetadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const dataHora = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

function Linha({ s, onSalvo }: { s: Suspeito; onSalvo: () => void }) {
  const [valor, setValor] = useState(s.anterior ?? s.assunto ?? "");
  const [salvando, setSalvando] = useState(false);
  async function salvar(novo: string) {
    if (!novo.trim()) { toast.error("Informe o assunto"); return; }
    setSalvando(true);
    const { error } = await supabase.from("protocolos").update({ assunto: novo.trim() }).eq("id", s.id);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Assunto da ouvidoria ${s.numero} corrigido`);
    onSalvo();
  }
  return <TableRow>
    <TableCell className="font-mono whitespace-nowrap">{s.numero}</TableCell>
    <TableCell className="min-w-40">{s.assunto}<p className="text-xs text-muted-foreground">{s.motivo === "automatico" ? "Trocado automaticamente" : "Igual ao nome de secretaria"} · {dataHora(s.alterado_em)}</p></TableCell>
    <TableCell className="min-w-32">{s.anterior ?? <span className="text-muted-foreground">Não registrado</span>}</TableCell>
    <TableCell className="min-w-64">
      <div className="flex gap-2">
        <Input value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Novo assunto da ouvidoria ${s.numero}`} />
        <Button size="sm" onClick={() => salvar(valor)} disabled={salvando}><Save className="h-4 w-4 mr-1" />Salvar</Button>
        {s.anterior && <Button size="sm" variant="outline" onClick={() => salvar(s.anterior!)} disabled={salvando} title="Voltar ao assunto anterior"><Undo2 className="h-4 w-4" /></Button>}
      </div>
    </TableCell>
  </TableRow>;
}

function Pagina() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const { data = [], isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["assuntos-alterados"],
    enabled: isAdmin,
    queryFn: async () => {
      const [hist, prots, secs] = await Promise.all([
        fetchAllPaginated((f, t) => supabase.from("protocolo_historico").select("protocolo_id, valor_anterior, valor_novo, autor_id, created_at").eq("campo", "assunto").order("created_at").range(f, t)),
        fetchAllPaginated((f, t) => supabase.from("protocolos").select("id, numero, assunto").eq("tipo", "ouvidoria").order("numero").range(f, t)),
        supabase.from("secretarias").select("nome"),
      ]);
      return assuntosSuspeitos(prots as any, hist as any, (secs.data ?? []).map((s: any) => s.nome));
    },
  });
  if (!isAdmin) return <p className="p-6 text-muted-foreground">Acesso restrito a administradores.</p>;
  const atualizar = () => { qc.invalidateQueries({ queryKey: ["assuntos-alterados"] }); qc.invalidateQueries({ queryKey: ["protocolos"] }); };
  return <div className="space-y-6 max-w-6xl">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Assuntos alterados</CardTitle>
          <CardDescription>Ouvidorias cujo assunto foi trocado sem ação de um usuário ou ficou igual ao nome de uma secretaria. Corrija uma a uma; após salvar, ela sai da lista.</CardDescription>
        </div>
        <Button size="icon" variant="ghost" onClick={() => refetch()} disabled={isFetching} aria-label="Procurar novamente"><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Procurando ouvidorias…</p>
          : error ? <p className="text-sm text-destructive">Não foi possível procurar.</p>
          : !data.length ? <p className="text-sm text-muted-foreground">Nenhuma ouvidoria afetada encontrada.</p>
          : <>
            <Badge variant="secondary" className="mb-3">{data.length} para corrigir</Badge>
            <Table>
              <TableHeader><TableRow><TableHead>Ouvidoria</TableHead><TableHead>Assunto atual</TableHead><TableHead>Assunto anterior</TableHead><TableHead>Corrigir</TableHead></TableRow></TableHeader>
              <TableBody>{data.map((s) => <Linha key={s.id} s={s} onSalvo={atualizar} />)}</TableBody>
            </Table>
          </>}
      </CardContent>
    </Card>
  </div>;
}
