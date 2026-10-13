// Cópia de segurança das chaves de IA em um arquivo no servidor (VPS).
// O arquivo fica fora do banco e do Git, então sobrevive a atualizações,
// restaurações de backup e "zerar dados". Na nuvem (sem disco) é ignorado.
export type ChavesIA = { grok?: string | null; gemini?: string | null };

async function caminho(): Promise<string | null> {
  try {
    if (typeof process === "undefined" || !process.cwd) return null;
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fixo = process.env["IA_CHAVES_FILE"];
    if (fixo) return fixo;
    const pasta = path.join(process.cwd(), "local-docker");
    return fs.existsSync(pasta) ? path.join(pasta, ".ia-chaves.json") : null;
  } catch {
    return null;
  }
}

export async function lerChavesArquivo(): Promise<ChavesIA> {
  try {
    const p = await caminho();
    if (!p) return {};
    const fs = await import("node:fs");
    if (!fs.existsSync(p)) return {};
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return { grok: j.grok ?? null, gemini: j.gemini ?? null };
  } catch {
    return {};
  }
}

export async function salvarChavesArquivo(patch: ChavesIA): Promise<void> {
  try {
    const p = await caminho();
    if (!p) return;
    const fs = await import("node:fs");
    const atual = await lerChavesArquivo();
    const novo = { ...atual, ...patch };
    fs.writeFileSync(p, JSON.stringify(novo, null, 2), { mode: 0o600 });
  } catch {
    /* sem disco disponível */
  }
}

/** Se o banco perdeu alguma chave mas o arquivo ainda tem, devolve a chave ao banco. */
export async function restaurarChavesSeNecessario(
  db: { grok_api_key?: string | null; gemini_api_key?: string | null } | null,
): Promise<ChavesIA> {
  const arq = await lerChavesArquivo();
  const faltando: Record<string, string> = {};
  if (!db?.grok_api_key && arq.grok) faltando.grok_api_key = arq.grok;
  if (!db?.gemini_api_key && arq.gemini) faltando.gemini_api_key = arq.gemini;
  if (Object.keys(faltando).length) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await (supabaseAdmin as any).from("ai_config").upsert({ id: true, ...faltando }, { onConflict: "id" });
    } catch {
      /* ignora */
    }
  }
  // Também guarda no arquivo chaves que só existem no banco.
  const paraArquivo: ChavesIA = {};
  if (db?.grok_api_key && !arq.grok) paraArquivo.grok = db.grok_api_key;
  if (db?.gemini_api_key && !arq.gemini) paraArquivo.gemini = db.gemini_api_key;
  if (Object.keys(paraArquivo).length) await salvarChavesArquivo(paraArquivo);
  return {
    grok: db?.grok_api_key || arq.grok || null,
    gemini: db?.gemini_api_key || arq.gemini || null,
  };
}
