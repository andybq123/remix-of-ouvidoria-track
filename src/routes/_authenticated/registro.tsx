import { createFileRoute } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, Lock } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/registro")({
  head: () => ({ meta: [
    { title: "Registro do sistema | OuviDesk" },
    { name: "description", content: "Todas as alterações feitas no sistema, por usuário." },
    { property: "og:title", content: "Registro do sistema | OuviDesk" },
    { property: "og:description", content: "Todas as alterações feitas no sistema, por usuário." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RegistroPage,
});

const TABELAS: Record<string, string> = {
  protocolos: "Ouvidorias",
  secretarias: "Secretarias",
  locais: "Locais",
  assuntos: "Assuntos",
  allowed_emails: "Usuários",
  user_secretarias: "Áreas de usuários",
  user_roles: "Perfis de acesso",
  user_locais: "Locais de usuários",
  secretaria_responsaveis: "Responsáveis",
};
const OPERACOES: Record<string, { label: string; cls: string }> = {
  insert: { label: "Criou", cls: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" },
  update: { label: "Alterou", cls: "bg-sky-600/15 text-sky-700 dark:text-sky-400" },
  delete: { label: "Excluiu", cls: "bg-destructive/15 text-destructive" },
};
const POR_PAGINA = 50;

function valor(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

function RegistroPage() {
  const isAdmin = useIsAdmin();
  const [tabela, setTabela] = useState("todas");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<number | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["registro-sistema", tabela, busca, pagina],
    enabled: isAdmin,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("registro_sistema").select("*", { count: "exact" })
        .neq("tabela", "licenca_estado")
        .order("created_at", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (tabela !== "todas") q = q.eq("tabela", tabela);
      const t = busca.trim().replace(/[,()%]/g, " ");
      if (t) q = q.or(`autor_nome.ilike.%${t}%,autor_email.ilike.%${t}%,resumo.ilike.%${t}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  if (!isAdmin) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
      <Lock className="h-6 w-6 mx-auto mb-2" />Apenas administradores veem o registro do sistema.
    </CardContent></Card>;
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScrollText className="h-6 w-6" /> Registro do sistema</h1>
        <p className="text-sm text-muted-foreground">Toda criação, alteração e exclusão feita por qualquer usuário fica registrada aqui. {total} registro(s).</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={tabela} onValueChange={(v) => { setTabela(v); setPagina(0); }}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Tudo</SelectItem>
            {Object.entries(TABELAS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="max-w-xs" placeholder="Buscar por usuário, nº ou nome…" value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(0); }} />
      </div>
      <div className="space-y-2">
        {rows.length === 0 && !isFetching && <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>}
        {rows.map((r: any) => {
          const op = OPERACOES[r.operacao] ?? { label: r.operacao, cls: "" };
          const campos: string[] = r.operacao === "update" ? r.campos : Object.keys((r.dados_novos ?? r.dados_anteriores) ?? {});
          return (
            <Card key={r.id}>
              <CardContent className="py-3 px-4 space-y-2">
                <button type="button" className="w-full text-left flex flex-wrap items-center gap-2 text-sm"
                  onClick={() => setAberto(aberto === r.id ? null : r.id)}>
                  <span className="text-muted-foreground tabular-nums">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                  <span className="font-medium break-words">{r.autor_nome || r.autor_email || "Autor não identificado"}</span>
                  {r.autor_nome && r.autor_email && <span className="text-muted-foreground break-all">({r.autor_email})</span>}
                  <Badge variant="outline" className={op.cls}>{op.label}</Badge>
                  <span>{TABELAS[r.tabela] ?? r.tabela}</span>
                  {r.resumo && <span className="font-medium">· {r.resumo}</span>}
                  {r.operacao === "update" && <span className="text-xs text-muted-foreground">({r.campos.join(", ")})</span>}
                </button>
                {aberto === r.id && (
                  <div className="text-xs border-t pt-2 space-y-1">
                    {r.autor_email && <div className="text-muted-foreground">E-mail: {r.autor_email}</div>}
                    {campos.map((c) => (
                      <div key={c} className="grid grid-cols-[140px_1fr_1fr] gap-2">
                        <span className="font-medium">{c}</span>
                        <span className="text-destructive break-all">{r.dados_anteriores ? valor(r.dados_anteriores[c]) : ""}</span>
                        <span className="text-emerald-700 dark:text-emerald-400 break-all">{r.dados_novos ? valor(r.dados_novos[c]) : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
        <span className="text-sm text-muted-foreground">Página {pagina + 1} de {paginas}</span>
        <Button size="sm" variant="outline" disabled={pagina + 1 >= paginas} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
      </div>
    </div>
  );
}
