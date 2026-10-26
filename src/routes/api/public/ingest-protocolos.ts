import { licencaBloqueadaAdmin, respostaBloqueada } from "@/lib/licenca.server";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ProtocoloSchema = z.object({
  numero: z.string().min(1).max(100),
  setor: z.string().max(500).nullable().optional(),
  relato: z.string().max(40000).nullable().optional(),
  status: z.string().max(100).nullable().optional(),
  data_protocolo: z.string().max(50).nullable().optional(),
  url: z.string().max(1000).nullable().optional(),
  detalhes: z.record(z.string(), z.any()).nullable().optional(),
});

const BodySchema = z.object({
  protocolos: z.array(ProtocoloSchema).max(2000),
  origem: z.enum(["extensao", "worker"]).optional(),
});

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function variantesNumero(n: string): string[] {
  const trim = (n || "").trim();
  if (!trim) return [];
  const [num, ano] = trim.split("/");
  if (!num || !ano) return [trim];
  const semPontos = num.replace(/\./g, "");
  const numLimpo = String(parseInt(semPontos, 10));
  const out = new Set<string>([trim, `${numLimpo}/${ano}`]);
  if (numLimpo.length > 3) {
    const comPonto = numLimpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    out.add(`${comPonto}/${ano}`);
  }
  return Array.from(out);
}

