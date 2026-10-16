import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Building2, Trash2, MapPin, Pencil, Tag, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { isCustomMapEmoji, obterIconeSecretaria, SECRETARIA_ICONES } from "@/lib/secretaria-map-icons";
import { mapDepartmentOf } from "@/lib/map-departments";
import { SecretariaIconPicker } from "@/components/secretaria-icon-picker";

export const Route = createFileRoute("/_authenticated/secretarias")({
  head: () => ({ meta: [
    { title: "Secretarias e ícones do mapa | Seta360" },
    { name: "description", content: "Gerencie secretarias, locais, responsáveis e ícones dos mapas de Obras e Saúde." },
    { property: "og:title", content: "Secretarias | Seta360" },
    { property: "og:description", content: "Secretarias e ícones dos mapas de Obras e Saúde." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SecretariasPage,
});

function SecretariasPage() {
  const qc = useQueryClient();

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
  });

  const { data: locais = [] } = useQuery({
    queryKey: ["locais"],
    queryFn: async () => (await supabase.from("locais").select("*").order("nome")).data ?? [],
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["secretaria-responsaveis"],
    queryFn: async () =>
      (await supabase.from("secretaria_responsaveis").select("*").order("tipo")).data ?? [],
  });


  const { data: assuntos = [] } = useQuery({
    queryKey: ["assuntos-count"],
    queryFn: async () => (await supabase.from("assuntos").select("id,secretaria_id,nome").eq("ativo", true)).data ?? [],
  });

  const { data: protocolosOpen = [] } = useQuery({
    queryKey: ["protocolos-open-count"],
    queryFn: async () => (await supabase.from("protocolos").select("id,secretaria_id,status").neq("status", "concluido")).data ?? [],
  });

  const countAssuntos = useMemo(() => {
    const m: Record<string, number> = {};
    assuntos.forEach((a: any) => { if (a.secretaria_id) m[a.secretaria_id] = (m[a.secretaria_id] ?? 0) + 1; });
    return m;
  }, [assuntos]);

  const countAbertos = useMemo(() => {
    const m: Record<string, number> = {};
    protocolosOpen.forEach((p: any) => { if (p.secretaria_id) m[p.secretaria_id] = (m[p.secretaria_id] ?? 0) + 1; });
    return m;
  }, [protocolosOpen]);

  const delSec = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("secretarias").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["secretarias"] }); toast.success("Secretaria removida"); },
    onError: (e: any) => toast.error(e.message),
  });

  const delLocal = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("locais").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locais"] }); toast.success("Local removido"); },
  });

  const addLocal = useMutation({
    mutationFn: async (payload: { secretaria_id: string; nome: string }) => {
      const { error } = await supabase.from("locais").insert({ secretaria_id: payload.secretaria_id, nome: payload.nome });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locais"] }); toast.success("Local adicionado"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [editSec, setEditSec] = useState<any | null>(null);
  const [editLocal, setEditLocal] = useState<any | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Secretarias</h1>
          <p className="text-sm text-muted-foreground">{secretarias.length} secretaria(s) · {locais.length} local(is)</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/assuntos"><Tag className="h-4 w-4 mr-1" />Catálogo de assuntos</Link>
          </Button>
          <NovaSecretariaDialog />
        </div>
      </div>

      {secretarias.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Cadastre a primeira secretaria.</CardContent></Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {secretarias.map(s => {
          const locs = locais.filter((l: any) => l.secretaria_id === s.id);
          const nAss = countAssuntos[s.id] ?? 0;
          const nAb = countAbertos[s.id] ?? 0;
          return (
            <Card key={s.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2 min-w-0">
                    <span title={obterIconeSecretaria(s.icone, mapDepartmentOf(s)).label}>{obterIconeSecretaria(s.icone, mapDepartmentOf(s)).emoji}</span>
                    <span className="truncate">{s.nome}</span>
                    {s.sigla && <span className="text-xs text-muted-foreground font-normal">({s.sigla})</span>}
                  </CardTitle>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" aria-label={`Editar ${s.nome}`} onClick={() => setEditSec(s)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir secretaria?")) delSec.mutate(s.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Link to="/assuntos" search={{ secretaria: s.id }} className="no-underline">
                    <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                      <Tag className="h-3 w-3 mr-1" />{nAss} assunto(s)
                    </Badge>
                  </Link>
                  <Badge variant={nAb > 0 ? "destructive" : "outline"}>{nAb} aberto(s)</Badge>
                </div>
                {s.endereco && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />{s.endereco}
                    {s.latitude == null && <span className="ml-1 text-amber-600">(sem coordenadas)</span>}
                  </p>
                )}
                <ResponsaveisSecretaria
                  secretariaId={s.id}
                  lista={responsaveis.filter((r: any) => r.secretaria_id === s.id)}
                />
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Locais / Unidades</div>
                  {locs.length === 0 && <p className="text-[11px] text-muted-foreground">Sem locais cadastrados.</p>}
                  {locs.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between rounded-md border px-2 py-1 text-sm">
                      <span>{l.nome}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditLocal(l)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => delLocal.mutate(l.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                  <AddLocalInline onAdd={(nome) => addLocal.mutate({ secretaria_id: s.id, nome })} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <EditSecretariaDialog secretaria={editSec} onClose={() => setEditSec(null)} />
      <EditLocalDialog local={editLocal} onClose={() => setEditLocal(null)} />
    </div>
  );
}

function NovaSecretariaDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [endereco, setEndereco] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [icone, setIcone] = useState<string>("automatico");

  const create = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("secretarias").insert({
        nome,
        sigla: sigla || null,
        endereco: endereco || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        icone: icone === "automatico" ? null : icone,
        created_by: user?.id,
      }).select("id").single();
      if (error) throw error;
      if (data) {
        await supabase.from("locais").insert({ secretaria_id: data.id, nome });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["secretarias"] });
      qc.invalidateQueries({ queryKey: ["locais"] });
      toast.success("Secretaria criada");
      setOpen(false); setNome(""); setSigla("");
      setEndereco(""); setCoords(null); setIcone("automatico");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nova secretaria</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova secretaria</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Sigla</Label><Input value={sigla} onChange={e => setSigla(e.target.value)} placeholder="Ex: SEMSA" /></div>
          <SecretariaIconPicker id="novo-icone" value={icone} onChange={setIcone} setor={mapDepartmentOf({ nome, sigla })} />
          <div className="space-y-1.5">
            <Label>Endereço da secretaria</Label>
            <AddressAutocomplete
              value={endereco}
              onChange={(v) => { setEndereco(v); setCoords(null); }}
              onSelect={(s) => { setEndereco(s.label); setCoords({ lat: s.lat, lng: s.lng }); }}
              placeholder="Rua, número, bairro"
            />
            {endereco && !coords && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Selecione uma sugestão para gravar no mapa.</p>
            )}
            {coords && (
              <p className="text-[11px] text-muted-foreground">Coordenadas: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={!nome || create.isPending || (icone !== "automatico" && !SECRETARIA_ICONES[icone] && !isCustomMapEmoji(icone))}>Cadastrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddLocalInline({ onAdd }: { onAdd: (nome: string) => void }) {
  const [nome, setNome] = useState("");
  return (
    <div className="flex gap-1.5 pt-1">
      <Input placeholder="Novo local / unidade" value={nome} onChange={e => setNome(e.target.value)} className="h-8 text-xs" />
      <Button size="sm" variant="outline" className="h-8" disabled={!nome} onClick={() => { onAdd(nome); setNome(""); }}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

function EditSecretariaDialog({ secretaria, onClose }: { secretaria: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [sigla, setSigla] = useState("");
  const [endereco, setEndereco] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [icone, setIcone] = useState<string>("automatico");
  const open = !!secretaria;

  useEffect(() => {
    if (secretaria) {
      setNome(secretaria.nome ?? "");
      setSigla(secretaria.sigla ?? "");
      setEndereco(secretaria.endereco ?? "");
      setCoords(
        secretaria.latitude != null && secretaria.longitude != null
          ? { lat: secretaria.latitude, lng: secretaria.longitude }
          : null,
      );
      setIcone(secretaria.icone ?? "automatico");
    }
  }, [secretaria]);

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("secretarias").update({
        nome,
        sigla: sigla || null,
        endereco: endereco || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        icone: icone === "automatico" ? null : icone,
      }).eq("id", secretaria.id);
      if (error) throw error;
    },
    onSuccess: async () => { await qc.invalidateQueries(); toast.success("Secretaria atualizada"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar secretaria</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Sigla</Label><Input value={sigla} onChange={e => setSigla(e.target.value)} /></div>
          <SecretariaIconPicker id="editar-icone" value={icone} onChange={setIcone} setor={mapDepartmentOf({ nome, sigla })} />
          <div className="space-y-1.5">
            <Label>Endereço</Label>
            <AddressAutocomplete
              value={endereco}
              onChange={(v) => { setEndereco(v); setCoords(null); }}
              onSelect={(s) => { setEndereco(s.label); setCoords({ lat: s.lat, lng: s.lng }); }}
              placeholder="Rua, número, bairro"
            />
            {endereco && !coords && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Selecione uma sugestão para gravar no mapa.</p>
            )}
            {coords && (
              <p className="text-[11px] text-muted-foreground">Coordenadas: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => update.mutate()} disabled={!nome || update.isPending || (icone !== "automatico" && !SECRETARIA_ICONES[icone] && !isCustomMapEmoji(icone))}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditLocalDialog({ local, onClose }: { local: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const open = !!local;
  useEffect(() => {
    if (local) setNome(local.nome ?? "");
  }, [local]);
  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("locais").update({ nome }).eq("id", local.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locais"] }); toast.success("Local atualizado"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar local</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => update.mutate()} disabled={!nome || update.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ResponsaveisSecretaria({ secretariaId, lista }: { secretariaId: string; lista: any[] }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState<"principal" | "substituto">("principal");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["secretaria-responsaveis"] });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("secretaria_responsaveis").insert({
        secretaria_id: secretariaId,
        nome,
        email: email || null,
        tipo,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Responsável adicionado"); setNome(""); setEmail(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase.from("secretaria_responsaveis").update({ ativo: !r.ativo }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("secretaria_responsaveis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Responsável removido"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">Responsáveis</div>
      {lista.length === 0 && <p className="text-[11px] text-muted-foreground">Sem responsáveis cadastrados.</p>}
      {lista.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <UserRound className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate">{r.nome}</span>
              <Badge variant={r.tipo === "principal" ? "default" : "secondary"} className="text-[10px]">
                {r.tipo === "principal" ? "Principal" : "Substituto"}
              </Badge>
              {!r.ativo && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
            </div>
            {r.email && <p className="text-[11px] text-muted-foreground truncate pl-4">{r.email}</p>}
          </div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => toggleAtivo.mutate(r)}>
              {r.ativo ? "Desativar" : "Ativar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => remover.mutate(r.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Input placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} className="h-8 text-xs flex-1 min-w-[110px]" />
        <Input placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-xs flex-1 min-w-[130px]" />
        <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="principal">Principal</SelectItem>
            <SelectItem value="substituto">Substituto</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8" disabled={!nome || add.isPending} onClick={() => add.mutate()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
