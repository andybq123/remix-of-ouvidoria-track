import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DatabaseBackup, Download, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  BACKUP_GRUPOS, BACKUP_TABELAS, emLotes, normalizarLinhaCsv, parseCsv,
  type BackupTabela,
} from "@/lib/backup-config";
import {
  backupExportarTabela, backupExportarUsuarios, backupImportarTabela, backupImportarUsuarios,
  backupEstadoImportacao,
} from "@/lib/backup.functions";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({
    meta: [
      { title: "Backup — OuviDesk" },
      { name: "description", content: "Faça backup e restaure protocolos, usuários, secretarias e assuntos." },
      { property: "og:title", content: "Backup — OuviDesk" },
      { property: "og:description", content: "Backup e restauração dos dados do sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

type Arquivo = {
  tabelas: Partial<Record<BackupTabela, Record<string, unknown>[]>>;
  usuarios: Record<string, unknown>[] | null;
  origem: string;
};

const todosGrupos = () => Object.fromEntries(BACKUP_GRUPOS.map((g) => [g.id, true]));

function baixar(bytes: Uint8Array, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function lerZip(buf: Uint8Array): Arquivo {
  const files = unzipSync(buf);
  const tabelas: Arquivo["tabelas"] = {};
  let usuarios: Arquivo["usuarios"] = null;
  let origem = "";
  for (const [caminho, conteudo] of Object.entries(files)) {
    const nome = caminho.split("/").pop() ?? "";
    const base = nome.replace(/\.(json|csv)$/, "") as BackupTabela;
    if (nome === "usuarios.json") { usuarios = JSON.parse(strFromU8(conteudo)); origem = "painel"; continue; }
    if (!(BACKUP_TABELAS as readonly string[]).includes(base)) continue;
    if (nome.endsWith(".json") && caminho.includes("tabelas/")) {
      tabelas[base] = JSON.parse(strFromU8(conteudo)); origem ||= "painel";
    } else if (nome.endsWith(".csv")) {
      tabelas[base] = parseCsv(strFromU8(conteudo)).map(normalizarLinhaCsv); origem ||= "csv";
    }
  }
  // Backup antigo (CSV) não traz as contas de login: monta a partir dos perfis.
  if (!usuarios && tabelas.profiles) {
    usuarios = tabelas.profiles.map((p) => ({ id: p.id, email: p.email, nome: p.nome, created_at: p.created_at, senha_hash: null }));
  }
  return { tabelas, usuarios, origem };
}

function BackupPage() {
  const isAdmin = useIsAdmin();
  const exportarTabela = useServerFn(backupExportarTabela);
  const exportarUsuarios = useServerFn(backupExportarUsuarios);
  const importarTabela = useServerFn(backupImportarTabela);
  const importarUsuarios = useServerFn(backupImportarUsuarios);
  const estadoImportacao = useServerFn(backupEstadoImportacao);
  const qc = useQueryClient();
  const { data: manutencao } = useQuery({
    queryKey: ["backup-estado-importacao"],
    queryFn: () => estadoImportacao(),
    enabled: !!isAdmin,
  });

  const [selExp, setSelExp] = useState<Record<string, boolean>>(todosGrupos);
  const [selImp, setSelImp] = useState<Record<string, boolean>>(todosGrupos);
  const [progresso, setProgresso] = useState<{ pct: number; texto: string } | null>(null);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const ocupado = progresso !== null;

  async function fazerBackup() {
    const grupos = BACKUP_GRUPOS.filter((g) => selExp[g.id]);
    if (!grupos.length) return toast.error("Selecione pelo menos um item.");
    const tabelas = BACKUP_TABELAS.filter((t) => grupos.some((g) => g.tabelas.includes(t)));
    const files: Record<string, Uint8Array> = {};
    const contagem: Record<string, number> = {};
    try {
      for (let i = 0; i < tabelas.length; i++) {
        const t = tabelas[i];
        const rows: Record<string, unknown>[] = [];
        for (let from = 0; ; from += 1000) {
          setProgresso({ pct: (i / tabelas.length) * 100, texto: `Copiando ${t} (${rows.length})...` });
          const r = await exportarTabela({ data: { tabela: t, from, to: from + 999 } });
          rows.push(...r.rows);
          if (r.rows.length < 1000) break;
        }
        files[`tabelas/${t}.json`] = strToU8(JSON.stringify(rows));
        contagem[t] = rows.length;
      }
      if (grupos.some((g) => g.usuarios)) {
        setProgresso({ pct: 98, texto: "Copiando contas de acesso..." });
        const u = await exportarUsuarios();
        files["usuarios.json"] = strToU8(JSON.stringify(u.rows));
        contagem.usuarios = u.rows.length;
      }
      files["manifesto.json"] = strToU8(JSON.stringify({
        formato: "controle-seta-backup", versao: 1, criado_em: new Date().toISOString(),
        grupos: grupos.map((g) => g.id), contagem,
      }, null, 2));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      baixar(zipSync(files, { level: 6 }), `backup-seta-${stamp}.zip`);
      toast.success("Backup gerado e baixado.");
    } catch (e: any) {
      toast.error(`Falha no backup: ${e.message}`);
    } finally {
      setProgresso(null);
    }
  }

  async function escolherArquivo(f: File | undefined) {
    if (!f) return;
    try {
      const a = lerZip(new Uint8Array(await f.arrayBuffer()));
      if (!Object.keys(a.tabelas).length) throw new Error("Nenhum dado reconhecido no arquivo.");
      setArquivo(a); setNomeArquivo(f.name);
      setSelImp(Object.fromEntries(BACKUP_GRUPOS.map((g) => [g.id,
        (!manutencao?.ingestaoPausada || g.id === "protocolos") && g.tabelas.some((t) => a.tabelas[t]?.length),
      ])));
    } catch (e: any) {
      toast.error(`Arquivo inválido: ${e.message}`);
      setArquivo(null);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function restaurar() {
    if (!arquivo) return;
    const grupos = BACKUP_GRUPOS.filter((g) => selImp[g.id]);
    if (!grupos.length) return toast.error("Selecione pelo menos um item.");
    if (manutencao?.ingestaoPausada && grupos.some(g => ["emails", "coletas", "ia"].includes(g.id))) {
      return toast.error("Durante esta importação, logs/coletas/IA devem permanecer limpos. Configure IA manualmente depois.");
    }
    if (!confirm("Os registros do arquivo serão gravados no sistema (os que já existem serão atualizados). Continuar?")) return;
    const tabelas = BACKUP_TABELAS.filter((t) => grupos.some((g) => g.tabelas.includes(t)) && arquivo.tabelas[t]?.length);
    const total = tabelas.reduce((s, t) => s + (arquivo.tabelas[t]?.length ?? 0), 0) || 1;
    let feitos = 0;
    const resumo: string[] = [];
    try {
      if (grupos.some((g) => g.usuarios) && arquivo.usuarios?.length) {
        setProgresso({ pct: 0, texto: "Restaurando contas de acesso..." });
        const r = await importarUsuarios({ data: { rows: arquivo.usuarios } });
        resumo.push(`${r.importados} contas`);
        if (r.pulados) resumo.push(`${r.pulados} contas puladas (e-mail já existe com outro cadastro)`);
      }
      for (const t of tabelas) {
        let rows = arquivo.tabelas[t]!;
        // Nunca apaga chaves de IA já salvas com um backup que não tem chave.
        if (t === "ai_config") {
          rows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => !(k.endsWith("api_key") && !v))));
        }
        let gravados = 0;
        for (const lote of emLotes(rows)) {
          setProgresso({ pct: (feitos / total) * 100, texto: `Restaurando ${t} (${gravados}/${rows.length})...` });
          const r = await importarTabela({ data: { tabela: t, rows: lote } });
          gravados += r.gravados;
          feitos += lote.length;
        }
        resumo.push(`${t}: ${gravados}`);
      }
      invalidateProtocoloCaches(qc);
      toast.success("Importação concluída", { description: resumo.join(" • "), duration: 15000 });
      if (arquivo.origem === "csv" && grupos.some((g) => g.usuarios)) {
        toast.info("Esse backup não tinha senhas: defina uma nova senha para cada usuário na tela Usuários.", { duration: 15000 });
      }
    } catch (e: any) {
      toast.error(`Falha na importação: ${e.message}`, { duration: 15000 });
    } finally {
      setProgresso(null);
    }
  }

  if (!isAdmin) {
    return <p className="text-muted-foreground">Apenas administradores podem acessar o backup.</p>;
  }

  const Lista = ({ sel, setSel, contar }: {
    sel: Record<string, boolean>; setSel: (v: Record<string, boolean>) => void;
    contar?: (t: BackupTabela[], u?: boolean) => number | null;
  }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {BACKUP_GRUPOS.map((g) => {
        const n = contar?.(g.tabelas, g.usuarios);
        const bloqueado = !!contar && !!manutencao?.ingestaoPausada && ["emails", "coletas", "ia"].includes(g.id);
        const desabilitado = bloqueado || (contar ? !n : false);
        return (
          <label key={g.id} className={`flex gap-3 rounded-lg border p-3 ${desabilitado ? "opacity-50" : "cursor-pointer hover:bg-accent/40"}`}>
            <Checkbox
              checked={!!sel[g.id] && !desabilitado}
              disabled={desabilitado || ocupado}
              onCheckedChange={(v) => setSel({ ...sel, [g.id]: !!v })}
            />
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2">
                {g.titulo}
                {contar && <Badge variant="secondary">{n ?? 0}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{g.descricao}</div>
              {bloqueado && <div className="text-xs text-amber-700 dark:text-amber-300">Não importar durante a preparação da base limpa.</div>}
            </div>
          </label>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <DatabaseBackup className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Backup</h1>
      </div>

      {manutencao?.ingestaoPausada && (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <strong>Ingestão pausada para importação.</strong> As contas de e-mail foram preservadas, mas novas coletas estão bloqueadas. Importe e confira o backup; depois execute <code>./retomar_ingestao.sh</code> na VPS.
          {manutencao.iaBloqueada && <p className="mt-2">A configuração de IA foi limpa. As chaves antigas do arquivo não serão restauradas automaticamente; configure a IA novamente quando necessário.</p>}
        </div>
      )}

      {progresso && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="text-sm">{progresso.texto}</div>
            <Progress value={progresso.pct} />
            <div className="text-xs text-muted-foreground">Não feche esta página até terminar.</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Fazer backup</CardTitle>
          <CardDescription>Escolha o que copiar. Será baixado um arquivo .zip para o seu computador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Lista sel={selExp} setSel={setSelExp} />
          <Button onClick={fazerBackup} disabled={ocupado}>
            <Download className="h-4 w-4 mr-2" /> Gerar backup
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Importar backup</CardTitle>
          <CardDescription>
            Aceita arquivos gerados nesta tela e o backup antigo em CSV (pasta "dados"). Os IDs são mantidos,
            então as ligações entre protocolos, secretarias e usuários continuam iguais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={ocupado}>
            <Upload className="h-4 w-4 mr-2" /> Escolher arquivo .zip
          </Button>
          {arquivo && (
            <>
              <div className="text-sm">Arquivo: <span className="font-medium">{nomeArquivo}</span></div>
              <Lista
                sel={selImp}
                setSel={setSelImp}
                contar={(ts, u) => {
                  const n = ts.reduce((s, t) => s + (arquivo.tabelas[t]?.length ?? 0), 0);
                  return u ? Math.max(n, arquivo.usuarios?.length ?? 0) : n;
                }}
              />
              <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <span>Faça um backup do sistema atual antes de importar. Registros com o mesmo ID serão substituídos pelos do arquivo.</span>
              </div>
              <Button onClick={restaurar} disabled={ocupado}>
                <Upload className="h-4 w-4 mr-2" /> Importar selecionados
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