// Converte "dd/mm/yyyy" (e variações com horário) para ISO "yyyy-mm-dd"
function parseDataBr(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function mapCategoria(finalidade: string | null | undefined): string | null {
  if (!finalidade) return null;
  const f = norm(finalidade);
  if (f.startsWith("reclama")) return "reclamacao";
  if (f.startsWith("elogio")) return "elogio";
  if (f.startsWith("denun")) return "denuncia";
  if (f.startsWith("sugest")) return "sugestao";
  if (f.startsWith("solicit")) return "solicitacao";
  if (f.includes("informa")) return "pedido_informacao";
  return null;
}

export const Route = createFileRoute("/api/public/ingest-protocolos")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        if (await licencaBloqueadaAdmin()) return respostaBloqueada();
        const inicio = Date.now();
        const expected = process.env.INGEST_TOKEN;
        if (!expected) {
          return Response.json({ error: "INGEST_TOKEN não configurado" }, { status: 500, headers: corsHeaders() });
        }
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token || token !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
        }

        const { ingestaoPausada } = await import("@/lib/import-maintenance.server");
        if (ingestaoPausada()) return Response.json({ sucesso: false, erro: "Ingestão pausada para importação de backup" }, { status: 503, headers: { ...corsHeaders(), "Retry-After": "300" } });
        let body: unknown;
        try { body = await request.json(); } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400, headers: corsHeaders() });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Payload inválido", detalhes: parsed.error.flatten() },
            { status: 400, headers: corsHeaders() },
          );
        }

        const { protocolos, origem = "extensao" } = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          if (protocolos.length === 0) {
            await supabaseAdmin.from("coletas").insert({
              total: 0, novos: 0, sucesso: true, origem,
              erro: "Coleta via extensão (vazia)", duracao_ms: Date.now() - inicio,
            });
            return Response.json({ sucesso: true, total: 0, atualizados: 0, ignorados: 0 }, { headers: corsHeaders() });
          }

          // Novo modelo: NÃO inserimos nada no sistema geral. Para cada item
          // recebido, procuramos um protocolo existente pelo número e
          // concluímos com link/data vindos do 1doc.
          const hoje = new Date().toISOString().slice(0, 10);

          // Mapa: variante -> número original recebido (para casar de volta)
          const todasVariantes = new Set<string>();
          const variantesPorNum = new Map<string, string[]>();
          for (const p of protocolos) {
            const v = variantesNumero(p.numero);
            variantesPorNum.set(p.numero, v);
            for (const x of v) todasVariantes.add(x);
          }

          const { data: existentes, error: errSel } = await supabaseAdmin
            .from("protocolos")
            .select("id, numero, status")
            .in("numero", Array.from(todasVariantes));
          if (errSel) throw new Error(errSel.message);

          // numeroVariante -> { id, status }
          const porVariante = new Map<string, { id: string; status: string | null }>();
          for (const r of existentes || []) {
            porVariante.set(r.numero, { id: r.id, status: r.status });
          }

          let atualizados = 0;
          let semCorrespondencia = 0;
          let jaConcluidos = 0;
          let antigosAtualizados = 0;
          const ignoradosDetalhes: Array<{ numero: string; motivo: string; url: string | null }> = [];
          const jaConcluidosLista: Array<{ numero: string; url: string | null }> = [];
          const semCorrespondenciaLista: Array<{ numero: string; url: string | null }> = [];

          // Índice de protocolos antigos (planilhas históricas) por numero+ano
          const ouvidoriasJson = (await import("@/data/ouvidorias.json")).default as Array<{
            source: string; numero: number; data: string;
          }>;
          const antigosIndex = new Map<string, { source: string; numero: number; ano: number }>();
          for (const r of ouvidoriasJson) {
            const ano = Number((r.data || "").slice(0, 4));
            if (!ano || !r.numero) continue;
            antigosIndex.set(`${r.numero}|${ano}`, { source: r.source, numero: r.numero, ano });
          }

          for (const p of protocolos) {
            const vs = variantesPorNum.get(p.numero) || [p.numero];
            const match = vs.map((v) => porVariante.get(v)).find(Boolean);
            const det = (p.detalhes || {}) as Record<string, any>;
            const dataConclusao =
              parseDataBr((det.data_arquivamento || det.data_finalizacao || det.data) as string | undefined) || hoje;
            if (!match) {
              // Tenta match em protocolos antigos (Brusque / Saúde).
              const [numPart, anoPart] = p.numero.split("/");
              const numLimpo = Number((numPart || "").replace(/\./g, ""));
              const ano = Number(anoPart);
              const antigo = numLimpo && ano ? antigosIndex.get(`${numLimpo}|${ano}`) : null;
              if (antigo) {
                const { error: errUp } = await supabaseAdmin
                  .from("protocolos_antigos_conclusoes")
                  .upsert(
                    {
                      source: antigo.source,
                      numero: antigo.numero,
                      ano: antigo.ano,
                      url: p.url ?? null,
                      data_conclusao: dataConclusao,
                    ...(det.despacho ? { resolucao: String(det.despacho) } : {}),
                    },
                    { onConflict: "source,numero,ano" },
                  );
                if (errUp) throw new Error(`Erro ao concluir antigo ${p.numero}: ${errUp.message}`);
                antigosAtualizados++;
                continue;
              }
              semCorrespondencia++;
              ignoradosDetalhes.push({ numero: p.numero, motivo: "sem_correspondencia", url: p.url ?? null });
              semCorrespondenciaLista.push({ numero: p.numero, url: p.url ?? null });
              continue;
            }
            if (match.status === "concluido") {
            // Mesmo já concluído, atualizamos a Resolução / URL com o último despacho.
            if (det.despacho || p.url) {
              await supabaseAdmin
                .from("protocolos")
                .update({
                  ...(p.url ? { url: p.url } : {}),
                  ...(det.despacho ? { resolucao: String(det.despacho) } : {}),
                })
                .eq("id", match.id);
            }
              jaConcluidos++;
              ignoradosDetalhes.push({ numero: p.numero, motivo: "ja_concluido", url: p.url ?? null });
              jaConcluidosLista.push({ numero: p.numero, url: p.url ?? null });
              continue;
            }

            const { error: errUpd } = await supabaseAdmin
              .from("protocolos")
              .update({
                status: "concluido",
                data_conclusao: dataConclusao,
                url: p.url ?? null,
                ...(det.despacho ? { resolucao: String(det.despacho) } : {}),
                ...(mapCategoria(det.finalidade as string | undefined)
                  ? { categoria: mapCategoria(det.finalidade as string | undefined) as any }
                  : {}),
              })
              .eq("id", match.id);
            if (errUpd) throw new Error(`Erro ao atualizar ${p.numero}: ${errUpd.message}`);
            atualizados++;
          }

          await supabaseAdmin.from("coletas").insert({
            total: protocolos.length,
            novos: atualizados + antigosAtualizados,
            atualizados: atualizados + antigosAtualizados,
            ja_concluidos: jaConcluidos,
            sem_correspondencia: semCorrespondencia,
            ignorados_detalhes: ignoradosDetalhes,
            sucesso: true,
            erro: null,
            duracao_ms: Date.now() - inicio,
            origem,
          });

          return Response.json(
            {
              sucesso: true,
              total: protocolos.length,
              atualizados: atualizados + antigosAtualizados,
              atualizadosAtuais: atualizados,
              antigosAtualizados,
              jaConcluidos,
              ignorados: semCorrespondencia,
              jaConcluidosLista,
              semCorrespondenciaLista,
            },
            { headers: corsHeaders() },
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("coletas").insert({
            total: 0, novos: 0, sucesso: false, origem,
            erro: `Extensão: ${msg}`, duracao_ms: Date.now() - inicio,
          });
          return Response.json({ sucesso: false, erro: msg }, { status: 500, headers: corsHeaders() });
        }
      },
    },
  },
});
