import { urlValida1doc } from "./url-1doc";
import { PROTOCOLO_EXTRACT_SYSTEM, normalizarExtracao, sanitizarTextoProtocolo } from "@/lib/protocolo-extract.shared";
import { gerarNumeroProtocolo } from "@/lib/prazo";
import { extrairPedidoEsic, acaoNotificacaoEsic } from "./esic";
import { exigirIngestaoAtiva } from "./import-maintenance.server";
import { mapDepartmentOf } from "@/lib/map-departments";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Mapeamento de assunto/categoria → nome da secretaria responsável.
// Os valores devem bater (após normalização) com `secretarias.nome` no banco.
const ASSUNTO_PARA_SECRETARIA: Record<string, string> = {
  // Assistência Social / Programas Sociais
  "Assistência Social": "SDS - Assistencia Social",
  "Programas Sociais": "SDS - Assistencia Social",
  // Educação
  "Creches e Escolas": "SME - Educação",
  // RH / Conduta
  "Conduta de Funcionários": "SAGE RH",
  "Denúncia de Assédio": "SAGE RH",
  "Recursos Humanos": "SAGE RH",
  // Saneamento
  "Esgoto": "Administração/SAMAE",
  // Vigilância Sanitária → subgrupo de Saúde
  "Condição sanitária irregular": "Saúde",
  "Falta de Higiene": "Saúde",
  "Foco de dengue": "Saúde",
  "Infestação / Proliferação de animais ou pragas": "Saúde",
  // PROCON
  "Estabelecimento sem nota fiscal": "PROCON",
  "Mercadorias vencidas": "PROCON",
  // SEFAZ
  "Estabelecimento sem alvará": "SEFAZ",
  "Pagamentos": "SEFAZ",
  // Defesa Civil
  "Estabelecimento sem saída de emergência": "Defesa Civil",
  "Risco de desmoronamento": "Defesa Civil",
  // SEPLAN / Urbanismo
  "Estabelecimento com acessibilidade irregular": "SEPLAN",
  "Ocupação irregular de área pública": "SEPLAN",
  "Construção Irregular": "SEPLAN",
  "Fiscalização de Obras": "SEPLAN",
  "Imóvel abandonado": "SEPLAN",
  "Invasão de área pública": "SEPLAN",
  // Controladoria / Governo
  "Abuso de poder": "Controladoria",
  "Demora em processo": "Controladoria",
  "Desorganização": "Controladoria",
  "Desvio de função": "Controladoria",
  "Desvio de verba pública": "Controladoria",
  "Nepotismo": "Controladoria",
  // Infraestrutura / Energia
  "Iluminação e Energia": "SIE - Infraestrutura Estratégica",
  // Obras / Limpeza urbana
  "Coleta de Lixo Comum": "Secretaria de Obras",
  "Coleta pesada": "Secretaria de Obras",
  "Entulho em via pública": "Secretaria de Obras",
  "Limpeza em terreno baldio": "Secretaria de Obras",
  "Limpeza urbana": "Secretaria de Obras",
  "Mato alto": "Secretaria de Obras",
  "Poda de árvores de rua": "Secretaria de Obras",
  "Asfalto": "Secretaria de Obras",
  "Buraco": "Secretaria de Obras",
  "Calçadas": "Secretaria de Obras",
  "Via sem pavimentação (Estrada de chão)": "Secretaria de Obras",
  "Demora em Obra Pública": "Secretaria de Obras",
  "Serviço mal feito": "Secretaria de Obras",
  // Meio Ambiente
  "Aterro sanitário irregular": "Fundema",
  "Desmatamento irregular": "Fundema",
  "Poluição Ambiental": "Fundema",
  "Queimada irregular": "Fundema",
  // Animais
  "Maus tratos a animais": "Bem-Estar Animal",
  // Esportes
  "Praça e ou quadra para lazer e esportes": "Esportes",
  // Saúde
  "Demora em marcar consulta / procedimento": "Saúde",
  "Falta de materiais em Posto de Saúde": "Saúde",
  "Falta de medicação": "Saúde",
  "Médicos": "Saúde",
  "Postos de Saúde": "Saúde",
  "Transporte para tratamento": "Saúde",
  "Vacinas": "Saúde",
  // Segurança
  "Baderna": "COPPEASM",
  "Ponto de assalto/roubo": "COPPEASM",
  "Ponto de tráfico de drogas": "COPPEASM",
  // Trânsito
  "Acessibilidade para deficientes visuais": "SETRAM",
  "Bloqueio na via": "SETRAM",
  "Estacionamento irregular": "SETRAM",
  "Faixa de pedestre": "SETRAM",
  "Lombadas": "SETRAM",
  "Placas de sinalização": "SETRAM",
  "Semáforos": "SETRAM",
  // Transporte Público
  "Horários de Ônibus": "SETRAM",
  "Ônibus danificado": "SETRAM",
  "Ponto de ônibus": "SETRAM",
  "Super-lotação em ônibus": "SETRAM",
  "Transporte irregular": "SETRAM",
};

function normalizarNumero(n: string): string[] {
  // Retorna variantes equivalentes do mesmo número (com/sem pontos de milhar)
  const trim = (n || "").trim();
  if (!trim) return [];
  const [num, ano] = trim.split("/");
  if (!num || !ano) return [trim];
  const semPontos = num.replace(/\./g, "");
  const numLimpo = String(parseInt(semPontos, 10));
  const variantes = new Set<string>([trim]);
  // sem separador de milhar
  variantes.add(`${numLimpo}/${ano}`);
  // com ponto a cada 3 dígitos (pt-BR)
  if (numLimpo.length > 3) {
    const comPonto = numLimpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    variantes.add(`${comPonto}/${ano}`);
  }
  return Array.from(variantes);
}

// Extrai o número real da Ouvidoria/Protocolo do assunto (ou corpo como
// fallback). Padrões observados nos e-mails do 1Doc:
//   "Ouvidoria 2.078/2026: ..."  →  "2.078/2026"
//   "Ouvidoria Nº 2.084/2026"    →  "2.084/2026"
//   "Protocolo 123/2026"         →  "123/2026"
//   "e-SIC 45/2026"              →  "45/2026"
function extrairNumeroDoAssunto(assunto: string, corpo: string): string | null {
  const numRe = String.raw`(\d{1,4}(?:\.\d{3})*\/20\d{2})`;
  const padroes = [
    new RegExp(String.raw`Ouvidoria\s+(?:n[ºo°]\s*)?` + numRe, "i"),
    new RegExp(String.raw`Protocolo\s+(?:n[ºo°]\s*)?` + numRe, "i"),
    new RegExp(String.raw`e[\s\-]?sic\s+(?:n[ºo°]\s*)?` + numRe, "i"),
    new RegExp(String.raw`\bLAI\s+(?:n[ºo°]\s*)?` + numRe, "i"),
  ];
  for (const re of padroes) {
    const m = assunto?.match(re);
    if (m?.[1]) return m[1];
  }
  // Fallback genérico no assunto e depois nas primeiras linhas do corpo
  const generic = new RegExp(numRe);
  const ms = assunto?.match(generic);
  if (ms?.[1]) return ms[1];
  const mc = (corpo || "").slice(0, 2000).match(generic);
  if (mc?.[1]) return mc[1];
  return null;
}

function stripAssuntoPrefixo(s: string): string {
  if (!s) return s;
  return s.replace(/^\s*(Ouvidoria|LAI|E-?SIC|Manifesta(?:ç|c)(?:ã|a)o)\s+[\d.]+\/\d{2,4}\s*[:\-–]\s*/i, "").trim();
}

