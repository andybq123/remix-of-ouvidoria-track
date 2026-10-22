import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2Off, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";
import { link1docParaSalvar } from "@/lib/url-1doc";

export const Route = createFileRoute("/_authenticated/sem-link-1doc")({
  head: () => ({
    meta: [
      { title: "Ouvidorias sem link 1Doc — OuviDesk" },
      { name: "description", content: "Liste e cadastre o link do 1Doc das ouvidorias que ainda não têm." },
      { property: "og:title", content: "Ouvidorias sem link 1Doc — OuviDesk" },
      { property: "og:description", content: "Cadastro rápido de links do 1Doc." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SemLinkPage,
});

type Row = { id: string; numero: string; assunto: string | null; secretarias: { nome: string } | null };
const KEY = ["sem-link-1doc"];

function SemLinkPage() {
  const isAdmin = useIsAdmin();
  const [busca, setBusca] = useState("");
  const { data = [], isLoading } = useQuery({
    queryKey: KEY,
    enabled: isAdmin,
    queryFn: async () => {
      const all: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("protocolos")
          .select("id, numero, assunto, secretarias(nome)")
          .or("url.is.null,url.eq.")
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as unknown as Row[]));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  if (!isAdmin) return <p className="text-muted-foreground">Acesso restrito a administradores.</p>;
  const q = busca.trim().toLowerCase();
  const lista = q ? data.filter(r => `${r.numero} ${r.assunto ?? ""} ${r.secretarias?.nome ?? ""}`.toLowerCase().includes(q)) : data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Link2Off className="h-5 w-5" /> Ouvidorias sem link do 1Doc ({data.length})</CardTitle>
        <CardDescription>Cole o link e salve; a ouvidoria sai da lista.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Buscar por número, assunto ou secretaria…" value={busca} onChange={e => setBusca(e.target.value)} />
        {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
          : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ouvidoria sem link.</p>
          : <div className="divide-y rounded-md border">{lista.map(r => <Linha key={r.id} row={r} />)}</div>}
      </CardContent>
    </Card>
  );
}

function Linha({ row }: { row: Row }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const salvar = useMutation({
    mutationFn: async () => {
      const link = link1docParaSalvar(value);
      if (!link) throw new Error("Informe o link do 1Doc.");
      const { error } = await supabase.from("protocolos").update({ url: link }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.setQueryData<Row[]>(KEY, old => old?.filter(r => r.id !== row.id));
      invalidateProtocoloCaches(qc);
      toast.success(`Link salvo na ouvidoria ${row.numero}`);
    },
    onError: e => toast.error(e instanceof Error ? e.message : "Não foi possível salvar"),
  });
  return (
    <div className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
      <div className="min-w-0 md:w-80">
        <div className="font-medium">{row.numero}</div>
        <div className="truncate text-xs text-muted-foreground">{row.assunto ?? "—"} · {row.secretarias?.nome ?? "Sem secretaria"}</div>
      </div>
      <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); salvar.mutate(); }}>
        <Input type="url" value={value} onChange={e => setValue(e.target.value)} placeholder="https://brusque.1doc.com.br/…" className="min-w-0 flex-1" disabled={salvar.isPending} />
        <Button type="submit" variant="outline" disabled={!value.trim() || salvar.isPending}>
          <Save className="mr-1.5 h-4 w-4" />{salvar.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
    </div>
  );
}
