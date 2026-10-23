import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ManifestacoesMap, type MapPoint, type SecretariaPoint, type LocalPoint } from "@/components/manifestacoes-map";
import { Plus, HeartPulse } from "lucide-react";
import { ProtocoloDetailDialog } from "@/components/protocolo-detail-dialog";
import { toast } from "sonner";
import { MapPointPicker } from "@/components/map-point-picker";
import { categoriaDoProtocolo, situacaoProtocolo } from "@/lib/prazo";
import { escoposMapaPermitidos, mapDepartmentOf, matchesMapDepartment, type MapDepartmentScope } from "@/lib/map-departments";
import { MapDepartmentToggle } from "@/components/map-department-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({ meta: [
    { title: "Mapa de Saúde e Obras | OuviDesk" },
    { name: "description", content: "Locais e protocolos de Saúde e Obras em Brusque." },
    { property: "og:title", content: "Mapa de Saúde e Obras | OuviDesk" },
    { property: "og:description", content: "Locais e protocolos de Saúde e Obras em Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MapaPage,
});

const layoutApi = getRouteApi("/_authenticated");

function MapaPage() {
  const { user } = layoutApi.useRouteContext();
  const [mapScope, setMapScope] = useState<MapDepartmentScope>("saude");
  const [status, setStatus] = useState<string>("todos");
  const [prazo, setPrazo] = useState<string>("todos");
  const [localFiltroId, setLocalFiltroId] = useState<string>("todos");
  const [detail, setDetail] = useState<any | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addLocalId, setAddLocalId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingNewPoint, setSavingNewPoint] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    kind: "local" | "secretaria";
    id: string;
    nome: string;
    oldLat: number;
    oldLng: number;
    newLat: number;
    newLng: number;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const [savingMove, setSavingMove] = useState(false);
  const qc = useQueryClient();

  // Áreas vinculadas ao usuário (user_secretarias). Filtra pelo próprio e-mail:
  // admins enxergam os vínculos de todos pela policy, mas aqui só os deles importam.
  const { data: minhasAreas } = useQuery({
    queryKey: ["minhas-areas-mapa", user.email],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_secretarias")
        .select("secretaria_id, secretarias(nome, sigla)")
        .eq("email", (user.email ?? "").toLowerCase());
      if (error) throw error;
      return (data ?? []).map((r: any) => r.secretarias ?? {});
    },
  });
  const escoposPermitidos = useMemo(
    () => (minhasAreas === undefined ? undefined : escoposMapaPermitidos(minhasAreas)),
    [minhasAreas],
  );
  // Se a área escolhida não é permitida para o usuário, cai na primeira permitida.
  const scopeEfetivo: MapDepartmentScope | null =
    escoposPermitidos === undefined
      ? mapScope
      : escoposPermitidos.length === 0
        ? null
        : escoposPermitidos.includes(mapScope as (typeof escoposPermitidos)[number])
          ? mapScope
          : escoposPermitidos[0];

  const { data: secretariasMapa = [] } = useQuery({
    queryKey: ["secretarias-mapa-setores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("secretarias")
        .select("id, nome, sigla, endereco, latitude, longitude, icone")
        .order("nome");
      if (error) throw error;
      return (data ?? []).filter((s) => mapDepartmentOf(s) !== null);
    },
  });
  const secretariasSelecionadas = useMemo(
    () => (scopeEfetivo ? secretariasMapa.filter((s) => matchesMapDepartment(s, scopeEfetivo)) : []),
    [secretariasMapa, scopeEfetivo],
  );
  const secretariaIdsSelecionadas = useMemo(
    () => secretariasSelecionadas.map((s) => s.id),
    [secretariasSelecionadas],
  );

  const { data: protocolos = [] } = useQuery({
    queryKey: ["protocolos-mapa-setores", secretariaIdsSelecionadas],
    enabled: secretariaIdsSelecionadas.length > 0,
    queryFn: () =>
      fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("id, numero, numero_esic, assunto, endereco, latitude, longitude, status, secretaria_id, local_id, categoria, tipo, prorrogado, data_abertura, data_conclusao, locais(nome), secretarias(nome, sigla, icone)")
          .eq("triagem_pendente", false)
          .in("secretaria_id", secretariaIdsSelecionadas)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .range(from, to),
      ),
  });

  const { data: locaisSaude = [] } = useQuery({
    queryKey: ["locais-setores-mapa", secretariaIdsSelecionadas],
    enabled: secretariaIdsSelecionadas.length > 0,
    queryFn: async () => (
      await supabase
        .from("locais")
        .select("id, nome, latitude, longitude, secretaria_id, secretarias(nome, sigla, icone)")
        .in("secretaria_id", secretariaIdsSelecionadas)
        .order("nome")
    ).data ?? [],
  });

  const locaisComCoord = useMemo(
    () => (locaisSaude as any[]).filter(l => l.latitude != null && l.longitude != null),
    [locaisSaude],
  );
  const locaisSemCoord = useMemo(
    () => (locaisSaude as any[]).filter(l => l.latitude == null || l.longitude == null),
    [locaisSaude],
  );

  // Inclui TODOS os protocolos (mesmo sem coordenadas) para listar no popup do local.
  const { data: protocolosTodos = [] } = useQuery({
    queryKey: ["protocolos-por-local-setores", secretariaIdsSelecionadas],
    enabled: secretariaIdsSelecionadas.length > 0,
    queryFn: () =>
      fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("id, numero, numero_esic, assunto, status, local_id, secretaria_id, tipo, prorrogado, data_abertura, data_conclusao, data_prorrogacao")
          .eq("triagem_pendente", false)
          .in("secretaria_id", secretariaIdsSelecionadas)
          .not("local_id", "is", null)
          .range(from, to),
      ),
  });

  const points = useMemo<MapPoint[]>(() => {
    return (protocolos as any[])
      .filter(p => status === "todos" || p.status === status)
      .filter(p => localFiltroId === "todos" || p.local_id === localFiltroId)
      .filter(p => prazo === "todos" || (prazo === "atrasados") === (situacaoProtocolo(p as any).situacao === "vencido"))
      .map(p => ({
        id: p.id,
        lat: p.latitude as number,
        lng: p.longitude as number,
        numero: p.numero,
        numero_esic: p.numero_esic,
        assunto: p.assunto,
        endereco: p.endereco,
        status: p.status,
        atrasada: situacaoProtocolo(p as any).situacao === "vencido",
        secretaria: p.secretarias?.nome,
        secretariaIcone: p.secretarias?.icone,
        data_abertura: p.data_abertura,
        data_conclusao: p.data_conclusao,
        prorrogado: p.prorrogado,
        data_prorrogacao: p.data_prorrogacao,
        categoria: categoriaDoProtocolo(p.tipo, p.categoria),
        tipo: p.tipo,
        local: p.locais?.nome,
        local_id: p.local_id,
        mapDepartment: mapDepartmentOf(p.secretarias ?? {}),
      }));
  }, [protocolos, status, prazo, localFiltroId]);

  // Para popups dos locais: lista de protocolos por local_id (independe de coordenadas)
  const pointsParaLocais = useMemo<MapPoint[]>(() => {
    return (protocolosTodos as any[])
      .filter(p => status === "todos" || p.status === status)
      .filter(p => localFiltroId === "todos" || p.local_id === localFiltroId)
      .filter(p => prazo === "todos" || (prazo === "atrasados") === (situacaoProtocolo(p as any).situacao === "vencido"))
      .map(p => ({
        id: p.id,
        lat: NaN,
        lng: NaN,
        numero: p.numero,
        numero_esic: p.numero_esic,
        assunto: p.assunto,
        status: p.status,
        local_id: p.local_id,
        tipo: p.tipo,
        prorrogado: p.prorrogado,
        data_abertura: p.data_abertura,
        data_conclusao: p.data_conclusao,
        data_prorrogacao: p.data_prorrogacao,
      }));
  }, [protocolosTodos, status, prazo, localFiltroId]);

  const secretariaPoints = useMemo<SecretariaPoint[]>(() => {
    return secretariasSelecionadas
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        id: s.id,
        lat: s.latitude as number,
        lng: s.longitude as number,
        nome: s.nome,
        sigla: s.sigla,
        endereco: s.endereco,
        icone: s.icone,
      }));
  }, [secretariasSelecionadas]);

  const localPoints = useMemo<LocalPoint[]>(() => {
    return locaisComCoord
      .filter(l => localFiltroId === "todos" || l.id === localFiltroId)
      .map(l => ({
        id: l.id,
        lat: l.latitude as number,
        lng: l.longitude as number,
        nome: l.nome,
        secretaria: l.secretarias?.nome,
        secretariaIcone: l.secretarias?.icone,
        mapDepartment: mapDepartmentOf(l.secretarias ?? {}),
      }));
  }, [locaisComCoord, localFiltroId]);

  const localSelecionadoParaAdicionar = useMemo(
    () => locaisSemCoord.find(l => l.id === addLocalId),
    [locaisSemCoord, addLocalId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-emerald-500" />
            {scopeEfetivo === "obras" ? "Mapa de Obras (SOSU)" : "Mapa da Saúde"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pontos e protocolos das áreas selecionadas em Brusque.
            {locaisSemCoord.length > 0 && (
              <> <strong>{locaisSemCoord.length}</strong> unidade(s)/local(is) ainda sem ponto no mapa.</>
            )}
          </p>
        </div>
        <Button
          onClick={() => { setAddLocalId(""); setAddOpen(true); }}
          disabled={locaisSemCoord.length === 0}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Adicionar local no mapa
        </Button>
      </div>

      {scopeEfetivo === null ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma das suas áreas possui mapa (Saúde ou Obras).
          </CardContent>
        </Card>
      ) : (
      <>
      <MapDepartmentToggle
        value={scopeEfetivo}
        scopes={escoposPermitidos}
        onChange={(value) => { setMapScope(value); setLocalFiltroId("todos"); setPrazo(value === "obras" ? "atrasados" : "todos"); }}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo</Label>
            <Select value={prazo} onValueChange={setPrazo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="atrasados">Somente atrasados</SelectItem>
                <SelectItem value="no_prazo">Dentro do prazo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Unidade/local</Label>
            <Select value={localFiltroId} onValueChange={setLocalFiltroId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as unidades/locais</SelectItem>
                {locaisComCoord.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <p className="text-sm text-muted-foreground">
              <strong>{points.length}</strong> protocolo(s) no mapa.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <ManifestacoesMap
            points={[...points, ...pointsParaLocais.filter(pp => !points.some(p => p.id === pp.id))]}
            height={600}
            secretarias={secretariaPoints}
            locais={localPoints}
            onOpenProtocolo={(id) => {
              const p = (protocolos as any[]).find((x) => x.id === id)
                ?? (protocolosTodos as any[]).find((x) => x.id === id);
              if (p) setDetail(p);
            }}
            onMoveLocal={async (id, lat, lng) => {
              const local = (locaisComCoord as any[]).find(l => l.id === id);
              if (!local) return false;
              return await new Promise<boolean>((resolve) => {
                setPendingMove({
                  kind: "local",
                  id,
                  nome: local.nome,
                  oldLat: local.latitude,
                  oldLng: local.longitude,
                  newLat: lat,
                  newLng: lng,
                  resolve,
                });
              });
            }}
            onMoveSecretaria={async (id, lat, lng) => {
              const sec = secretariasMapa.find((s) => s.id === id) ?? null;
              if (!sec) return false;
              return await new Promise<boolean>((resolve) => {
                setPendingMove({
                  kind: "secretaria",
                  id,
                  nome: sec.nome,
                  oldLat: sec.latitude as number,
                  oldLng: sec.longitude as number,
                  newLat: lat,
                  newLng: lng,
                  resolve,
                });
              });
            }}
          />
        </CardContent>
      </Card>
      </>
      )}
      <ProtocoloDetailDialog protocolo={detail} open={!!detail} onOpenChange={(v) => !v && setDetail(null)} />

      {/* Dialog: escolher qual unidade/local receber um ponto no mapa */}
      <AlertDialog open={addOpen} onOpenChange={(v) => { if (!savingNewPoint) setAddOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adicionar unidade/local no mapa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Selecione uma unidade ou local que ainda não possui ponto no mapa.
                  Em seguida, clique no mapa para marcar sua localização exata.
                </p>
                <div className="space-y-1.5">
                  <Label>Unidade</Label>
                  <Select value={addLocalId} onValueChange={setAddLocalId}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma unidade..." /></SelectTrigger>
                    <SelectContent>
                      {locaisSemCoord.length === 0 && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Todas as unidades/locais já possuem coordenadas.
                        </div>
                      )}
                      {locaisSemCoord.map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingNewPoint}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!addLocalId || savingNewPoint}
              onClick={(e) => {
                e.preventDefault();
                setAddOpen(false);
                setPickerOpen(true);
              }}
            >
              Marcar no mapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MapPointPicker
        open={pickerOpen}
        onOpenChange={(v) => { if (!savingNewPoint) setPickerOpen(v); }}
        endereco={localSelecionadoParaAdicionar?.nome}
        onConfirm={async (lat, lng) => {
          if (!addLocalId) return;
          setSavingNewPoint(true);
          const { error } = await supabase
            .from("locais")
            .update({ latitude: lat, longitude: lng })
            .eq("id", addLocalId);
          setSavingNewPoint(false);
          if (error) {
            toast.error(`Falha ao salvar: ${error.message}`);
            return;
          }
          toast.success(`${localSelecionadoParaAdicionar?.nome ?? "Unidade"} adicionada ao mapa.`);
          setAddLocalId("");
          await qc.invalidateQueries({ queryKey: ["locais-setores-mapa"] });
        }}
      />

      <AlertDialog
        open={!!pendingMove}
        onOpenChange={(open) => {
          if (!open && pendingMove && !savingMove) {
            pendingMove.resolve(false);
            setPendingMove(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar nova localização</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <div>
                  Mover <strong>{pendingMove?.nome}</strong> para uma nova coordenada?
                </div>
                {pendingMove && (
                  <div className="rounded border border-border bg-muted/40 p-2 font-mono text-xs space-y-1">
                    <div>
                      <span className="text-muted-foreground">Antes: </span>
                      {pendingMove.oldLat.toFixed(5)}, {pendingMove.oldLng.toFixed(5)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agora: </span>
                      <span className="text-foreground font-semibold">
                        {pendingMove.newLat.toFixed(5)}, {pendingMove.newLng.toFixed(5)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={savingMove}
              onClick={() => {
                pendingMove?.resolve(false);
                setPendingMove(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={savingMove}
              onClick={async (e) => {
                e.preventDefault();
                if (!pendingMove) return;
                setSavingMove(true);
                const table = pendingMove.kind === "local" ? "locais" : "secretarias";
                const { error } = await supabase
                  .from(table)
                  .update({ latitude: pendingMove.newLat, longitude: pendingMove.newLng })
                  .eq("id", pendingMove.id);
                setSavingMove(false);
                if (error) {
                  toast.error(`Falha ao salvar: ${error.message}`);
                  pendingMove.resolve(false);
                } else {
                  toast.success(`${pendingMove.nome} reposicionado.`);
                  await qc.invalidateQueries({
                    queryKey: pendingMove.kind === "local" ? ["locais-setores-mapa"] : ["secretarias-mapa-setores"],
                  });
                  pendingMove.resolve(true);
                }
                setPendingMove(null);
              }}
            >
              {savingMove ? "Salvando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
