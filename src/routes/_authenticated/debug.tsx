import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bug, Pencil, Trash2, Search, AlertTriangle, RefreshCw, MapPin, Upload, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { MapPointPicker } from "@/components/map-point-picker";
import { BACKUP_GRUPOS, BACKUP_TABELAS } from "@/lib/backup-config";
import {
  debugContagens,
  debugExcluir,
  debugListar,
  debugListarSecretariasMapIcons,
  debugAtualizarSecretariaMapIcon,
  debugSalvar,
  debugZerar,
  corrigirAcentosDados,
} from "@/lib/debug.functions";
import { mapDepartmentOf } from "@/lib/map-departments";
import { obterIconeSecretaria, SECRETARIA_ICONES } from "@/lib/secretaria-map-icons";
import {
  aplicarImportacaoProtocolosMapa,
  previsualizarImportacaoProtocolosMapa,
  type ProtocolMapPreviewRow,
} from "@/lib/protocol-map-import.functions";
import { MAX_PROTOCOL_MAP_IMPORT_LINES } from "@/lib/protocol-map-import.shared";

export const Route = createFileRoute("/_authenticated/debug")({
  head: () => ({
    meta: [
      { title: "Debug — OuviDesk" },
      { name: "description", content: "Edite registros do sistema e zere partes dos dados." },
      { property: "og:title", content: "Debug — OuviDesk" },
      { property: "og:description", content: "Ferramentas de administração dos dados do sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DebugPage,
});

const NOMES: Record<string, string> = {
  protocolos: "Protocolos",
  protocolo_historico: "Histórico de protocolos",
  protocolos_antigos_conclusoes: "Conclusões de protocolos antigos",
  secretarias: "Secretarias",
  locais: "Locais",
  secretaria_responsaveis: "Responsáveis das secretarias",
  assuntos: "Assuntos",
  allowed_emails: "E-mails autorizados",
  profiles: "Perfis de usuário",
  user_roles: "Permissões",
  email_inbox_accounts: "Contas de e-mail",
  email_inbox_log: "E-mails coletados",
  coletas: "Coletas do 1doc",
  ai_config: "Configuração de IA",
};

const resumoLinha = (r: Record<string, any>) =>
  [r.numero, r.nome, r.email, r.assunto, r.campo, r.remetente, r.provider, r.role]
    .filter(Boolean).slice(0, 3).join(" • ") || String(r.id);

type ImportRowView = ProtocolMapPreviewRow & { selected: boolean; candidateIndex: number };

function DebugPage() {
  const isAdmin = useIsAdmin();
  const qc = useQueryClient();
  const contar = useServerFn(debugContagens);
  const listar = useServerFn(debugListar);
  const salvar = useServerFn(debugSalvar);
  const excluir = useServerFn(debugExcluir);
  const zerar = useServerFn(debugZerar);
  const corrigirAcentosFn = useServerFn(corrigirAcentosDados);
  const previewImportFn = useServerFn(previsualizarImportacaoProtocolosMapa);
  const applyImportFn = useServerFn(aplicarImportacaoProtocolosMapa);
  const listarSecretariasMapIconsFn = useServerFn(debugListarSecretariasMapIcons);
  const atualizarSecretariaMapIconFn = useServerFn(debugAtualizarSecretariaMapIcon);
  const [corrigindo, setCorrigindo] = useState(false);
  const [textoImportacaoMapa, setTextoImportacaoMapa] = useState("");
  const [previewImportacaoMapa, setPreviewImportacaoMapa] = useState<ImportRowView[]>([]);
  const [mapPickerLine, setMapPickerLine] = useState<number | null>(null);
  const [previsualizandoMapa, setPrevisualizandoMapa] = useState(false);
  const [importandoMapa, setImportandoMapa] = useState(false);
  const [sobrescreverCoordenadas, setSobrescreverCoordenadas] = useState(false);
  const [salvandoIconeSecretariaId, setSalvandoIconeSecretariaId] = useState<string | null>(null);
  const corrigirAcentosClick = async () => {
    setCorrigindo(true);
    try {
      const r = await corrigirAcentosFn();
      const total = Object.values(r.resultado).reduce((a, b) => a + b, 0);
      toast.success(total ? `${total} registro(s) corrigido(s).` : "Nenhum acento quebrado encontrado.");
      if (r.restantes) toast.warning(`${r.restantes} texto(s) ainda têm palavras que não consegui adivinhar; edite-os manualmente.`);
      qc.invalidateQueries();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao corrigir"); }
    finally { setCorrigindo(false); }
  };

  const [tabela, setTabela] = useState<string>("protocolos");
  const [pagina, setPagina] = useState(0);
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [editando, setEditando] = useState<Record<string, any> | null>(null);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [selZerar, setSelZerar] = useState<Record<string, boolean>>({});
  const [confirmacao, setConfirmacao] = useState("");
  const [zerando, setZerando] = useState(false);

  const contagens = useQuery({ queryKey: ["debug-contagens"], queryFn: () => contar(), enabled: isAdmin });
  const lista = useQuery({
    queryKey: ["debug-lista", tabela, pagina, buscaAtiva],
    queryFn: () => listar({ data: { tabela, pagina, busca: buscaAtiva } }),
    enabled: isAdmin,
  });
  const secretariasMapIcons = useQuery({
    queryKey: ["debug-secretarias-map-icons"],
    queryFn: () => listarSecretariasMapIconsFn(),
    enabled: isAdmin,
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["debug-lista"] });
    qc.invalidateQueries({ queryKey: ["debug-contagens"] });
  };

  async function salvarIconeSecretaria(id: string, icone: string | null) {
    setSalvandoIconeSecretariaId(id);
    try {
      await atualizarSecretariaMapIconFn({ data: { id, icone } });
      toast.success("Ícone da secretaria atualizado.");
      await qc.invalidateQueries();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar o ícone.");
    } finally {
      setSalvandoIconeSecretariaId(null);
    }
  }

  async function salvarEdicao() {
    if (!editando) return;
    let valores: Record<string, any>;
    try { valores = JSON.parse(texto); } catch { return toast.error("Texto inválido: confira vírgulas e aspas."); }
    setSalvando(true);
    try {
      await salvar({ data: { tabela, id: String(editando.id), valores } });
      toast.success("Registro salvo.");
      setEditando(null); recarregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  }

  async function apagar(r: Record<string, any>) {
    if (!confirm(`Apagar este registro de ${NOMES[tabela]}?\n\n${resumoLinha(r)}`)) return;
    try { await excluir({ data: { tabela, id: String(r.id) } }); toast.success("Registro apagado."); recarregar(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function executarZerar() {
    const grupos = Object.keys(selZerar).filter((k) => selZerar[k]);
    if (!grupos.length) return toast.error("Selecione o que deseja zerar.");
    setZerando(true);
    try {
      const r = await zerar({ data: { grupos, confirmacao } });
      toast.success("Dados apagados", {
        description: Object.entries(r).map(([k, v]) => `${NOMES[k] ?? "Contas de acesso"}: ${v}`).join(" • "),
        duration: 15000,
      });
      setSelZerar({}); setConfirmacao(""); recarregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setZerando(false); }
  }

  async function previsualizarImportacaoMapa() {
    if (!textoImportacaoMapa.trim()) return toast.error("Cole os protocolos no campo antes de pré-visualizar.");
    setPrevisualizandoMapa(true);
    setPreviewImportacaoMapa([]);
    try {
      const resultado = await previewImportFn({ data: { text: textoImportacaoMapa } });
      const linhas = resultado.rows.map((row) => ({
        ...row,
        selected: row.status === "pronto" && !!row.protocolId && !row.hasCoordinates && row.candidates.length === 1,
        candidateIndex: 0,
      }));
      setPreviewImportacaoMapa(linhas);
      const prontos = linhas.filter((row) => row.status === "pronto").length;
      toast.success(`Prévia pronta: ${prontos} protocolo(s) com endereço localizado.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao pré-visualizar a importação.");
    } finally {
      setPrevisualizandoMapa(false);
    }
  }

  async function aplicarImportacaoMapa() {
    const selecionadas = previewImportacaoMapa.filter(
      (row) => row.selected && row.status === "pronto" && row.protocolId && row.candidates[row.candidateIndex]
        && (!row.hasCoordinates || sobrescreverCoordenadas),
    );
    if (!selecionadas.length) return toast.error("Selecione ao menos um protocolo pronto para importar.");

    setImportandoMapa(true);
    try {
      const resultado = await applyImportFn({
        data: {
          sobrescrever: sobrescreverCoordenadas,
          rows: selecionadas.map((row) => {
            const candidate = row.candidates[row.candidateIndex];
            return {
              protocolId: row.protocolId!,
              numero: row.numeroPersistido ?? row.numero,
              endereco: row.endereco,
              latitude: candidate.latitude,
              longitude: candidate.longitude,
            };
          }),
        },
      });
      const resumo = `${resultado.atualizados.length} atualizado(s)`
        + (resultado.ignorados.length ? ` · ${resultado.ignorados.length} ignorado(s)` : "")
        + (resultado.erros.length ? ` · ${resultado.erros.length} erro(s)` : "");
      if (resultado.atualizados.length) toast.success(resumo, { duration: 12000 });
      else toast.warning(resumo, { duration: 12000 });
      if (resultado.erros.length) toast.error(resultado.erros.slice(0, 3).join("\n"), { duration: 15000 });
      setPreviewImportacaoMapa([]);
      qc.invalidateQueries();
      recarregar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar os protocolos.");
    } finally {
      setImportandoMapa(false);
    }
  }

  function selecionarPontosSemCoordenadas(selecionado: boolean) {
    setPreviewImportacaoMapa((rows) => rows.map((row) => ({
      ...row,
      selected: selecionado && row.status === "pronto" && !!row.protocolId && !row.hasCoordinates && row.candidates.length === 1,
    })));
  }

  function alterarSelecaoImportacao(line: number, selected: boolean) {
    setPreviewImportacaoMapa((rows) => rows.map((row) => row.line === line ? { ...row, selected } : row));
  }

  function alterarCandidatoImportacao(line: number, candidateIndex: number) {
    setPreviewImportacaoMapa((rows) => rows.map((row) => row.line === line
      ? { ...row, candidateIndex, selected: row.status === "pronto" && !row.hasCoordinates }
      : row));
  }

  function selecionarProtocoloImportacao(line: number, protocolId: string) {
    setPreviewImportacaoMapa((rows) => rows.map((row) => {
      if (row.line !== line) return row;
      const protocol = row.protocolMatches?.find((match) => match.id === protocolId);
      if (!protocol) return row;
      const status = row.geocodeStatus ?? "erro";
      return {
        ...row,
        protocolId: protocol.id,
        numeroPersistido: protocol.numero,
        assunto: protocol.assunto,
        secretaria: protocol.secretaria,
        currentEndereco: protocol.currentEndereco,
        hasCoordinates: protocol.hasCoordinates,
        status,
        message: row.geocodeMessage ?? row.message,
        selected: status === "pronto" && !protocol.hasCoordinates && row.candidates.length === 1,
      };
    }));
  }

  function confirmarPontoManual(latitude: number, longitude: number, enderecoReverso?: string) {
    const line = mapPickerLine;
    if (line == null) return;
    if (latitude < -27.3 || latitude > -26.9 || longitude < -49.1 || longitude > -48.7) {
      toast.error("Escolha um ponto dentro da área de Brusque.");
      return;
    }
    setPreviewImportacaoMapa((rows) => rows.map((row) => row.line === line
      ? {
          ...row,
          endereco: row.endereco || enderecoReverso || "Ponto escolhido manualmente",
          candidates: [{
            placeId: `manual-${line}`,
            latitude,
            longitude,
            displayName: enderecoReverso || "Ponto escolhido manualmente no mapa",
          }],
          candidateIndex: 0,
          geocodeStatus: "pronto",
          geocodeMessage: "Ponto definido manualmente no mapa.",
          status: row.protocolId ? "pronto" : row.status,
          message: row.protocolId ? "Ponto definido manualmente no mapa." : row.message,
          selected: !!row.protocolId && (!row.hasCoordinates || sobrescreverCoordenadas),
        }
      : row));
    setMapPickerLine(null);
    toast.success("Ponto manual adicionado à prévia.");
  }

  if (!isAdmin) return <p className="text-muted-foreground">Apenas administradores podem acessar o debug.</p>;

  const totalPaginas = lista.data ? Math.max(1, Math.ceil(lista.data.total / lista.data.tam)) : 1;
  const c = contagens.data ?? {};
  const pontoPickerRow = previewImportacaoMapa.find((row) => row.line === mapPickerLine);
  const pontoPickerCandidate = pontoPickerRow?.candidates[pontoPickerRow.candidateIndex];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bug className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Debug</h1>
        </div>
        <Button variant="outline" size="sm" onClick={recarregar}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
        <span>Alterações feitas aqui são definitivas. Faça um backup em Configurações → Backup antes de mexer.</span>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Importar protocolos para o mapa
          </CardTitle>
          <CardDescription>
            Cole um protocolo por linha no formato <strong>número — endereço</strong>. O sistema confere o número, procura o endereço em Brusque e mostra a prévia antes de salvar.
            A busca aceita número curto (ex.: <strong>2798</strong>) ou com ano, como está salvo no sistema; resultados ambíguos pedem escolha do protocolo.
            Até {MAX_PROTOCOL_MAP_IMPORT_LINES} linhas por lote; as consultas ao mapa são feitas com intervalo para respeitar o serviço de geocodificação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            className="min-h-36 font-mono text-sm"
            placeholder={"1949 — R. Júlio de Modesti - Poço Fundo\n1950 — Rua do exemplo, Centro"}
            value={textoImportacaoMapa}
            onChange={(event) => {
              setTextoImportacaoMapa(event.target.value);
              setPreviewImportacaoMapa([]);
            }}
            disabled={previsualizandoMapa || importandoMapa}
            aria-label="Protocolos e endereços para geocodificar"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={previsualizarImportacaoMapa} disabled={previsualizandoMapa || importandoMapa || !textoImportacaoMapa.trim()}>
              <Search className={previsualizandoMapa ? "mr-2 h-4 w-4 animate-pulse" : "mr-2 h-4 w-4"} />
              {previsualizandoMapa ? "Localizando endereços..." : "Localizar e gerar prévia"}
            </Button>
            {previsualizandoMapa && <span className="text-xs text-muted-foreground">A consulta pode levar alguns segundos por linha.</span>}
          </div>

          {previewImportacaoMapa.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-semibold">Prévia da importação</h3>
                  <p className="text-xs text-muted-foreground">
                    {previewImportacaoMapa.filter((row) => row.status === "pronto").length} endereço(s) localizado(s); {previewImportacaoMapa.length} linha(s) analisada(s).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => selecionarPontosSemCoordenadas(true)}>
                    Selecionar prontos com resultado único
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => selecionarPontosSemCoordenadas(false)}>
                    Desmarcar todos
                  </Button>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <Checkbox
                  checked={sobrescreverCoordenadas}
                  onCheckedChange={(checked) => setSobrescreverCoordenadas(!!checked)}
                  disabled={importandoMapa}
                />
                <span>
                  <span className="font-medium">Permitir substituir coordenadas já cadastradas</span>
                  <span className="block text-xs text-muted-foreground">Registros com coordenadas existentes começam desmarcados e só serão atualizados se você marcar esta opção e selecionar a linha.</span>
                </span>
              </label>

              <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
                {previewImportacaoMapa.map((row) => {
                  const candidate = row.candidates[row.candidateIndex];
                  const statusLabel = row.status === "pronto" ? "Localizado"
                    : row.status === "nao_encontrado" ? (row.legacyMatches?.length ? "Só no histórico" : "Protocolo não encontrado")
                    : row.status === "duplicado" ? "Escolha o protocolo"
                    : row.status === "sem_resultado" ? "Endereço não localizado"
                    : row.status === "fora_area" ? "Fora de Brusque"
                    : "Revisar linha";
                  return (
                    <div key={`${row.line}-${row.numero}`} className="rounded-md border p-3">
                      <div className="flex items-start gap-3">
                        {row.status === "pronto" && row.protocolId && (
                          <Checkbox
                            checked={row.selected && (!row.hasCoordinates || sobrescreverCoordenadas)}
                            disabled={importandoMapa || (row.hasCoordinates && !sobrescreverCoordenadas)}
                            onCheckedChange={(checked) => alterarSelecaoImportacao(row.line, !!checked)}
                            aria-label={`Incluir protocolo ${row.numero} na importação`}
                          />
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-semibold">{(row.numeroPersistido ?? row.numero) || `Linha ${row.line}`}</span>
                            {row.numeroPersistido && row.numeroPersistido !== row.numero && (
                              <span className="text-xs text-muted-foreground">Busca: {row.numero}</span>
                            )}
                            {row.secretaria && <span className="text-xs text-muted-foreground">{row.secretaria}</span>}
                            <Badge variant={row.status === "pronto" ? "secondary" : "outline"}>{statusLabel}</Badge>
                          </div>
                          {row.assunto && <p className="text-xs text-muted-foreground">{row.assunto}</p>}
                          {row.endereco && <p className="text-sm">Endereço informado: <strong>{row.endereco}</strong></p>}
                          <p className={`text-xs ${row.status === "pronto" ? "text-muted-foreground" : "text-destructive"}`}>{row.message}</p>
                          {row.protocolMatches && row.protocolMatches.length > 1 && !row.protocolId && (
                            <div className="space-y-1 rounded bg-muted/50 p-2">
                              <Label className="text-xs">Qual registro corresponde a este protocolo?</Label>
                              <Select value={row.protocolId ?? ""} onValueChange={(value) => selecionarProtocoloImportacao(row.line, value)}>
                                <SelectTrigger><SelectValue placeholder="Selecione o ano e o protocolo" /></SelectTrigger>
                                <SelectContent>
                                  {row.protocolMatches.map((match) => (
                                    <SelectItem key={match.id} value={match.id}>
                                      {match.numero} · {match.secretaria ?? "sem secretaria"}{match.isAntigo ? " · antigo" : ""}{match.hasCoordinates ? " · já tem ponto" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {!!row.legacyMatches?.length && (
                            <div className="rounded bg-muted/50 p-2 text-xs">
                              <p className="font-medium">Correspondências encontradas nos protocolos antigos:</p>
                              {row.legacyMatches.map((match) => (
                                <p key={`${match.origem}-${match.numero}`}>{match.numero} · {match.origem}</p>
                              ))}
                            </div>
                          )}
                          {row.hasCoordinates && (
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                              Este protocolo já tem coordenadas{row.currentEndereco ? ` (${row.currentEndereco})` : ""}.
                            </p>
                          )}
                          {candidate && (
                            <div className="space-y-2 rounded bg-muted/50 p-2">
                              {row.candidates.length > 1 && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Endereço ambíguo — escolha uma das {row.candidates.length} opções</Label>
                                  <Select value={String(row.candidateIndex)} onValueChange={(value) => alterarCandidatoImportacao(row.line, Number(value))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {row.candidates.map((option, index) => (
                                        <SelectItem key={option.placeId} value={String(index)}>{option.displayName}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              <p className="break-words text-xs">{candidate.displayName}</p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span className="font-mono">{candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)}</span>
                                <a
                                  className="text-primary underline"
                                  href={`https://www.openstreetmap.org/?mlat=${candidate.latitude}&mlon=${candidate.longitude}#map=18/${candidate.latitude}/${candidate.longitude}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Conferir no mapa
                                </a>
                              </div>
                            </div>
                          )}
                          {row.protocolId && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setMapPickerLine(row.line)} disabled={importandoMapa}>
                              <MapPin className="mr-1.5 h-4 w-4" />
                              {candidate ? "Ajustar ponto no mapa" : "Localizar ponto manualmente no mapa"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-sm text-muted-foreground">
                  {previewImportacaoMapa.filter((row) => row.selected && row.status === "pronto" && (!row.hasCoordinates || sobrescreverCoordenadas)).length} protocolo(s) selecionado(s).
                </p>
                <Button onClick={aplicarImportacaoMapa} disabled={importandoMapa || previsualizandoMapa}>
                  <Upload className="mr-2 h-4 w-4" />
                  {importandoMapa ? "Gravando no sistema..." : "Importar selecionados"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Ícones das secretarias no mapa
          </CardTitle>
          <CardDescription>
            Escolha o ícone exibido para cada secretaria nos mapas da Dashboard e da página Mapas. A opção automática usa o ícone correspondente ao setor Saúde ou Obras.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {secretariasMapIcons.isLoading && <p className="text-sm text-muted-foreground">Carregando secretarias...</p>}
          {secretariasMapIcons.error && (
            <p className="text-sm text-destructive">
              {(secretariasMapIcons.error as Error).message}
            </p>
          )}
          {secretariasMapIcons.data?.map((secretaria) => {
            const currentIcon = obterIconeSecretaria(secretaria.icone, mapDepartmentOf(secretaria));
            const selectedIcon = secretaria.icone && SECRETARIA_ICONES[secretaria.icone]
              ? secretaria.icone
              : "__automatico__";
            return (
              <div key={secretaria.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {secretaria.nome}{secretaria.sigla ? ` (${secretaria.sigla})` : ""}
                  </p>
                  <Badge variant="outline" className="mt-1">
                    {currentIcon.emoji} {currentIcon.label}
                  </Badge>
                </div>
                <Select
                  value={selectedIcon}
                  onValueChange={(value) =>
                    salvarIconeSecretaria(secretaria.id, value === "__automatico__" ? null : value)
                  }
                  disabled={salvandoIconeSecretariaId === secretaria.id}
                >
                  <SelectTrigger className="w-full sm:w-64" aria-label={`Ícone de ${secretaria.nome}`}>
                    <SelectValue placeholder="Escolha o ícone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__automatico__">Automático por setor</SelectItem>
                    {Object.entries(SECRETARIA_ICONES).map(([key, icon]) => (
                      <SelectItem key={key} value={key}>{icon.emoji} {icon.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {secretariasMapIcons.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma secretaria cadastrada.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Editar informações</CardTitle>
          <CardDescription>Escolha o tipo de informação, encontre o registro e edite ou apague.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={tabela} onValueChange={(v) => { setTabela(v); setPagina(0); setBusca(""); setBuscaAtiva(""); }}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BACKUP_TABELAS.map((t) => (
                  <SelectItem key={t} value={t}>{NOMES[t]} ({c[t] ?? "…"})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <form className="flex gap-2 flex-1 min-w-60" onSubmit={(e) => { e.preventDefault(); setPagina(0); setBuscaAtiva(busca); }}>
              <Input placeholder="Buscar por número, nome, e-mail ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
              <Button type="submit" variant="secondary"><Search className="h-4 w-4" /></Button>
            </form>
          </div>

          <div className="rounded-md border divide-y">
            {lista.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando...</div>}
            {lista.error && <div className="p-4 text-sm text-destructive">{(lista.error as Error).message}</div>}
            {lista.data?.rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum registro.</div>}
            {lista.data?.rows.map((r) => (
              <div key={String(r.id)} className="flex items-center gap-2 p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{resumoLinha(r)}</div>
                  <div className="truncate text-xs text-muted-foreground">{String(r.id)}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setEditando(r); setTexto(JSON.stringify(r, null, 2)); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => apagar(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{lista.data?.total ?? 0} registros</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
              <span>{pagina + 1} / {totalPaginas}</span>
              <Button size="sm" variant="outline" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corrigir acentos</CardTitle>
          <CardDescription>
            Procura textos com acentos quebrados (ex.: "via p�blica") em protocolos, histórico, assuntos, secretarias, locais e e-mails, e corrige.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={corrigirAcentosClick} disabled={corrigindo}>
            <RefreshCw className={corrigindo ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {corrigindo ? "Corrigindo..." : "Corrigir acentos agora"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Zerar dados</CardTitle>
          <CardDescription>
            Apaga tudo das partes marcadas. Sua própria conta de administrador é sempre mantida.
            Zerar secretarias também apaga os locais e responsáveis, e tira a secretaria dos protocolos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {BACKUP_GRUPOS.map((g) => {
              const n = g.tabelas.reduce((s, t) => s + (c[t] ?? 0), 0);
              return (
                <label key={g.id} className="flex gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/40">
                  <Checkbox checked={!!selZerar[g.id]} disabled={zerando}
                    onCheckedChange={(v) => setSelZerar({ ...selZerar, [g.id]: !!v })} />
                  <div className="min-w-0">
                    <div className="font-medium flex items-center gap-2">{g.titulo}<Badge variant="secondary">{n}</Badge></div>
                    <div className="text-xs text-muted-foreground">{g.descricao}</div>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-56" placeholder='Digite ZERAR para confirmar' value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)} />
            <Button variant="destructive" disabled={zerando || confirmacao !== "ZERAR"} onClick={executarZerar}>
              <Trash2 className="h-4 w-4 mr-2" /> {zerando ? "Apagando..." : "Zerar selecionados"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Editar — {NOMES[tabela]}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Altere os valores entre aspas e clique em Salvar. O código (id) não pode ser alterado.
          </p>
          <Textarea className="font-mono text-xs h-[60vh]" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MapPointPicker
        open={mapPickerLine != null}
        onOpenChange={(open) => { if (!open) setMapPickerLine(null); }}
        initial={pontoPickerCandidate
          ? { lat: pontoPickerCandidate.latitude, lng: pontoPickerCandidate.longitude }
          : null}
        endereco={pontoPickerRow?.endereco}
        protocoloContext={{
          assunto: pontoPickerRow?.assunto ?? undefined,
          endereco: pontoPickerRow?.endereco,
          secretaria: pontoPickerRow?.secretaria ?? undefined,
        }}
        onConfirm={confirmarPontoManual}
      />
    </div>
  );
}
