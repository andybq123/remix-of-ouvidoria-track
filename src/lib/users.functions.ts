import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { agruparAreasPorEmail, normalizarEmailAreas, prepararVinculosAreas } from "@/lib/user-areas";

async function sincronizarAreas(supabaseAdmin: any, email: string, secretariaIds?: string[]) {
  const emailNorm = normalizarEmailAreas(email);
  const { error: eDel } = await supabaseAdmin.from("user_secretarias").delete().eq("email", emailNorm);
  if (eDel) throw new Error(eDel.message);
  const vinculos = prepararVinculosAreas(emailNorm, secretariaIds);
  if (vinculos.length) {
    const { error } = await supabaseAdmin.from("user_secretarias").insert(vinculos);
    if (error) throw new Error(error.message);
  }
}

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar essa ação");
}

export const listarUsuarios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed, error: e1 } = await supabaseAdmin
      .from("allowed_emails")
      .select("*")
      .order("created_at", { ascending: false });
    if (e1) throw new Error(e1.message);

    const { data: areas } = await supabaseAdmin.from("user_secretarias").select("email, secretaria_id");
    const areasPorEmail = agruparAreasPorEmail(areas ?? []);

    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const usersByEmail = new Map<string, any>();
    (list?.users ?? []).forEach(u => {
      if (u.email) usersByEmail.set(u.email.toLowerCase(), u);
    });

    return (allowed ?? []).map(a => {
      const u = usersByEmail.get(a.email.toLowerCase());
      return {
        ...a,
        registered: !!u,
        last_sign_in_at: u?.last_sign_in_at ?? null,
        auth_user_id: u?.id ?? null,
        secretaria_ids: areasPorEmail.get(normalizarEmailAreas(a.email)) ?? [],
      };
    });
  });

export const criarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; nome?: string; role: "admin" | "user"; senha?: string; secretaria_ids?: string[] }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const email = data.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email inválido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: errIns } = await supabaseAdmin
      .from("allowed_emails")
      .insert({ email, nome: data.nome ?? null, role: data.role, created_by: context.userId });
    if (errIns && !errIns.message.includes("duplicate")) throw new Error(errIns.message);

    await sincronizarAreas(supabaseAdmin, email, data.role === "user" ? data.secretaria_ids : []);

    if (data.senha && data.senha.length >= 6) {
      const { data: created, error: errUser } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.senha,
        email_confirm: true,
        user_metadata: { nome: data.nome ?? "" },
      });
      let authUserId = created?.user?.id ?? null;
      if (errUser) {
        if (!String(errUser.message).toLowerCase().includes("already")) {
          throw new Error(errUser.message);
        }
        // E-mail já existia no acesso: atualiza a senha em vez de ignorar,
        // senão o login falha com "credencial inválida".
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
        const existente = (list?.users ?? []).find(x => x.email?.toLowerCase() === email);
        if (!existente) throw new Error(errUser.message);
        const { error: errUpd } = await supabaseAdmin.auth.admin.updateUserById(existente.id, {
          password: data.senha,
          email_confirm: true,
        });
        if (errUpd) throw new Error(errUpd.message);
        authUserId = existente.id;
      }
      if (authUserId) {
        await supabaseAdmin.from("user_roles")
          .upsert({ user_id: authUserId, role: data.role }, { onConflict: "user_id,role" });
      }
    }
    return { ok: true };
  });

export const atualizarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; nome?: string; role: "admin" | "user"; novaSenha?: string; secretaria_ids?: string[] }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: allowed, error: e1 } = await supabaseAdmin
      .from("allowed_emails").select("*").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabaseAdmin
      .from("allowed_emails")
      .update({ nome: data.nome ?? null, role: data.role })
      .eq("id", data.id);
    if (e2) throw new Error(e2.message);

    await sincronizarAreas(supabaseAdmin, allowed.email, data.role === "user" ? data.secretaria_ids : []);

    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    const u = (list?.users ?? []).find(x => x.email?.toLowerCase() === allowed.email.toLowerCase());
    if (u) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", u.id);
      await supabaseAdmin.from("user_roles").insert({ user_id: u.id, role: data.role });
      if (data.novaSenha && data.novaSenha.length >= 6) {
        await supabaseAdmin.auth.admin.updateUserById(u.id, { password: data.novaSenha });
      }
    }
    return { ok: true };
  });

export const removerUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: allowed } = await supabaseAdmin
      .from("allowed_emails").select("email").eq("id", data.id).single();

    await supabaseAdmin.from("allowed_emails").delete().eq("id", data.id);
    if (allowed?.email) {
      await supabaseAdmin.from("user_secretarias").delete().eq("email", normalizarEmailAreas(allowed.email));
    }

    if (allowed?.email) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
      const u = (list?.users ?? []).find(x => x.email?.toLowerCase() === allowed.email.toLowerCase());
      if (u) await supabaseAdmin.auth.admin.deleteUser(u.id);
    }
    return { ok: true };
  });