function detectarAcao(assunto: string, corpo: string): "conclusao" | "atualizacao" {
  const texto = norm(`${assunto}\n${corpo}`);
  const padroesConclusao = [
    "encerrad", "encerramento", "finalizad", "finalizacao",
    "conclui", "conclus", "concluid",
    "baixa", "dar baixa", "deu baixa",
    "arquivad", "arquivamento",
    "respondida e encerrada", "atendid",
  ];
  if (padroesConclusao.some(p => texto.includes(p))) return "conclusao";
  return "atualizacao";
}

// Extrai o link "Acompanhar online" do corpo do e-mail do 1Doc.
// Considera HTML (href) e texto, decodifica entidades/quoted-printable,
// desembrulha redirecionadores e valida a URL antes de aceitar.
const limparUrl1doc = urlValida1doc;

function extrairLinkAcompanhar(corpo: string): string | null {
  if (!corpo) return null;
  const texto = corpo.replace(/\r\n/g, "\n").replace(/=\n/g, "").replace(/=3D/gi, "=");
  const candidatos: string[] = [];

  // 1) <a href="...">...Acompanhar online...</a>
  const aRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const anchors: { href: string; txt: string }[] = [];
  while ((m = aRe.exec(texto))) anchors.push({ href: m[1], txt: m[2].replace(/<[^>]+>/g, " ") });
  for (const a of anchors) if (/acompanhar/i.test(a.txt)) candidatos.push(a.href);

  // 2) Texto: "Acompanhar online" seguido de URL (inclui formato <https://...> ou [https://...])
  const urlRe = /https?:\/\/[^\s<>"'\]]+/gi;
  const idx = texto.search(/Acompanhar\s+online/i);
  if (idx >= 0) {
    const trecho = texto.slice(idx, idx + 1500);
    const us = trecho.match(urlRe) || [];
    candidatos.push(...us.filter(x => /1doc/i.test(x)), ...us);
  }

  // 3) Qualquer href/URL de 1doc
  for (const a of anchors) if (/1doc/i.test(a.href)) candidatos.push(a.href);
  candidatos.push(...(texto.match(urlRe) || []).filter(x => /1doc/i.test(x)));

  for (const c of candidatos) {
    const ok = limparUrl1doc(c);
    if (ok && !/\.(png|jpe?g|gif|svg|css)(\?|$)/i.test(ok)) return ok;
  }
  return null;
}

async function extrairComIA(texto: string) {
  const { aiChatDetailed } = await import("./ai-chat.server");
  const { content, provider } = await aiChatDetailed({
    messages: [
      { role: "system", content: PROTOCOLO_EXTRACT_SYSTEM },
      { role: "user", content: (sanitizarTextoProtocolo(texto) || texto).slice(0, 18000) },
    ],
    responseFormat: "json_object",
  });
  let parsed: any = {};
  try { parsed = JSON.parse(content); } catch { /* A validação usa campos vazios quando a IA não retorna JSON. */ }
  return { extr: normalizarExtracao(parsed), provider };
}

export type IngestInput = {
  account: any;
  remetente: string;
  destinatario: string;
  assunto: string;
  corpo: string;
  externalId?: string;
  existingLogId?: string;
};

export async function ingerirEmail(input: IngestInput): Promise<{ ok: boolean; protocoloId?: string; numero?: string; logId?: string; error?: string }> {
  exigirIngestaoAtiva();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { account, remetente, destinatario, externalId } = input;
  const { corrigirAcentos } = await import("./corrigir-acentos");
  const assunto = corrigirAcentos(input.assunto ?? "");
  const corpo = corrigirAcentos(input.corpo ?? "");
  const pedidoEsic = extrairPedidoEsic(`${assunto}\n${corpo}`);
  const emailEhEsic = !!pedidoEsic;
  const textoCompleto = [`De: ${remetente}`, `Para: ${destinatario}`, `Assunto: ${assunto}`, "", corpo].join("\n");
  let logId = input.existingLogId;

  if (externalId) {
    const { data: existente, error } = await supabaseAdmin
      .from("email_inbox_log").select("id, status, protocolo_id")
      .eq("account_id", account.id).eq("external_id", externalId).maybeSingle();
    if (error) throw error;
    if (existente?.protocolo_id || existente?.status === "processado") {
      return { ok: true, logId: existente.id };
    }
    if (existente) logId = existente.id;
  }

  if (logId) {
    const { error: logErr } = await supabaseAdmin.from("email_inbox_log")
      .update({
        account_id: account.id, remetente, destinatario, assunto,
        corpo: textoCompleto.slice(0, 20000), status: "pendente", erro: null,
        processado_em: null,
        ai_provider: null,
        external_id: externalId ?? null,
      })
      .eq("id", logId);
    if (logErr) throw logErr;
  } else {
    const { data: logRow, error: logErr } = await supabaseAdmin
      .from("email_inbox_log")
      .insert({
        account_id: account.id, remetente, destinatario, assunto,
        corpo: textoCompleto.slice(0, 20000), status: "pendente",
        external_id: externalId ?? null,
      })
      .select("id").single();
    if (logErr) throw logErr;
    logId = logRow.id;
  }

  try {
    if (textoCompleto.trim().length < 10) throw new Error("Conteúdo vazio");

    // Atualização/baixa reconhecível pelo número no assunto: não gasta uma
    // chamada de IA para reclassificar um protocolo que já existe.
    if (emailEhEsic && !pedidoEsic.numero) throw new Error("Número do pedido e-SIC não identificado; revise o e-mail antes de reprocessar.");
    const numeroAssuntoRapido = pedidoEsic?.numero || extrairNumeroDoAssunto(assunto, corpo);
    if (numeroAssuntoRapido) {
      const consultaRapida = emailEhEsic
        ? supabaseAdmin.rpc("protocolo_esic_por_numero", { p_numero: numeroAssuntoRapido })
        : supabaseAdmin.from("protocolos").select("id, numero, status")
          .neq("tipo", "esic").in("numero", normalizarNumero(numeroAssuntoRapido));
      const { data: existente, error: errExistente } = await consultaRapida.maybeSingle();
      if (errExistente) throw errExistente;
      if (existente) {
        const acao = emailEhEsic ? acaoNotificacaoEsic(assunto) : detectarAcao(assunto, corpo);
        const linkAcomp = extrairLinkAcompanhar(corpo);
        const resumoEmail = [
          `E-mail recebido em ${new Date().toLocaleString("pt-BR")}`,
          `De: ${remetente}`,
          `Assunto: ${assunto}`,
          "",
          corpo.slice(0, 4000),
        ].join("\n");
        if (acao === "conclusao" && existente.status !== "concluido") {
          const { error } = await supabaseAdmin.from("protocolos")
            .update({
              status: "concluido",
              data_conclusao: new Date().toISOString().slice(0, 10),
              ...(linkAcomp ? { url: linkAcomp } : {}),
            })
            .eq("id", existente.id);
          if (error) throw error;
        } else if (linkAcomp) {
          const { error } = await supabaseAdmin.from("protocolos")
            .update({ url: linkAcomp }).eq("id", existente.id).is("url", null);
          if (error) throw error;
        }
        const { error: errHist } = await supabaseAdmin.from("protocolo_historico").insert({
          protocolo_id: existente.id,
          campo: acao === "conclusao" ? "_baixa_email" : "_atualizacao_email",
          valor_anterior: null,
          valor_novo: resumoEmail.slice(0, 8000),
          acao: acao === "conclusao" ? "baixa" : "atualizacao",
          autor_nome: `E-mail · ${remetente}`.slice(0, 200),
        });
        if (errHist) throw errHist;
        const { error: errLog } = await supabaseAdmin.from("email_inbox_log").update({
          status: "processado", protocolo_id: existente.id,
          processado_em: new Date().toISOString(),
          erro: acao === "conclusao" ? "baixa registrada" : "atualização registrada",
          ai_provider: null,
        }).eq("id", logId!);
        if (errLog) throw errLog;
        return { ok: true, protocoloId: existente.id, numero: existente.numero, logId };
      }
    }

    const { extr, provider: aiProvider } = pedidoEsic
      ? { extr: pedidoEsic, provider: null }
      : await extrairComIA(textoCompleto);
    // Marca imediatamente qual IA processou este e-mail (útil quando o
    // fluxo falhar mais adiante mas a extração já aconteceu).
    {
      const { error: errAi } = await supabaseAdmin.from("email_inbox_log")
        .update({ ai_provider: aiProvider }).eq("id", logId!);
      if (errAi) console.error("[ingest] falha ao gravar ai_provider:", errAi);
    }

    const numeroDoAssunto = pedidoEsic?.numero || extrairNumeroDoAssunto(assunto, corpo);
    if (numeroDoAssunto) extr.numero = numeroDoAssunto;

    if (emailEhEsic) {
      extr.tipo = "esic";
      extr.categoria = "pedido_informacao";
    }
    const numeroEsic = emailEhEsic ? (formatarNumeroEsic(numeroDoAssunto || extr.numero) || null) : null;

    // ===== Detectar se é atualização/baixa de protocolo já existente =====
    if (extr.numero) {
      const variantes = normalizarNumero(extr.numero);
      const consultaExistente = emailEhEsic && numeroEsic
        ? supabaseAdmin.rpc("protocolo_esic_por_numero", { p_numero: numeroEsic })
        : supabaseAdmin.from("protocolos").select("id, numero, status")
          .neq("tipo", "esic").in("numero", variantes);
      const { data: existente, error: erroBusca } = await consultaExistente.maybeSingle();
      if (erroBusca) throw erroBusca;

      if (existente) {
        const acao = emailEhEsic ? acaoNotificacaoEsic(assunto) : detectarAcao(assunto, corpo);
        const linkAcomp = extrairLinkAcompanhar(corpo);
        const resumoEmail = [
          `E-mail recebido em ${new Date().toLocaleString("pt-BR")}`,
          `De: ${remetente}`,
          `Assunto: ${assunto}`,
          "",
          (corpo || "").slice(0, 4000),
        ].join("\n");

        if (acao === "conclusao" && existente.status !== "concluido") {
          const hoje = new Date().toISOString().slice(0, 10);
          await supabaseAdmin
            .from("protocolos")
            .update({ status: "concluido", data_conclusao: hoje, ...(linkAcomp ? { url: linkAcomp } : {}) })
            .eq("id", existente.id);
        } else if (linkAcomp) {
          // Atualiza url se ainda não estiver preenchida
          await supabaseAdmin
            .from("protocolos")
            .update({ url: linkAcomp })
            .eq("id", existente.id)
            .is("url", null);
        }

        await supabaseAdmin.from("protocolo_historico").insert({
          protocolo_id: existente.id,
          campo: acao === "conclusao" ? "_baixa_email" : "_atualizacao_email",
          valor_anterior: null,
          valor_novo: resumoEmail.slice(0, 8000),
          acao: acao === "conclusao" ? "baixa" : "atualizacao",
          autor_nome: `E-mail · ${remetente}`.slice(0, 200),
        });

        await supabaseAdmin.from("email_inbox_log").update({
          status: "processado",
          protocolo_id: existente.id,
          processado_em: new Date().toISOString(),
          erro: acao === "conclusao" ? "baixa registrada" : "atualização registrada",
          ai_provider: aiProvider,
        }).eq("id", logId!);

        return { ok: true, protocoloId: existente.id, numero: existente.numero, logId };
      }
    }

    let secretariaId: string | null = emailEhEsic ? null : account.secretaria_id;
    let forcarTriagemAssunto = false;
    if (!emailEhEsic && !secretariaId) {
      const { data: secs } = await supabaseAdmin.from("secretarias").select("id, nome, sigla");

      // 1) Tenta pelo destinatário do e-mail (header "Para:")
      if (extr.secretaria_sugerida) {
        const alvo = norm(extr.secretaria_sugerida);
        const hit = (secs ?? []).find(s =>
          norm(s.nome).includes(alvo) || alvo.includes(norm(s.nome)) ||
          (s.sigla && norm(s.sigla) === alvo)
        );
        if (hit) secretariaId = hit.id;
      }

      // 2) Fallback: usa o vínculo assunto → secretaria salvo no catálogo (tabela assuntos)
      if (!secretariaId && extr.assunto_categoria) {
        const alvoAssunto = norm(extr.assunto_categoria);
        const { data: matches } = await supabaseAdmin
          .from("assuntos")
          .select("nome, secretaria_id, forcar_triagem")
          .eq("ativo", true)
          ;
        const hit = (matches ?? []).find((a: any) => {
          const n = norm(a.nome);
          return n === alvoAssunto || alvoAssunto.includes(n);
        });
        if (hit?.forcar_triagem) forcarTriagemAssunto = true;
        if (hit?.secretaria_id) secretariaId = hit.secretaria_id;

        // 3) Último fallback: mapa hard-coded (compat para assuntos ainda não cadastrados)
        if (!secretariaId) {
          const alvoNome = ASSUNTO_PARA_SECRETARIA[extr.assunto_categoria];
          if (alvoNome) {
            const alvo = norm(alvoNome);
            const hitSec = (secs ?? []).find(s => norm(s.nome) === alvo);
            if (hitSec) secretariaId = hitSec.id;
          }
        }
      }
    }

    // Mesmo quando a conta de e-mail já amarra a secretaria, ainda assim
    // respeita a flag forcar_triagem do catálogo de assuntos.
    if (!emailEhEsic && !forcarTriagemAssunto && extr.assunto_categoria) {
      const alvoAssunto = norm(extr.assunto_categoria);
      const { data: matchFlag } = await supabaseAdmin
        .from("assuntos")
        .select("nome, forcar_triagem")
        .eq("ativo", true)
        .eq("forcar_triagem", true);
      if ((matchFlag ?? []).some((a: any) => {
        const n = norm(a.nome);
        return n === alvoAssunto || alvoAssunto.includes(n);
      })) {
        forcarTriagemAssunto = true;
      }
    }

    let localId: string | null = null;
    if (!emailEhEsic && secretariaId && extr.local_sugerido) {
      const { data: locs } = await supabaseAdmin
        .from("locais").select("id, nome").eq("secretaria_id", secretariaId);
      const alvo = norm(extr.local_sugerido);
      const hit = (locs ?? []).find(l => norm(l.nome).includes(alvo) || alvo.includes(norm(l.nome)));
      if (hit) localId = hit.id;
    }

    // Fallback: para secretarias sem subgrupos (todas exceto Saúde), o local
    // padrão deve ser a unidade com o mesmo nome/sigla da própria secretaria.
    // Ex.: SEPLAN → local "SEPLAN". A Saúde tem várias UBS, então não se aplica.
    if (!emailEhEsic && secretariaId && !localId) {
      const { data: secRow } = await supabaseAdmin
        .from("secretarias")
        .select("nome, sigla")
        .eq("id", secretariaId)
        .maybeSingle();
      const secNome = norm(secRow?.nome ?? "");
      const ehSaude = /\bsaude\b/.test(secNome);
      if (secRow && !ehSaude) {
        const { data: locs } = await supabaseAdmin
          .from("locais")
          .select("id, nome")
          .eq("secretaria_id", secretariaId);
        const alvos = [norm(secRow.nome ?? ""), norm(secRow.sigla ?? "")].filter(Boolean);
        const hit = (locs ?? []).find(l => {
          const n = norm(l.nome);
          return alvos.some(a => n === a || n.includes(a) || a.includes(n));
        });
        if (hit) localId = hit.id;
      }
    }

    // e-SIC mantém o número externo em campo próprio; numero continua sendo
    // o identificador interno, único e compatível com o restante do sistema.
    let numero: string;
    let numeroGerado = false;
    if (emailEhEsic) {
      numero = "";
      for (let tentativa = 0; tentativa < 20 && !numero; tentativa++) {
        const candidato = gerarNumeroProtocolo("esic");
        const { data: existeNumero, error } = await supabaseAdmin
          .from("protocolos").select("id")
          .in("numero", normalizarNumero(candidato)).maybeSingle();
        if (error) throw error;
        if (!existeNumero) numero = candidato;
      }
      if (!numero) throw new Error("Não foi possível gerar um número interno único para o pedido e-SIC.");
      numeroGerado = true;
    } else if (numeroDoAssunto) {
      numero = numeroDoAssunto;
    } else if (extr.numero) {
      numero = extr.numero;
    } else {
      numero = gerarNumeroProtocolo(extr.tipo);
      numeroGerado = true;
    }

    // Última checagem de duplicidade considerando variantes (com/sem
    // separador de milhar) antes de inserir, para o caso de o lookup
    // anterior ter falhado (ex.: número só apareceu no assunto e a IA
    // tinha devolvido outro valor).
    {
      const variantes = normalizarNumero(numero);
      const { data: jaExiste } = await supabaseAdmin
        .from("protocolos")
        .select("id, numero, tipo")
        .in("numero", variantes)
        .maybeSingle();
      if (jaExiste) {
        if (emailEhEsic || jaExiste.tipo === "esic") throw new Error("Número interno em uso; reprocessar para gerar outro identificador.");
        await supabaseAdmin.from("email_inbox_log").update({
          status: "processado",
          protocolo_id: jaExiste.id,
          processado_em: new Date().toISOString(),
          erro: "duplicado (mesmo número já existia)",
          ai_provider: aiProvider,
        }).eq("id", logId!);
        return { ok: true, protocoloId: jaExiste.id, numero: jaExiste.numero, logId };
      }
    }
    const dataAbertura = extr.data_abertura || new Date().toISOString().slice(0, 10);

    const resumo = [
      emailEhEsic ? "Novo Pedido e-SIC recebido." : "Nova Ouvidoria recebida.",
      "",
      ...(emailEhEsic
        ? [`Nº e-SIC: ${numeroEsic || "não identificado"}`, `Nº interno: ${numero}`]
        : [`Nº: ${extr.numero || numero}`]),
      `Assunto: ${extr.assunto || assunto || ""}`,
      `De: ${extr.solicitante || "-"}`,
      `Para: ${extr.destinatario || ""}`,
    ].join("\n");

    const { data: secretariaAtribuida } = secretariaId
      ? await supabaseAdmin.from("secretarias").select("nome, sigla").eq("id", secretariaId).maybeSingle()
      : { data: null };
    const secretariaEObras = mapDepartmentOf(secretariaAtribuida ?? {}) === "obras";

    // e-SIC e Obras/SOSU sempre entram na triagem. Ouvidorias das demais áreas seguem as regras existentes:
    //  (a) não conseguimos identificar a secretaria responsável, OU
    //  (b) o assunto é da Saúde e exige decidir qual UBS/CAPS atende, OU
    //  (c) o assunto está marcado para triagem no catálogo.
    // Demais assuntos com secretaria identificada seguem direto, sem triagem.
    const ASSUNTOS_SAUDE_TRIAGEM = [
      "demora em marcar consulta / procedimento",
      "falta de materiais em posto de saude",
      "falta de medicacao",
      "medicos",
      "postos de saude",
      "transporte para tratamento",
      "vacinas",
    ];
    // Usa "contém" porque o assunto pode vir prefixado (ex.: "Ouvidoria
    // 2.240/2026: Postos de Saúde") ou com pequenas variações de grafia.
    const assuntoNorm = norm(extr.assunto_categoria || extr.assunto || "");
    const casaSaude = ASSUNTOS_SAUDE_TRIAGEM.some((a) => assuntoNorm.includes(a));
    const precisaTriagem = emailEhEsic || secretariaEObras || (
      extr.tipo === "ouvidoria" && (forcarTriagemAssunto || !secretariaId || casaSaude)
    );

    const { data: novo, error: errIns } = await supabaseAdmin
      .from("protocolos")
      .insert({
        numero,
        numero_esic: numeroEsic,
        tipo: extr.tipo,
        categoria: emailEhEsic ? "pedido_informacao" : extr.categoria,
        assunto: stripAssuntoPrefixo(extr.assunto || assunto || "Sem assunto"),
        descricao: resumo,
        solicitante: extr.solicitante || remetente || null,
        secretaria_id: secretariaId, local_id: localId,
        data_abertura: dataAbertura, created_by: account.created_by,
        triagem_pendente: precisaTriagem,
        url: extrairLinkAcompanhar(corpo),
      })
      .select("id, numero").single();
    if (errIns) throw errIns;

    await supabaseAdmin.from("email_inbox_log").update({
      status: "processado",
      protocolo_id: novo!.id,
      processado_em: new Date().toISOString(),
      erro: numeroGerado && !emailEhEsic ? "número gerado (não encontrado no e-mail)" : null,
      ai_provider: aiProvider,
    }).eq("id", logId!);

    return { ok: true, protocoloId: novo!.id, numero: novo!.numero, logId };
  } catch (e: any) {
    await supabaseAdmin.from("email_inbox_log").update({
      status: "erro", erro: String(e?.message ?? e).slice(0, 1000),
      processado_em: new Date().toISOString(),
    }).eq("id", logId!);
    return { ok: false, error: String(e?.message ?? e), logId };
  }
}

// ============ GMAIL ============

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function gmailHeaders(): HeadersInit {
  const lov = process.env.LOVABLE_API_KEY;
  const gm = process.env.GOOGLE_MAIL_API_KEY;
  if (!lov || !gm) throw new Error("Conta antiga (conexão da nuvem). Em E-mail → Contas → Nova conta, cadastre este mesmo e-mail com a senha de app para ativar a coleta.");
  return { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": gm };
}

function decodeB64Url(data: string): string {
  try {
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
    return atob(b64);
  } catch { return ""; }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|br|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function extractBody(payload: any): string {
  if (!payload) return "";
  const parts: any[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.body?.data) parts.push({ mime: p.mimeType, data: p.body.data });
    if (Array.isArray(p.parts)) p.parts.forEach(walk);
  };
  walk(payload);
  const plain = parts.find(p => p.mime === "text/plain");
  const html = parts.find(p => p.mime === "text/html");
  const htmlRaw = html ? decodeB64Url(html.data) : "";
  if (plain) {
    // Preserva o HTML bruto no final para que a extração de links
    // (ex.: "Acompanhar online" → href) ainda funcione.
    const plainTxt = decodeB64Url(plain.data);
    return htmlRaw ? `${plainTxt}\n\n<!--HTML-->\n${htmlRaw}` : plainTxt;
  }
  if (htmlRaw) return `${stripHtml(htmlRaw)}\n\n<!--HTML-->\n${htmlRaw}`;
  if (parts[0]) return decodeB64Url(parts[0].data);
  return "";
}

function header(headers: any[], name: string): string {
  const h = headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

class GmailApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function gmailGet(path: string): Promise<any> {
  const response = await fetch(`${GMAIL_GATEWAY}${path}`, { headers: gmailHeaders() });
  if (!response.ok) {
    throw new GmailApiError(response.status, `Gmail ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return response.json();
}

async function gmailProfileHistoryId(): Promise<string> {
  const profile = await gmailGet("/users/me/profile");
  if (typeof profile.historyId !== "string" || !profile.historyId) {
    throw new Error("Gmail profile não retornou historyId");
  }
  return profile.historyId;
}

function gmailQueryRecuperacao(conta: any): string {
  const sucessoAnterior = conta.ultima_sync_sucesso_em;
  const instante = sucessoAnterior ? Date.parse(sucessoAnterior) : Number.NaN;
  if (Number.isFinite(instante)) {
    // Sobreposição de 15 minutos cobre indexação atrasada e é idempotente pelo external_id.
    const depois = Math.max(0, Math.floor(instante / 1000) - 15 * 60);
    return `in:inbox after:${depois}`;
  }
  return `in:inbox newer_than:${conta.ultima_sync_erros > 0 ? 30 : 2}d`;
}

async function listarIdsGmail(query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let pagesRead = 0;
  do {
    const params = new URLSearchParams({ q: query, maxResults: "500" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gmailGet(`/users/me/messages?${params.toString()}`);
    for (const message of page.messages ?? []) {
      if (typeof message.id === "string" && message.id) ids.push(message.id);
    }
    pageToken = page.nextPageToken;
    pagesRead++;
    if (pageToken && pagesRead >= 50) throw new Error("Gmail excedeu 25.000 mensagens na sincronização; cursor não avançado");
  } while (pageToken);
  return [...new Set(ids)];
}

async function listarIdsGmailPendentes(supabaseAdmin: any, accountId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("email_inbox_log")
    .select("external_id")
    .eq("account_id", accountId)
    .in("status", ["erro", "pendente"])
    .is("protocolo_id", null)
    .not("external_id", "is", null)
    .order("processado_em", { ascending: true, nullsFirst: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((row: any) => row.external_id)
    .filter((id: unknown): id is string => typeof id === "string" && !!id);
}

async function listarHistoricoGmail(startHistoryId: string): Promise<{ ids: string[]; historyId: string }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let pagesRead = 0;
  let historyId = startHistoryId;
  do {
    const params = new URLSearchParams({ startHistoryId, maxResults: "500" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await gmailGet(`/users/me/history?${params.toString()}`);
    for (const event of page.history ?? []) {
      for (const added of event.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id);
      }
      for (const added of event.labelsAdded ?? []) {
        if (added.labelIds?.includes("INBOX") && added.message?.id) ids.add(added.message.id);
      }
    }
    if (typeof page.historyId === "string" && page.historyId) historyId = page.historyId;
    pageToken = page.nextPageToken;
    pagesRead++;
    if (pageToken && pagesRead >= 100) throw new Error("Gmail excedeu 50.000 eventos de histórico; cursor não avançado");
  } while (pageToken);
  return { ids: [...ids], historyId };
}

async function processarIdsGmail(
  supabaseAdmin: any,
  conta: any,
  ids: string[],
  stats: { novos: number; erros: number; processados: number; detalhes: any[] },
): Promise<boolean> {
  let sucesso = true;
  for (const id of ids) {
    const { data: logExistente, error: errLog } = await supabaseAdmin.from("email_inbox_log")
      .select("id, protocolo_id, status")
      .eq("account_id", conta.id).eq("external_id", id).maybeSingle();
    if (errLog) {
      stats.erros++;
      sucesso = false;
      stats.detalhes.push({ id, error: errLog.message });
      continue;
    }
    if (logExistente?.protocolo_id || logExistente?.status === "processado") continue;

    try {
      const message = await gmailGet(`/users/me/messages/${encodeURIComponent(id)}?format=full`);
      if (!message.labelIds?.includes("INBOX")) continue;
      const hdrs = message.payload?.headers ?? [];
      const res = await ingerirEmail({
        account: conta,
        remetente: header(hdrs, "From"),
        destinatario: header(hdrs, "To"),
        assunto: header(hdrs, "Subject"),
        corpo: extractBody(message.payload) || message.snippet || "",
        externalId: id,
        existingLogId: logExistente?.id,
      });
      stats.processados++;
      if (res.ok && res.protocoloId) stats.novos++;
      else if (!res.ok) {
        stats.erros++;
        sucesso = false;
      }
      stats.detalhes.push({ id, ok: res.ok, numero: res.numero, error: res.error });
    } catch (error) {
      // Mensagem removida entre o histórico e o download não deve travar o cursor.
      if (error instanceof GmailApiError && error.status === 404) {
        if (logExistente?.id) {
          const { error: errEncerrar } = await supabaseAdmin.from("email_inbox_log").update({
            status: "processado",
            erro: "Mensagem removida do Gmail antes da leitura; sincronização encerrada.",
            processado_em: new Date().toISOString(),
          }).eq("id", logExistente.id);
          if (errEncerrar) {
            stats.erros++;
            sucesso = false;
            stats.detalhes.push({ id, error: errEncerrar.message });
          }
        }
        continue;
      }
      stats.erros++;
      sucesso = false;
      if (logExistente?.id) {
        await supabaseAdmin.from("email_inbox_log")
          .update({ processado_em: new Date().toISOString() }).eq("id", logExistente.id);
      }
      stats.detalhes.push({ id, error: String((error as Error)?.message ?? error) });
    }
  }
  return sucesso;
}

export async function sincronizarGmailContas(): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  exigirIngestaoAtiva();
  return await sincronizarGmailIncremental();
}

async function sincronizarGmailIncremental(): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: contas, error: contasError } = await supabaseAdmin
    .from("email_inbox_accounts").select("*").eq("ativo", true).eq("provider", "gmail");
  if (contasError) throw contasError;

  let novos = 0, erros = 0;
  const detalhes: any[] = [];
  for (const conta of contas ?? []) {
    const stats = { novos: 0, erros: 0, processados: 0, detalhes: [] as any[] };
    let cursor: string | null = conta.gmail_history_id ?? null;
    let cursorParaSalvar: string | null = null;
    let limparCursor = false;
    let processouTudo = true;

    try {
      if (cursor) {
        try {
          const historico = await listarHistoricoGmail(cursor);
          const idsRetry = await listarIdsGmailPendentes(supabaseAdmin, conta.id);
          processouTudo = await processarIdsGmail(supabaseAdmin, conta, [...new Set([...historico.ids, ...idsRetry])], stats);
          cursorParaSalvar = historico.historyId;
        } catch (error) {
          if (!(error instanceof GmailApiError && error.status === 404)) throw error;
          // historyId expirado: refaz a janela desde o último sucesso e inicia novo cursor.
          cursor = null;
          limparCursor = true;
        }
      }

      if (!cursor) {
        let baseline: string | null = null;
        try {
          baseline = await gmailProfileHistoryId();
        } catch (error) {
          // Alguns gateways podem não expor profile/history. A coleta continua
          // pela janela de recuperação paginada, sem salvar cursor inseguro.
          stats.detalhes.push({ aviso: `Gmail history indisponível; usando janela paginada: ${String((error as Error)?.message ?? error)}` });
        }

        const [idsRecentes, idsRetry] = await Promise.all([
          listarIdsGmail(gmailQueryRecuperacao(conta)),
          listarIdsGmailPendentes(supabaseAdmin, conta.id),
        ]);
        const idsRecuperacao = [...new Set([...idsRecentes, ...idsRetry])];
        processouTudo = (await processarIdsGmail(supabaseAdmin, conta, idsRecuperacao, stats)) && processouTudo;

        if (baseline) {
          try {
            const historico = await listarHistoricoGmail(baseline);
            const idsJaProcessados = new Set(idsRecuperacao);
            const idsDuranteBootstrap = historico.ids.filter((id) => !idsJaProcessados.has(id));
            processouTudo = (await processarIdsGmail(supabaseAdmin, conta, idsDuranteBootstrap, stats)) && processouTudo;
            cursorParaSalvar = historico.historyId;
          } catch (error) {
            if (!(error instanceof GmailApiError && error.status === 404)) throw error;
            limparCursor = true;
            cursorParaSalvar = null;
            stats.detalhes.push({ aviso: "Gmail history indisponível após carga inicial; a próxima coleta repetirá a janela de recuperação." });
          }
        }
      }

      const atualizacao: {
        ultima_sincronizacao: string;
        ultima_sync_erro_detalhe: string | null;
        ultima_sync_novos: number;
        ultima_sync_erros: number;
        ultima_sync_processados: number;
        ultima_sync_sucesso_em?: string;
        gmail_history_id?: string | null;
      } = {
        ultima_sincronizacao: new Date().toISOString(),
        ultima_sync_erro_detalhe: stats.erros > 0
          ? (stats.detalhes.find((item: any) => item.error)?.error ?? `${stats.erros} falha(s) na sincronização Gmail`)
          : null,
        ultima_sync_novos: stats.novos,
        ultima_sync_erros: stats.erros,
        ultima_sync_processados: stats.processados,
      };
      if (processouTudo && stats.erros === 0) atualizacao.ultima_sync_sucesso_em = new Date().toISOString();
      if (processouTudo && cursorParaSalvar) atualizacao.gmail_history_id = cursorParaSalvar;
      else if (limparCursor) atualizacao.gmail_history_id = null;
      let queryAtualizacao = supabaseAdmin.from("email_inbox_accounts").update(atualizacao).eq("id", conta.id);
      const alteraCursor = Object.prototype.hasOwnProperty.call(atualizacao, "gmail_history_id");
      if (alteraCursor) {
        queryAtualizacao = conta.gmail_history_id
          ? queryAtualizacao.eq("gmail_history_id", conta.gmail_history_id)
          : queryAtualizacao.is("gmail_history_id", null);
      }
      const { data: contaAtualizada, error: errAtualizacao } = await queryAtualizacao.select("id").maybeSingle();
      if (errAtualizacao) throw errAtualizacao;
      if (alteraCursor && !contaAtualizada) {
        stats.detalhes.push({ aviso: "Cursor Gmail alterado por outra execução; mantive o cursor mais recente." });
      }
    } catch (error) {
      stats.erros++;
      const mensagemErro = String((error as Error)?.message ?? error).slice(0, 1000);
      detalhes.push({ conta: conta.email, error: mensagemErro });
      await supabaseAdmin.from("email_inbox_accounts").update({
        ultima_sincronizacao: new Date().toISOString(),
        ultima_sync_novos: stats.novos,
        ultima_sync_erros: stats.erros,
        ultima_sync_processados: stats.processados,
        ultima_sync_erro_detalhe: mensagemErro,
      }).eq("id", conta.id);
    }

    novos += stats.novos;
    erros += stats.erros;
    detalhes.push(...stats.detalhes.map((item) => ({ conta: conta.email, ...item })));
  }
  return { contas: contas?.length ?? 0, novos, erros, detalhes };
}

export async function ressincronizarGmailContas(dias = 30): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  exigirIngestaoAtiva();
  return await sincronizarGmailContasComJanela(`newer_than:${dias}d`, 100, 20);
}

/**
 * Re-verifica e-mails antigos no Gmail dentro da janela informada, forçando o
 * reprocessamento de mensagens que já existem no log mas que NÃO geraram
 * protocolo (status erro/ignorado/pendente sem protocolo_id). Útil para
 * recuperar ouvidorias que ficaram presas por falha temporária na IA, etc.
 */
export async function reverificarEmailsSemProtocolo(dias = 60): Promise<{ contas: number; reprocessados: number; novos: number; erros: number; detalhes: any[] }> {
  exigirIngestaoAtiva();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = `newer_than:${Math.min(Math.max(dias, 1), 180)}d`;

  const { data: contas } = await supabaseAdmin
    .from("email_inbox_accounts")
    .select("*")
    .eq("ativo", true)
    .eq("provider", "gmail");

  let reprocessados = 0, novos = 0, erros = 0;
  const detalhes: any[] = [];

  for (const conta of contas ?? []) {
    try {
      const todasMsgs: { id: string }[] = [];
      let pageToken: string | undefined;
      let pagesRead = 0;
      do {
        const qStr = encodeURIComponent(`in:inbox ${q}`);
        const url = `${GMAIL_GATEWAY}/users/me/messages?maxResults=100&q=${qStr}${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const listRes = await fetch(url, { headers: gmailHeaders() });
        if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
        const listJson = await listRes.json();
        const msgs: { id: string }[] = listJson.messages ?? [];
        todasMsgs.push(...msgs);
        pageToken = listJson.nextPageToken;
        pagesRead++;
      } while (pageToken && pagesRead < 30);

      for (const m of todasMsgs) {
        const { data: logExistente } = await supabaseAdmin.from("email_inbox_log")
          .select("id, protocolo_id, status")
          .eq("account_id", conta.id).eq("external_id", m.id).maybeSingle();

        // Mantém o log processado; um registro com falha será reaproveitado
        // por ingerirEmail sem perder a trilha de auditoria.
        if (logExistente?.protocolo_id || logExistente?.status === "processado") continue;

        const mr = await fetch(`${GMAIL_GATEWAY}/users/me/messages/${m.id}?format=full`, { headers: gmailHeaders() });
        if (!mr.ok) { erros++; continue; }
        const mj = await mr.json();
        const hdrs = mj.payload?.headers ?? [];
        const from = header(hdrs, "From");
        const to = header(hdrs, "To");
        const subject = header(hdrs, "Subject");
        const body = extractBody(mj.payload) || mj.snippet || "";

        const res = await ingerirEmail({
          account: conta, remetente: from, destinatario: to,
          assunto: subject, corpo: body, externalId: m.id,
          existingLogId: logExistente?.id,
        });
        reprocessados++;
        if (res.ok && res.protocoloId) novos++;
        else if (!res.ok) erros++;
        detalhes.push({ id: m.id, subject, ok: res.ok, numero: res.numero, error: res.error });
      }
    } catch (e: any) {
      erros++;
      detalhes.push({ conta: conta.email, error: String(e?.message ?? e) });
    }
  }

  return { contas: contas?.length ?? 0, reprocessados, novos, erros, detalhes };
}

async function sincronizarGmailContasComJanela(q: string, pageSize: number, maxPages: number): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: contas } = await supabaseAdmin
    .from("email_inbox_accounts")
    .select("*")
    .eq("ativo", true)
    .eq("provider", "gmail");

  let novos = 0, erros = 0;
  const detalhes: any[] = [];

  for (const conta of contas ?? []) {
    let contaNovos = 0, contaErros = 0, contaProc = 0;
    try {
      const todasMsgs: { id: string }[] = [];
      let pageToken: string | undefined;
      let pagesRead = 0;
      do {
        const qStr = encodeURIComponent(`in:inbox ${q}`);
        const url = `${GMAIL_GATEWAY}/users/me/messages?maxResults=${pageSize}&q=${qStr}${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const listRes = await fetch(url, { headers: gmailHeaders() });
        if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
        const listJson = await listRes.json();
        const msgs: { id: string }[] = listJson.messages ?? [];
        todasMsgs.push(...msgs);
        pageToken = listJson.nextPageToken;
        pagesRead++;
      } while (pageToken && pagesRead < maxPages);

      for (const m of todasMsgs) {
        // Dedup rápido
        const { data: existe } = await supabaseAdmin.from("email_inbox_log")
          .select("id").eq("account_id", conta.id).eq("external_id", m.id).maybeSingle();
        if (existe) continue;

        const mr = await fetch(`${GMAIL_GATEWAY}/users/me/messages/${m.id}?format=full`, { headers: gmailHeaders() });
        if (!mr.ok) { erros++; contaErros++; continue; }
        const mj = await mr.json();
        const hdrs = mj.payload?.headers ?? [];
        const from = header(hdrs, "From");
        const to = header(hdrs, "To");
        const subject = header(hdrs, "Subject");
        const body = extractBody(mj.payload) || mj.snippet || "";

        const res = await ingerirEmail({
          account: conta, remetente: from, destinatario: to,
          assunto: subject, corpo: body, externalId: m.id,
        });
        contaProc++;
        if (res.ok && res.protocoloId) { novos++; contaNovos++; }
        else if (!res.ok) { erros++; contaErros++; }
        detalhes.push({ id: m.id, subject, ok: res.ok, numero: res.numero, error: res.error });
      }

      await supabaseAdmin.from("email_inbox_accounts")
        .update({
          ultima_sincronizacao: new Date().toISOString(),
          ultima_sync_novos: contaNovos,
          ultima_sync_erros: contaErros,
          ultima_sync_processados: contaProc,
        })
        .eq("id", conta.id);
    } catch (e: any) {
      erros++;
      detalhes.push({ conta: conta.email, error: String(e?.message ?? e) });
    }
  }

  return { contas: contas?.length ?? 0, novos, erros, detalhes };
}

// ============ IMAP (senha de app) ============

export async function reprocessarEmailLog(logId: string): Promise<{ ok: boolean; protocoloId?: string; numero?: string; error?: string }> {
  exigirIngestaoAtiva();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: log, error: logErr } = await supabaseAdmin
    .from("email_inbox_log")
    .select("id, account_id, external_id, protocolo_id")
    .eq("id", logId)
    .maybeSingle();
  if (logErr || !log) return { ok: false, error: "Log não encontrado" };
  if (log.protocolo_id) return { ok: false, error: "E-mail já possui protocolo" };
  if (!log.external_id) return { ok: false, error: "E-mail sem external_id" };
  if (!log.account_id) return { ok: false, error: "E-mail sem conta associada" };

  const { data: conta } = await supabaseAdmin
    .from("email_inbox_accounts").select("*").eq("id", log.account_id).maybeSingle();
  if (!conta) return { ok: false, error: "Conta não encontrada" };
  if (conta.provider !== "gmail") return { ok: false, error: "Reprocessamento suportado apenas para Gmail" };

  const externalId: string = log.external_id;
  const mr = await fetch(`${GMAIL_GATEWAY}/users/me/messages/${externalId}?format=full`, { headers: gmailHeaders() });
  if (!mr.ok) return { ok: false, error: `Gmail ${mr.status}: ${(await mr.text()).slice(0, 200)}` };
  const mj = await mr.json();
  const hdrs = mj.payload?.headers ?? [];
  const from = header(hdrs, "From");
  const to = header(hdrs, "To");
  const subject = header(hdrs, "Subject");
  const body = extractBody(mj.payload) || mj.snippet || "";

  const res = await ingerirEmail({
    account: conta, remetente: from, destinatario: to,
    assunto: subject, corpo: body, externalId,
    existingLogId: log.id,
  });
  return res;
}

export async function sincronizarImapContas(): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  exigirIngestaoAtiva();
  return _sincronizarImapContas();
}

/**
 * Backfill APENAS da URL do 1Doc em protocolos já existentes.
 * - Varre o Gmail em uma janela ampla (dias), sem usar IA.
 * - Não cria protocolos, não altera status, não altera nenhum outro campo.
 * - Só atualiza `protocolos.url` onde estiver NULL, quando o e-mail
 *   correspondente ao mesmo número tiver um link do 1Doc.
 */
export async function backfillUrl1DocViaGmail(dias = 180): Promise<{
  contas: number;
  emails_lidos: number;
  atualizados: number;
  ja_com_url: number;
  sem_link: number;
  sem_numero: number;
  sem_protocolo: number;
  erros: number;
}> {
  exigirIngestaoAtiva();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const q = `newer_than:${Math.min(Math.max(dias, 1), 365)}d`;

  const { data: contas } = await supabaseAdmin
    .from("email_inbox_accounts")
    .select("*")
    .eq("ativo", true)
    .eq("provider", "gmail");

  let emails_lidos = 0, atualizados = 0, ja_com_url = 0;
  let sem_link = 0, sem_numero = 0, sem_protocolo = 0, erros = 0;

  for (const conta of contas ?? []) {
    try {
      const todasMsgs: { id: string }[] = [];
      let pageToken: string | undefined;
      let pagesRead = 0;
      do {
        const qStr = encodeURIComponent(`in:anywhere ${q}`);
        const url = `${GMAIL_GATEWAY}/users/me/messages?maxResults=100&q=${qStr}${pageToken ? `&pageToken=${pageToken}` : ""}`;
        const listRes = await fetch(url, { headers: gmailHeaders() });
        if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
        const listJson = await listRes.json();
        const msgs: { id: string }[] = listJson.messages ?? [];
        todasMsgs.push(...msgs);
        pageToken = listJson.nextPageToken;
        pagesRead++;
      } while (pageToken && pagesRead < 60);

      for (const m of todasMsgs) {
        emails_lidos++;
        try {
          const mr = await fetch(`${GMAIL_GATEWAY}/users/me/messages/${m.id}?format=full`, { headers: gmailHeaders() });
          if (!mr.ok) { erros++; continue; }
          const mj = await mr.json();
          const hdrs = mj.payload?.headers ?? [];
          const subject = header(hdrs, "Subject");
          const body = extractBody(mj.payload) || mj.snippet || "";

          const numero = extrairNumeroDoAssunto(subject, body);
          if (!numero) { sem_numero++; continue; }
          const link = extrairLinkAcompanhar(body);
          if (!link) { sem_link++; continue; }

          const variantes = normalizarNumero(numero);
          const { data: proto } = await supabaseAdmin
            .from("protocolos")
            .select("id, url")
            .in("numero", variantes)
            .limit(1)
            .maybeSingle();
          if (!proto) { sem_protocolo++; continue; }
          if (proto.url) { ja_com_url++; continue; }

          const { error: errUpd } = await supabaseAdmin
            .from("protocolos")
            .update({ url: link })
            .eq("id", proto.id)
            .is("url", null);
          if (errUpd) { erros++; continue; }
          atualizados++;
        } catch {
          erros++;
        }
      }
    } catch {
      erros++;
    }
  }

  return {
    contas: contas?.length ?? 0,
    emails_lidos, atualizados, ja_com_url,
    sem_link, sem_numero, sem_protocolo, erros,
  };
}

async function _sincronizarImapContas(): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const { data: contas } = await supabaseAdmin
    .from("email_inbox_accounts")
    .select("*")
    .eq("ativo", true)
    .eq("provider", "imap");

  let novos = 0, erros = 0;
  const detalhes: any[] = [];

  for (const conta of contas ?? []) {
    let contaNovos = 0, contaErros = 0, contaProc = 0;
    let contaErroDetalhe: string | null = null;
    let client: any = null;
    try {
      if (!conta.imap_host || !conta.imap_user || !conta.imap_password) {
        throw new Error("Credenciais IMAP incompletas (host/usuário/senha)");
      }
      client = new ImapFlow({
        host: conta.imap_host,
        port: conta.imap_port ?? 993,
        secure: conta.imap_tls ?? true,
        auth: { user: conta.imap_user, pass: conta.imap_password },
        logger: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const status = await client.status("INBOX", { messages: true, uidNext: true, uidValidity: true });
        const total = status.messages ?? 0;
        const uidValidity = String(status.uidValidity ?? "");
        const uidNext = Number(status.uidNext ?? 0);
        if (uidValidity && conta.imap_uid_validity && conta.imap_uid_validity !== uidValidity) {
          throw new Error(`UIDVALIDITY IMAP mudou de ${conta.imap_uid_validity} para ${uidValidity}. Cursor mantido; sincronização pausada para evitar perda ou duplicação. Revisão do histórico da conta é necessária antes de reconfigurar o cursor.`);
        }
        const cursorValido = !!uidValidity && conta.imap_uid_validity === uidValidity
          && conta.imap_last_uid !== null && conta.imap_last_uid !== undefined
          && Number.isFinite(Number(conta.imap_last_uid));
        const ultimoUid = cursorValido ? Number(conta.imap_last_uid) : 0;
        let uidsNovos: number[] | null = null;
        let rangeSequencia: string | null = null;
        if (cursorValido) {
          if (uidNext > ultimoUid + 1) {
            const encontrados = await client.search({ uid: `${ultimoUid + 1}:${uidNext - 1}` }, { uid: true });
            // Processa um lote limitado por execução; UIDs restantes continuam
            // elegíveis na próxima coleta depois que este cursor for gravado.
            uidsNovos = Array.isArray(encontrados) ? encontrados.slice(0, 500) : [];
          } else {
            uidsNovos = [];
          }
        } else if (total > 0) {
          // Primeira coleta ou UIDVALIDITY indisponível: mantém o limite
          // anterior de importar apenas as 20 mensagens mais recentes.
          rangeSequencia = `${Math.max(1, total - 19)}:${total}`;
        }

        let uidProcessado = ultimoUid;
        let podeAvancarCursor = true;
        const mensagens = uidsNovos
          ? client.fetch(uidsNovos, { uid: true, envelope: true, source: true }, { uid: true })
          : rangeSequencia
            ? client.fetch(rangeSequencia, { uid: true, envelope: true, source: true })
            : null;
        if (mensagens) for await (const msg of mensagens) {
          const externalId = uidValidity ? `uid:${uidValidity}:${msg.uid}` : `uid:${msg.uid}`;
          let parsedCache: any = null;
          let { data: existe } = await supabaseAdmin.from("email_inbox_log")
            .select("id, protocolo_id, status").eq("account_id", conta.id).eq("external_id", externalId).maybeSingle();
          // Compatibilidade com logs criados por versões anteriores, que não
          // incluíam UIDVALIDITY na chave da mensagem.
          if (!existe && uidValidity && (!conta.imap_uid_validity || conta.imap_uid_validity === uidValidity)) {
            const legacy = await supabaseAdmin.from("email_inbox_log")
              .select("id, protocolo_id, status, remetente, destinatario, assunto, corpo").eq("account_id", conta.id)
              .eq("external_id", `uid:${msg.uid}`).maybeSingle();
            if (legacy.error) throw legacy.error;
            if (legacy.data) {
              try {
                parsedCache = await simpleParser(msg.source as Buffer);
                const remetenteLegado = parsedCache.from?.text ?? msg.envelope?.from?.[0]?.address ?? "";
                const destinatarioLegado = parsedCache.to && "text" in parsedCache.to ? (parsedCache.to as any).text : (conta.email ?? "");
                const assuntoLegado = parsedCache.subject ?? msg.envelope?.subject ?? "";
                const htmlLegado = typeof parsedCache.html === "string" ? parsedCache.html : "";
                const textoLegado = (parsedCache.text || (htmlLegado ? stripHtml(htmlLegado) : "") || "").trim();
                const corpoLegado = htmlLegado ? `${textoLegado}\n\n<!--HTML-->\n${htmlLegado}` : textoLegado;
                const { corrigirAcentos } = await import("./corrigir-acentos");
                const corpoLogAtual = [
                  `De: ${remetenteLegado}`,
                  `Para: ${destinatarioLegado}`,
                  `Assunto: ${corrigirAcentos(assuntoLegado)}`,
                  "",
                  corrigirAcentos(corpoLegado),
                ].join("\n").slice(0, 20000);
                if (legacy.data.corpo === corpoLogAtual) existe = legacy.data;
              } catch (e: any) {
                erros++; contaErros++; podeAvancarCursor = false;
                contaErroDetalhe = String(e?.message ?? e);
                detalhes.push({ uid: msg.uid, error: contaErroDetalhe });
                continue;
              }
            }
          }
          if (existe?.protocolo_id || existe?.status === "processado") {
            uidProcessado = Math.max(uidProcessado, Number(msg.uid));
            continue;
          }

          try {
            const parsed = parsedCache ?? await simpleParser(msg.source as Buffer);
            const remetente = parsed.from?.text ?? msg.envelope?.from?.[0]?.address ?? "";
            const destinatario = parsed.to && "text" in parsed.to ? (parsed.to as any).text : (conta.email ?? "");
            const assunto = parsed.subject ?? msg.envelope?.subject ?? "";
            const htmlRaw = typeof parsed.html === "string" ? parsed.html : "";
            const textoBase = (parsed.text || (htmlRaw ? stripHtml(htmlRaw) : "") || "").trim();
            const corpo = htmlRaw ? `${textoBase}\n\n<!--HTML-->\n${htmlRaw}` : textoBase;

            const res = await ingerirEmail({
              account: conta, remetente, destinatario, assunto, corpo, externalId,
              existingLogId: existe?.id,
            });
            contaProc++;
            if (res.ok && res.protocoloId) { novos++; contaNovos++; }
            else if (!res.ok) {
              erros++; contaErros++; podeAvancarCursor = false;
              contaErroDetalhe = res.error ?? "Falha ao ingerir mensagem IMAP";
            }
            if (res.ok) uidProcessado = Math.max(uidProcessado, Number(msg.uid));
            detalhes.push({ uid: msg.uid, subject: assunto, ok: res.ok, numero: res.numero, error: res.error });
          } catch (e: any) {
            erros++; contaErros++; podeAvancarCursor = false;
            contaErroDetalhe = String(e?.message ?? e);
            detalhes.push({ uid: msg.uid, error: contaErroDetalhe });
          }
        }
        if (uidValidity && Number.isFinite(uidProcessado) && podeAvancarCursor) {
          let queryCursor = supabaseAdmin.from("email_inbox_accounts").update({
            imap_uid_validity: uidValidity,
            imap_last_uid: uidProcessado,
          }).eq("id", conta.id);
          queryCursor = conta.imap_uid_validity
            ? queryCursor.eq("imap_uid_validity", conta.imap_uid_validity)
            : queryCursor.is("imap_uid_validity", null);
          queryCursor = conta.imap_last_uid !== null && conta.imap_last_uid !== undefined
            ? queryCursor.eq("imap_last_uid", conta.imap_last_uid)
            : queryCursor.is("imap_last_uid", null);
          const { error: errCursor } = await queryCursor.select("id").maybeSingle();
          if (errCursor) throw errCursor;
        }
      } finally {
        lock.release();
      }

      await supabaseAdmin.from("email_inbox_accounts").update({
        ultima_sincronizacao: new Date().toISOString(),
        ultima_sync_novos: contaNovos,
        ultima_sync_erros: contaErros,
        ultima_sync_processados: contaProc,
        ultima_sync_sucesso_em: contaErros === 0 ? new Date().toISOString() : undefined,
        ultima_sync_erro_detalhe: contaErroDetalhe,
      }).eq("id", conta.id);
    } catch (e: any) {
      erros++;
      contaErroDetalhe = String(e?.message ?? e).slice(0, 1000);
      detalhes.push({ conta: conta.email, error: contaErroDetalhe });
      await supabaseAdmin.from("email_inbox_accounts").update({
        ultima_sync_novos: contaNovos,
        ultima_sync_erros: Math.max(contaErros, 1),
        ultima_sync_processados: contaProc,
        ultima_sync_erro_detalhe: contaErroDetalhe,
      }).eq("id", conta.id);
    } finally {
      try { await client?.logout(); } catch { /* O erro de conexão já foi registrado acima. */ }
    }
  }

  return { contas: contas?.length ?? 0, novos, erros, detalhes };
}
