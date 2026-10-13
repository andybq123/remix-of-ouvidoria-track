import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiChat } from "./ai-chat.server";
import { categoriaDoProtocolo } from "./prazo";

const Input = z.object({
  secretariaId: z.string().uuid().nullable().optional(),
  localId: z.string().uuid().nullable().optional(),
  ano: z.string().regex(/^\d{4}$/),
  mes: z.string().regex(/^(all|0[1-9]|1[0-2])$/).default("all"),
  pergunta: z.string().min(3).max(2000),
});

export const gerarRelatorioIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q = supabase
      .from("protocolos")
      .select("numero, numero_esic, tipo, categoria, status, assunto, descricao, solicitante, data_abertura, data_conclusao, data_prorrogacao, prorrogado, esic_prorrogacao_justificativa, secretarias(nome), locais(nome)")
      .gte("data_abertura", `${data.ano}-01-01`)
      .lte("data_abertura", `${data.ano}-12-31`)
      .order("data_abertura", { ascending: false })
      .limit(2000);

    if (data.secretariaId) q = q.eq("secretaria_id", data.secretariaId);
    if (data.localId) q = q.eq("local_id", data.localId);
    if (data.mes !== "all") {
      const last = new Date(parseInt(data.ano), parseInt(data.mes), 0).getDate();
      q = q.gte("data_abertura", `${data.ano}-${data.mes}-01`).lte("data_abertura", `${data.ano}-${data.mes}-${String(last).padStart(2,"0")}`);
    }

    const { data: rows, error } = await q;
    if (error) throw error;

    let escopo = "todos os protocolos";
    if (data.secretariaId) {
      const { data: s } = await supabase.from("secretarias").select("nome").eq("id", data.secretariaId).maybeSingle();
      if (s) escopo = `secretaria "${s.nome}"`;
    }
    if (data.localId) {
      const { data: l } = await supabase.from("locais").select("nome").eq("id", data.localId).maybeSingle();
      if (l) escopo += ` · UBS/local "${l.nome}"`;
    }

    // Resumo agregado (para reduzir tokens)
    const total = rows?.length ?? 0;
    const porCategoria: Record<string, number> = {};
    const porStatus: Record<string, number> = {};
    const porLocal: Record<string, number> = {};
    const porMes: Record<string, number> = {};
    (rows ?? []).forEach((p: any) => {
      const categoria = categoriaDoProtocolo(p.tipo, p.categoria);
      porCategoria[categoria] = (porCategoria[categoria] ?? 0) + 1;
      porStatus[p.status] = (porStatus[p.status] ?? 0) + 1;
      const lname = p.locais?.nome ?? "—";
      porLocal[lname] = (porLocal[lname] ?? 0) + 1;
      const m = p.data_abertura.slice(0, 7);
      porMes[m] = (porMes[m] ?? 0) + 1;
    });

    // Amostra detalhada (até 80 protocolos) para a IA citar exemplos
    const amostra = (rows ?? []).slice(0, 80).map((p: any) => ({
      numero: p.numero,
      numero_esic: p.numero_esic,
      data: p.data_abertura,
      tipo: p.tipo,
      categoria: categoriaDoProtocolo(p.tipo, p.categoria),
      status: p.status,
      assunto: p.assunto,
      local: p.locais?.nome ?? null,
      solicitante: p.solicitante,
      prorrogado: p.prorrogado,
      justificativa_prorrogacao_esic: p.esic_prorrogacao_justificativa,
      concluido_em: p.data_conclusao,
    }));

    const periodoTxt = data.mes === "all" ? `ano de ${data.ano}` : `${data.mes}/${data.ano}`;

    const system = `Você é um analista sênior de ouvidoria pública municipal. Gere relatórios claros, objetivos e em português do Brasil, formatados em Markdown. Use seções: "Resumo executivo", "Indicadores", "Análise por categoria", "Análise por local/UBS" (quando aplicável), "Pontos de atenção" e "Recomendações". Use bullet points e tabelas Markdown quando útil. Baseie-se SOMENTE nos dados fornecidos; se algo não estiver presente, diga "dado não disponível".`;

    const user = [
      `# Pedido do usuário`,
      data.pergunta,
      ``,
      `# Escopo`,
      `Período: ${periodoTxt}`,
      `Escopo: ${escopo}`,
      `Total de protocolos no escopo: ${total}`,
      ``,
      `# Agregados`,
      `Por categoria: ${JSON.stringify(porCategoria)}`,
      `Por status: ${JSON.stringify(porStatus)}`,
      `Por mês: ${JSON.stringify(porMes)}`,
      `Por local/UBS: ${JSON.stringify(porLocal)}`,
      ``,
      `# Amostra de protocolos (até 80)`,
      JSON.stringify(amostra, null, 2),
    ].join("\n");

    const relatorio = (await aiChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    })) || "Sem resposta.";

    return {
      relatorio,
      total,
      escopo,
      periodo: periodoTxt,
      amostraQtd: amostra.length,
    };
  });
