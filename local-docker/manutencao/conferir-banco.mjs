// Somente leitura. Recebe resumo do banco selecionado via stdin.
import { readFileSync } from "node:fs";
try {
  const esperado = JSON.parse(readFileSync(0, "utf8"));
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Configuração Supabase ausente na aplicação.");
  const url = new URL(base);
  if (!["host.docker.internal", "localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("A aplicação não aponta para o Supabase local da VPS. Verifique o ambiente antes de limpar.");
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  if (key.startsWith("sb_secret_")) delete headers.Authorization;
  for (const [tabela, ids] of Object.entries(esperado)) {
    const obtidos = [];
    for (let offset = 0; ; offset += 500) {
      const endpoint = `${base.replace(/\/$/, "")}/rest/v1/${tabela}?select=id&order=id.asc&offset=${offset}&limit=500`;
      const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Não foi possível verificar ${tabela} na API da aplicação (${res.status}).`);
      const rows = await res.json();
      obtidos.push(...rows.map(row => String(row.id)));
      if (rows.length < 500) break;
    }
    if (JSON.stringify(obtidos.sort()) !== JSON.stringify(ids.map(String).sort())) {
      throw new Error(`Banco Docker e API da aplicação diferem em ${tabela}. Não limpe este banco.`);
    }
  }
  console.log("Banco alvo conferido com a API da aplicação (IDs das tabelas).");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao verificar banco alvo.");
  process.exit(1);
}
