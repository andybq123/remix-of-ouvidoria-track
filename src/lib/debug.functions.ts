import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BACKUP_TABELAS, BACKUP_GRUPOS, type BackupTabela } from "@/lib/backup-config";
import { SECRETARIA_ICONES } from "@/lib/secretaria-map-icons";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem usar o debug.");
}

function validaTabela(t: string): BackupTabela {
  if (!(BACKUP_TABELAS as readonly string[]).includes(t)) throw new Error("Tabela inválida");
  return t as BackupTabela;
}

// Ordem para apagar: dependentes primeiro.
const ORDEM_EXCLUSAO: BackupTabela[] = [
  "protocolo_historico",
  "email_inbox_log",
  "protocolos",
  "protocolos_antigos_conclusoes",
  "email_inbox_accounts",
  "assuntos",
  "secretaria_responsaveis",
  "locais",
  "secretarias",
  "coletas",
  "ai_config",
  "user_roles",
  "profiles",
  "allowed_emails",
];

export const debugContagens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: Record<string, number> = {};
    for (const t of BACKUP_TABELAS) {
      const { count } = await (supabaseAdmin as any).from(t).select("*", { count: "exact", head: true });
      out[t] = count ?? 0;
    }
    return out;
  });

export const debugListar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tabela: string; pagina: number; busca?: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const tabela = validaTabela(data.tabela);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tam = 50;
    let q = (supabaseAdmin as any).from(tabela).select("*", { count: "exact" });
    const busca = data.busca?.trim();
    if (busca) {
      if (/^[0-9a-f-]{36}$/i.test(busca)) q = q.eq("id", busca);
      else {
        const campos: Record<string, string[]> = {
          protocolos: ["numero", "assunto", "solicitante"],
          secretarias: ["nome", "sigla"],
          locais: ["nome"],
          assuntos: ["nome"],
          profiles: ["nome", "email"],
          allowed_emails: ["nome", "email"],
          email_inbox_log: ["assunto", "remetente"],
          email_inbox_accounts: ["email"],
          secretaria_responsaveis: ["nome", "email"],
          protocolo_historico: ["campo", "autor_nome"],
        };
        const cs = campos[tabela];
        const termo = busca.replace(/[%,()]/g, " ");
        if (cs) q = q.or(cs.map((c) => `${c}.ilike.%${termo}%`).join(","));
      }
    }
    const ordem = tabela === "protocolos" || tabela === "protocolo_historico" || tabela === "email_inbox_log"
      ? "created_at" : "id";
    const col = tabela === "email_inbox_log" ? "recebido_em" : ordem;
    const { data: rows, count, error } = await q
      .order(col, { ascending: false })
      .range(data.pagina * tam, data.pagina * tam + tam - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Record<string, any>[], total: count ?? 0, tam };
  });

export const debugSalvar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tabela: string; id: string; valores: Record<string, any> }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const tabela = validaTabela(data.tabela);
    const { id: _ignora, ...valores } = data.valores;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from(tabela).update(valores).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const debugExcluir = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tabela: string; id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const tabela = validaTabela(data.tabela);
    if ((tabela === "profiles" || tabela === "user_roles") && data.id === context.userId) {
      throw new Error("Você não pode apagar o seu próprio acesso.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    if (tabela === "protocolos") {
      await sb.from("protocolo_historico").delete().eq("protocolo_id", data.id);
      await sb.from("email_inbox_log").update({ protocolo_id: null }).eq("protocolo_id", data.id);
    }
    const { error } = await sb.from(tabela).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const debugZerar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { grupos: string[]; confirmacao: string }) => d)
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.confirmacao !== "ZERAR") throw new Error("Confirmação inválida.");
    const grupos = BACKUP_GRUPOS.filter((g) => data.grupos.includes(g.id));
    if (!grupos.length) throw new Error("Nada selecionado.");
    const tabelas = new Set(grupos.flatMap((g) => g.tabelas));
    // Apagar secretarias exige apagar o que depende delas.
    if (tabelas.has("secretarias")) {
      ["locais", "secretaria_responsaveis"].forEach((t) => tabelas.add(t as BackupTabela));
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const me = context.userId;
    const meEmail = (context.claims as any)?.email?.toLowerCase() ?? "";
    const resumo: Record<string, string> = {};

    // Desfaz ligações para não travar exclusões parciais.
    if (tabelas.has("secretarias") && !tabelas.has("protocolos")) {
      await sb.from("protocolos").update({ secretaria_id: null, local_id: null, responsavel_id: null }).not("id", "is", null);
      await sb.from("assuntos").update({ secretaria_id: null }).not("id", "is", null);
      await sb.from("email_inbox_accounts").update({ secretaria_id: null }).not("id", "is", null);
    }
    if (tabelas.has("protocolos") && !tabelas.has("email_inbox_log")) {
      await sb.from("email_inbox_log").update({ protocolo_id: null }).not("protocolo_id", "is", null);
    }

    for (const t of ORDEM_EXCLUSAO) {
      if (!tabelas.has(t)) continue;
      let q = sb.from(t).delete({ count: "exact" });
      if (t === "profiles") q = q.neq("id", me);
      else if (t === "user_roles") q = q.neq("user_id", me);
      else if (t === "allowed_emails") q = meEmail ? q.neq("email", meEmail) : q.not("id", "is", null);
      else q = q.not("id", "is", null);
      const { error, count } = await q;
      resumo[t] = error ? `erro: ${error.message}` : String(count ?? 0);
    }

    if (tabelas.has("ai_config")) {
      const { salvarChavesArquivo } = await import("./ai-keys-store.server");
      await salvarChavesArquivo({ grok: null, gemini: null });
    }

    if (grupos.some((g) => g.usuarios)) {
      let apagados = 0;
      for (let page = 1; page <= 20; page++) {
        const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        const users = list?.users ?? [];
        for (const u of users) {
          if (u.id === me) continue;
          const { error } = await sb.auth.admin.deleteUser(u.id);
          if (!error) apagados++;
        }
        if (users.length < 200) break;
      }
      resumo.contas_de_acesso = String(apagados);
    }
    return resumo;
  });

