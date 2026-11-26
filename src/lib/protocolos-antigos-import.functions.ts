import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import ouvidoriasData from "@/data/ouvidorias.json";
import atrasadasData from "@/data/ouvidorias-atrasadas.json";

type OuvAntiga = {
  source: string;
  setor: string | null;
  responsavel: string | null;
  data: string;
  numero: number;
  situacao: string;
  comentario?: string | null;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function inferCategoria(
  comentario: string | null | undefined,
  setor: string | null | undefined,
): "elogio" | "reclamacao" | "pedido_informacao" | "denuncia" | "solicitacao" | "outros" {
  const txt = norm(`${comentario ?? ""} ${setor ?? ""}`);
  if (!txt) return "solicitacao";
  if (/\b(elogio|elogia|parabens|agradec)/.test(txt)) return "elogio";
  if (/\b(denunci|infrac|irregular|clandestin|ilegal)/.test(txt)) return "denuncia";
  if (/\b(lai|acesso a informacao|pedido de informacao|informacao sobre|solicito informacao)/.test(txt))
    return "pedido_informacao";
  if (/\b(reclama|insatisf|descontent|protesto|queixa|mau atendimento|pessimo|nao funciona|falta de)/.test(txt))
    return "reclamacao";
  if (/\b(solicit|requer|pede|peco|necessit|gostaria|providenci|vistoria|fiscaliz|conserto|reparo|poda|coleta|limpeza|manuten)/.test(txt))
    return "solicitacao";
  return "outros";
}

function limparComentario(raw: string | null | undefined): { descricao: string; solicitante: string | null } {
  if (!raw) return { descricao: "", solicitante: null };
  const blocks = raw.split(/\n?={3,}\n?/).map((b) => b.trim()).filter(Boolean);
  let solicitante: string | null = null;
  const textos: string[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    let i = 0;
    if (lines[i]?.trim().startsWith("ID#")) i++;
    const header = lines[i]?.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (header) {
      if (!solicitante) solicitante = header[1].trim() || null;
      i++;
    }
    const texto = lines.slice(i).join("\n").trim();
    if (texto) textos.push(texto);
  }
  const descricao = textos.join("\n\n").trim() || raw.trim();
  return { descricao, solicitante };
}

function formatNumero(n: number, ano: number): string {
  return `${n.toLocaleString("pt-BR")}/${ano}`;
}

function matchSecretariaId(
  source: string,
  setor: string | null,
  secretarias: { id: string; nome: string }[],
): string | null {
  if (source === "Saúde") {
    const s = secretarias.find((x) => norm(x.nome).includes("saude"));
    if (s) return s.id;
  }
  if (!setor) return null;
  const ns = norm(setor);
  let best = secretarias.find((x) => norm(x.nome) === ns);
  if (best) return best.id;
  best = secretarias.find((x) => {
    const n = norm(x.nome);
    return n.includes(ns) || ns.includes(n);
  });
  return best?.id ?? null;
}

export const importarProtocolosAntigos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    // Autoriza (todos são admin no sistema, mas confirma).
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const registros = (ouvidoriasData as OuvAntiga[]).filter(
      (r) => !r.data?.startsWith("2026-06"),
    );

    const atrasadasSet = new Set<string>(
      (atrasadasData as { source: string; numero: number }[]).map(
        (r) => `${r.source}|${r.numero}`,
      ),
    );

    // Carrega secretarias.
    const { data: secretarias, error: errSec } = await supabase
      .from("secretarias")
      .select("id, nome");
    if (errSec) throw errSec;

    // Carrega números já existentes para pular colisões.
    const { data: existentes, error: errEx } = await supabase
      .from("protocolos")
      .select("numero");
    if (errEx) throw errEx;
    const numsExistentes = new Set<string>(
      (existentes ?? []).map((r: any) => String(r.numero).replace(/\D/g, "")),
    );

    let inseridos = 0;
    let pulados_duplicados = 0;
    const erros: string[] = [];

    const linhas: any[] = [];
    for (const r of registros) {
      const ano = Number((r.data || "").slice(0, 4));
      if (!ano) continue;
      const numero = formatNumero(r.numero, ano);
      const key = numero.replace(/\D/g, "");
      if (numsExistentes.has(key)) {
        pulados_duplicados++;
        continue;
      }
      numsExistentes.add(key);

      const { descricao, solicitante } = limparComentario(r.comentario);
      const secretaria_id = matchSecretariaId(r.source, r.setor, secretarias ?? []);
      const categoria = inferCategoria(r.comentario, r.setor);
      const isAtrasada = atrasadasSet.has(`${r.source}|${r.numero}`);

      // Considera concluído se não está no set oficial de atrasadas
      // (situacao "Em dia" na planilha antiga = já resolvido).
      const status = isAtrasada ? "aberto" : "concluido";

      linhas.push({
        numero,
        tipo: "ouvidoria",
        categoria,
        status,
        assunto: r.setor || "Ouvidoria",
        descricao: descricao || null,
        solicitante,
        data_abertura: r.data,
        secretaria_id,
        origem: `antigo:${r.source}`,
        sigilo: "publico",
        prorrogado: false,
        triagem_pendente: false,
        url: null,
        detalhes: {
          legacy: true,
          setor_original: r.setor,
          responsavel: r.responsavel,
          situacao_original: r.situacao,
          numero_original: r.numero,
          source: r.source,
        },
      });
    }

    // Insere em lotes de 500.
    const BATCH = 500;
    for (let i = 0; i < linhas.length; i += BATCH) {
      const chunk = linhas.slice(i, i + BATCH);
      const { error } = await supabase.from("protocolos").insert(chunk);
      if (error) {
        erros.push(`Lote ${i / BATCH + 1}: ${error.message}`);
      } else {
        inseridos += chunk.length;
      }
    }

    return {
      inseridos,
      pulados_duplicados,
      pulados_junho: (ouvidoriasData as OuvAntiga[]).length - registros.length,
      total_json: (ouvidoriasData as OuvAntiga[]).length,
      erros,
    };
  });

export const reverterImportacaoAntigos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { error, count } = await supabase
      .from("protocolos")
      .delete({ count: "exact" })
      .like("origem", "antigo:%");
    if (error) throw error;
    return { removidos: count ?? 0 };
  });

export const contarProtocolosAntigosImportados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { count, error } = await supabase
      .from("protocolos")
      .select("id", { count: "exact", head: true })
      .like("origem", "antigo:%");
    if (error) throw error;
    return { total: count ?? 0 };
  });