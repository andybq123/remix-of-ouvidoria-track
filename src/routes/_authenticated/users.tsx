import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Users as UsersIcon, Plus, Trash2, Pencil, ShieldCheck, Eye } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  listarUsuarios, criarUsuario, atualizarUsuario, removerUsuario,
} from "@/lib/users.functions";
import { useIsUserOnline } from "@/hooks/use-online-users";
import { supabase } from "@/integrations/supabase/client";

type Secretaria = { id: string; nome: string };

function useSecretarias() {
  return useQuery({
    queryKey: ["secretarias-lista-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("secretarias").select("id, nome").order("nome");
      if (error) throw error;
      return (data ?? []) as Secretaria[];
    },
    staleTime: 60_000,
  });
}

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [
    { title: "Usuários | OuviDesk" },
    { name: "description", content: "Usuários no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Usuários | OuviDesk" },
    { property: "og:description", content: "Usuários no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: UsersPage,
});

function UsersPage() {
  const qc = useQueryClient();
  const listar = useServerFn(listarUsuarios);
  const criar = useServerFn(criarUsuario);
  const atualizar = useServerFn(atualizarUsuario);
  const remover = useServerFn(removerUsuario);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["allowed-users"],
    queryFn: () => listar({}),
  });
  const { data: secretarias = [] } = useSecretarias();

  const refresh = () => qc.invalidateQueries({ queryKey: ["allowed-users"] });

  const mDel = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => { toast.success("Usuário removido"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UsersIcon className="h-6 w-6" /> Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Somente os e-mails listados aqui podem entrar no sistema (por senha ou Google). Escolha o perfil de cada usuário: <strong>Admin</strong> tem acesso total; <strong>Usuário</strong> apenas visualiza os protocolos.
          </p>
        </div>
        <UserDialog
          title="Novo usuário"
          secretarias={secretarias}
          trigger={<Button><Plus className="h-4 w-4 mr-1" /> Novo usuário</Button>}
          onSubmit={async (v) => {
            await criar({ data: v as any });
            toast.success("Usuário criado");
            refresh();
          }}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="space-y-2">
        {users.length === 0 && !isLoading && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum usuário cadastrado.
          </CardContent></Card>
        )}
        {users.map((u: any) => (
          <UserCard
            key={u.id}
            u={u}
            secretarias={secretarias}
            onEdit={async (v) => { await atualizar({ data: { id: u.id, ...v } as any }); toast.success("Usuário atualizado"); refresh(); }}
            onDelete={() => { if (confirm(`Remover ${u.email}?`)) mDel.mutate(u.id); }}
          />
        ))}
      </div>
    </div>
  );
}

function UserCard({ u, secretarias, onEdit, onDelete }: { u: any; secretarias: Secretaria[]; onEdit: (v: any) => Promise<void>; onDelete: () => void }) {
  const online = useIsUserOnline(u.id);
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" : "bg-slate-300 dark:bg-slate-600"}`}
                      title={online ? "Online agora" : "Offline"}
                    />
                    {u.nome || u.email}
                  </span>
                  {online && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30" variant="outline">
                      Online
                    </Badge>
                  )}
                  {u.role === "admin" ? (
                    <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30" variant="outline">
                      <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                    </Badge>
                  ) : (
                    <Badge className="bg-sky-500/15 text-sky-700 border-sky-500/30" variant="outline">
                      <Eye className="h-3 w-3 mr-1" /> Usuário
                    </Badge>
                  )}
                  {u.registered
                    ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30" variant="outline">Ativo</Badge>
                    : <Badge variant="secondary">Aguardando 1º login</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                {u.role !== "admin" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Áreas: {u.secretaria_ids?.length
                      ? u.secretaria_ids.map((id: string) => secretarias.find(s => s.id === id)?.nome ?? "?").join(", ")
                      : "Todas"}
                  </p>
                )}
                {u.last_sign_in_at && (
                  <p className="text-xs text-muted-foreground">
                    Último acesso: {format(new Date(u.last_sign_in_at), "dd/MM/yyyy HH:mm")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <UserDialog
                  title="Editar usuário"
                  initial={u}
                  secretarias={secretarias}
                  trigger={<Button size="sm" variant="outline"><Pencil className="h-3 w-3" /></Button>}
                  onSubmit={onEdit}
                />
                <Button size="sm" variant="ghost" onClick={onDelete}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
  );
}

function UserDialog({
  title, trigger, initial, onSubmit,
}: {
  title: string;
  trigger: React.ReactNode;
  initial?: any;
  onSubmit: (v: { email?: string; nome?: string; role: "admin" | "user"; senha?: string; novaSenha?: string }) => Promise<void>;
}) {
  const isEdit = !!initial;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [role, setRole] = useState<"admin" | "user">(initial?.role ?? "user");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      if (isEdit) {
        await onSubmit({ nome, role, novaSenha: senha || undefined });
      } else {
        await onSubmit({ email, nome, role, senha: senha || undefined });
      }
      setOpen(false);
      setSenha("");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={isEdit} />
          </div>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "user")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — acesso total</SelectItem>
                <SelectItem value="user">Usuário — somente leitura</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{isEdit ? "Nova senha (opcional)" : "Senha (opcional — deixe em branco para entrar só com Google)"}</Label>
            <Input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="mínimo 6 caracteres" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || (!isEdit && !email)}>
            {isEdit ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}