// Exclui protocolos (com histórico) — usado na Triagem.
export const excluirProtocolos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => {
    if (!Array.isArray(d?.ids) || d.ids.length === 0 || d.ids.length > 500) throw new Error("Selecione de 1 a 500 protocolos.");
    if (!d.ids.every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new Error("ID inválido.");
    return d;
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    await sb.from("email_inbox_log").update({ protocolo_id: null }).in("protocolo_id", data.ids);
    const { error: e1 } = await sb.from("protocolo_historico").delete().in("protocolo_id", data.ids);
    if (e1) throw new Error(e1.message);
    const { error, count } = await sb.from("protocolos").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { excluidos: count ?? 0 };
  });

const CAMPOS_TEXTO: Record<string, string[]> = {
  protocolos: ["assunto", "descricao", "solicitante", "endereco", "resolucao"],
  protocolo_historico: ["valor_anterior", "valor_novo", "autor_nome"],
  assuntos: ["nome", "grupo"],
  secretarias: ["nome", "endereco"],
  locais: ["nome"],
  email_inbox_log: ["assunto", "corpo", "remetente"],
  protocolos_antigos_conclusoes: ["resolucao"],
  profiles: ["nome"],
};

/** Corrige acentos quebrados ("p�blica", "pÃºblica") nos dados já salvos. */
export const corrigirAcentosDados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { corrigirAcentos, temAcentoQuebrado } = await import("@/lib/corrigir-acentos");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const extra: string[] = [];
    for (const t of ["assuntos", "secretarias", "locais"]) {
      const { data } = await sb.from(t).select("nome").limit(5000);
      (data ?? []).forEach((r: any) => r.nome && !temAcentoQuebrado(r.nome) && extra.push(r.nome));
    }
    const resultado: Record<string, number> = {};
    let restantes = 0;
    for (const [tabela, campos] of Object.entries(CAMPOS_TEXTO)) {
      const filtro = campos.flatMap((c) => [`${c}.ilike.%\uFFFD%`, `${c}.ilike.%Ã%`]).join(",");
      let corrigidos = 0;
      for (let pagina = 0; pagina < 20; pagina++) {
        const { data, error } = await sb.from(tabela).select(["id", ...campos].join(",")).or(filtro).range(pagina * 500, pagina * 500 + 499);
        if (error) throw new Error(`${tabela}: ${error.message}`);
        if (!data?.length) break;
        for (const r of data) {
          const patch: Record<string, string> = {};
          for (const c of campos) {
            const v = r[c];
            if (typeof v === "string" && temAcentoQuebrado(v)) {
              const novo = corrigirAcentos(v, extra);
              if (novo !== v) patch[c] = novo;
              if (temAcentoQuebrado(novo)) restantes++;
            }
          }
          if (Object.keys(patch).length) {
            const { error: e } = await sb.from(tabela).update(patch).eq("id", r.id);
            if (!e) corrigidos++;
          }
        }
        if (data.length < 500) break;
      }
      if (corrigidos) resultado[tabela] = corrigidos;
    }
    return { resultado, restantes };
  });

export const debugListarSecretariasMapIcons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("secretarias")
      .select("id, nome, sigla, icone")
      .order("nome");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const debugAtualizarSecretariaMapIcon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; icone: string | null }) => {
    if (!data || !/^[0-9a-f-]{36}$/i.test(data.id)) throw new Error("Secretaria inválida.");
    if (data.icone !== null && !Object.prototype.hasOwnProperty.call(SECRETARIA_ICONES, data.icone)) {
      throw new Error("Ícone inválido.");
    }
    return data;
  })
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("secretarias")
      .update({ icone: data.icone })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
