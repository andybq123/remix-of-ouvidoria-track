import { PROTOCOLO_EXTRACT_SYSTEM, normalizarExtracao, sanitizarTextoProtocolo } from "@/lib/protocolo-extract.shared";
import { gerarNumeroProtocolo } from "@/lib/prazo";

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
export function limparUrl1doc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u = String(raw).trim()
    .replace(/=\r?\n/g, "")            // soft line break quoted-printable
    .replace(/=3D/gi, "=")
    .replace(/&amp;/gi, "&").replace(/&#x3D;|&#61;/gi, "=").replace(/&#x2F;|&#47;/gi, "/")
    .replace(/^[<\["'(]+/, "").replace(/[>\]"').,;:!?]+$/, "")
    .replace(/\s+/g, "");
  for (let i = 0; i < 3; i++) {
    let parsed: URL;
    try { parsed = new URL(u); } catch { return null; }
    // Desembrulha redirecionadores (Google, Outlook SafeLinks, etc.)
    const inner = parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.searchParams.get("u") || parsed.searchParams.get("target");
    if (inner && /^https?:\/\//i.test(inner) && !/1doc/i.test(parsed.hostname)) { u = inner; continue; }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.toString();
  }
  return null;
}

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
  try { parsed = JSON.parse(content); } catch {}
  return { extr: normalizarExtracao(parsed), provider };
}

export type IngestInput = {
  account: any;
  remetente: string;
  destinatario: string;
  assunto: string;
  corpo: string;
  externalId?: string;
};

export async function ingerirEmail(input: IngestInput): Promise<{ ok: boolean; protocoloId?: string; numero?: string; logId?: string; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { account, remetente, destinatario, assunto, corpo, externalId } = input;

  if (externalId) {
    const { data: existente } = await supabaseAdmin
      .from("email_inbox_log").select("id")
      .eq("account_id", account.id).eq("external_id", externalId).maybeSingle();
    if (existente) return { ok: true, logId: existente.id };
  }

  const textoCompleto = [`De: ${remetente}`, `Para: ${destinatario}`, `Assunto: ${assunto}`, "", corpo].join("\n");

  const { data: logRow, error: logErr } = await supabaseAdmin
    .from("email_inbox_log")
    .insert({
      account_id: account.id, remetente, destinatario, assunto,
      corpo: textoCompleto.slice(0, 20000), status: "pendente",
      external_id: externalId ?? null,
    })
    .select("id").single();
  if (logErr) throw logErr;

  try {
    if (textoCompleto.trim().length < 10) throw new Error("Conteúdo vazio");
    const { extr, provider: aiProvider } = await extrairComIA(textoCompleto);
    // Marca imediatamente qual IA processou este e-mail (útil quando o
    // fluxo falhar mais adiante mas a extração já aconteceu).
    {
      const { error: errAi } = await supabaseAdmin.from("email_inbox_log")
        .update({ ai_provider: aiProvider }).eq("id", logRow!.id);
      if (errAi) console.error("[ingest] falha ao gravar ai_provider:", errAi);
    }

    // Número real da Ouvidoria vindo no assunto do e-mail tem prioridade
    // absoluta sobre o que a IA inferiu (evita gerar números sintéticos).
    // Se for encontrado, ele é autoritativo: nunca será sobrescrito nem
    // substituído por um número gerado.
    const numeroDoAssunto = extrairNumeroDoAssunto(assunto, corpo);
    if (numeroDoAssunto) extr.numero = numeroDoAssunto;

    // Detecta e-SIC pelo assunto/corpo do e-mail (ex: "Pedido de e-SIC")
    {
      const t = norm(`${assunto}\n${corpo}`);
      if (/\be[\s\-]?sic\b/.test(t) || t.includes("pedido de e sic") || t.includes("pedido de esic")) {
        extr.tipo = "esic" as any;
      }
    }

    // ===== Detectar se é atualização/baixa de protocolo já existente =====
    if (extr.numero) {
      const variantes = normalizarNumero(extr.numero);
      const { data: existente } = await supabaseAdmin
        .from("protocolos")
        .select("id, numero, status")
        .in("numero", variantes)
        .maybeSingle();

      if (existente) {
        const acao = detectarAcao(assunto, corpo);
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
        }).eq("id", logRow!.id);

        return { ok: true, protocoloId: existente.id, numero: existente.numero, logId: logRow!.id };
      }
    }

    let secretariaId: string | null = account.secretaria_id;
    let forcarTriagemAssunto = false;
    if (!secretariaId) {
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
    if (!forcarTriagemAssunto && extr.assunto_categoria) {
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
    if (secretariaId && extr.local_sugerido) {
      const { data: locs } = await supabaseAdmin
        .from("locais").select("id, nome").eq("secretaria_id", secretariaId);
      const alvo = norm(extr.local_sugerido);
      const hit = (locs ?? []).find(l => norm(l.nome).includes(alvo) || alvo.includes(norm(l.nome)));
      if (hit) localId = hit.id;
    }

    // Fallback: para secretarias sem subgrupos (todas exceto Saúde), o local
    // padrão deve ser a unidade com o mesmo nome/sigla da própria secretaria.
    // Ex.: SEPLAN → local "SEPLAN". A Saúde tem várias UBS, então não se aplica.
    if (secretariaId && !localId) {
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

    // Validação final: se o assunto trouxe um número, ele é a fonte da
    // verdade — jamais cair no gerador automático nesse caso.
    let numero: string;
    let numeroGerado = false;
    if (numeroDoAssunto) {
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
        .select("id, numero")
        .in("numero", variantes)
        .maybeSingle();
      if (jaExiste) {
        await supabaseAdmin.from("email_inbox_log").update({
          status: "processado",
          protocolo_id: jaExiste.id,
          processado_em: new Date().toISOString(),
          erro: "duplicado (mesmo número já existia)",
          ai_provider: aiProvider,
        }).eq("id", logRow!.id);
        return { ok: true, protocoloId: jaExiste.id, numero: jaExiste.numero, logId: logRow!.id };
      }
    }
    const dataAbertura = extr.data_abertura || new Date().toISOString().slice(0, 10);

    const resumo = [
      "Nova Ouvidoria recebida.",
      "",
      `Nº: ${extr.numero || numero}`,
      `Assunto: ${extr.assunto || assunto || ""}`,
      `De: ${extr.solicitante || "-"}`,
      `Para: ${extr.destinatario || ""}`,
    ].join("\n");

    // Triagem só é necessária para ouvidorias quando:
    //  (a) não conseguimos identificar a secretaria responsável, OU
    //  (b) o assunto é da Saúde e exige decidir qual UBS/CAPS atende.
    // Demais assuntos com secretaria já identificada seguem direto, sem triagem.
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
    const precisaTriagem =
      extr.tipo === "ouvidoria" &&
      (forcarTriagemAssunto || !secretariaId || casaSaude);

    const { data: novo, error: errIns } = await supabaseAdmin
      .from("protocolos")
      .insert({
        numero, tipo: extr.tipo, categoria: extr.categoria,
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
      erro: numeroGerado ? "número gerado (não encontrado no e-mail)" : null,
      ai_provider: aiProvider,
    }).eq("id", logRow!.id);

    return { ok: true, protocoloId: novo!.id, numero: novo!.numero, logId: logRow!.id };
  } catch (e: any) {
    await supabaseAdmin.from("email_inbox_log").update({
      status: "erro", erro: String(e?.message ?? e).slice(0, 1000),
      processado_em: new Date().toISOString(),
    }).eq("id", logRow!.id);
    return { ok: false, error: String(e?.message ?? e), logId: logRow!.id };
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

export async function sincronizarGmailContas(): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  return await sincronizarGmailContasComJanela("newer_than:2d", 20, 1);
}

export async function ressincronizarGmailContas(dias = 30): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
  return await sincronizarGmailContasComJanela(`newer_than:${dias}d`, 100, 20);
}

/**
 * Re-verifica e-mails antigos no Gmail dentro da janela informada, forçando o
 * reprocessamento de mensagens que já existem no log mas que NÃO geraram
 * protocolo (status erro/ignorado/pendente sem protocolo_id). Útil para
 * recuperar ouvidorias que ficaram presas por falha temporária na IA, etc.
 */
export async function reverificarEmailsSemProtocolo(dias = 60): Promise<{ contas: number; reprocessados: number; novos: number; erros: number; detalhes: any[] }> {
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

        // Se já gerou protocolo, pula. Caso contrário, apaga log antigo para
        // permitir nova tentativa pelo ingerirEmail (que cria novo log).
        if (logExistente?.protocolo_id) continue;
        if (logExistente?.id) {
          await supabaseAdmin.from("email_inbox_log").delete().eq("id", logExistente.id);
        }

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

  // Remove log antigo para permitir novo fluxo em ingerirEmail
  await supabaseAdmin.from("email_inbox_log").delete().eq("id", log.id);

  const res = await ingerirEmail({
    account: conta, remetente: from, destinatario: to,
    assunto: subject, corpo: body, externalId,
  });
  return res;
}

export async function sincronizarImapContas(): Promise<{ contas: number; novos: number; erros: number; detalhes: any[] }> {
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
        // Busca as últimas 20 mensagens (mais recentes primeiro)
        const status = await client.status("INBOX", { messages: true });
        const total = status.messages ?? 0;
        if (total === 0) {
          await supabaseAdmin.from("email_inbox_accounts").update({
            ultima_sincronizacao: new Date().toISOString(),
            ultima_sync_novos: 0, ultima_sync_erros: 0, ultima_sync_processados: 0,
          }).eq("id", conta.id);
          continue;
        }
        const from = Math.max(1, total - 19);
        const range = `${from}:${total}`;

        for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true })) {
          const externalId = `uid:${msg.uid}`;
          const { data: existe } = await supabaseAdmin.from("email_inbox_log")
            .select("id").eq("account_id", conta.id).eq("external_id", externalId).maybeSingle();
          if (existe) continue;

          try {
            const parsed = await simpleParser(msg.source as Buffer);
            const remetente = parsed.from?.text ?? msg.envelope?.from?.[0]?.address ?? "";
            const destinatario = parsed.to && "text" in parsed.to ? (parsed.to as any).text : (conta.email ?? "");
            const assunto = parsed.subject ?? msg.envelope?.subject ?? "";
            const htmlRaw = typeof parsed.html === "string" ? parsed.html : "";
            const textoBase = (parsed.text || (htmlRaw ? stripHtml(htmlRaw) : "") || "").trim();
            const corpo = htmlRaw ? `${textoBase}\n\n<!--HTML-->\n${htmlRaw}` : textoBase;

            const res = await ingerirEmail({
              account: conta, remetente, destinatario, assunto, corpo, externalId,
            });
            contaProc++;
            if (res.ok && res.protocoloId) { novos++; contaNovos++; }
            else if (!res.ok) { erros++; contaErros++; }
            detalhes.push({ uid: msg.uid, subject: assunto, ok: res.ok, numero: res.numero, error: res.error });
          } catch (e: any) {
            erros++; contaErros++;
            detalhes.push({ uid: msg.uid, error: String(e?.message ?? e) });
          }
        }
      } finally {
        lock.release();
      }

      await supabaseAdmin.from("email_inbox_accounts").update({
        ultima_sincronizacao: new Date().toISOString(),
        ultima_sync_novos: contaNovos,
        ultima_sync_erros: contaErros,
        ultima_sync_processados: contaProc,
      }).eq("id", conta.id);
    } catch (e: any) {
      erros++;
      detalhes.push({ conta: conta.email, error: String(e?.message ?? e) });
    } finally {
      try { await client?.logout(); } catch {}
    }
  }

  return { contas: contas?.length ?? 0, novos, erros, detalhes };
}