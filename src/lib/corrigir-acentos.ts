// Repara textos com acentos quebrados:
//  - "p�blica" (caractere de substituição) -> procura a palavra certa num dicionário
//  - "pÃºblica" (UTF-8 lido como Latin-1)  -> decodifica de volta
import { ASSUNTOS_OUVIDORIA } from "./assuntos-ouvidoria";
import { ASSUNTOS_CATEGORIAS } from "./protocolo-extract.shared";

const COMUNS = `pública público públicas públicos não são está estão já até após também só
saúde água águas árvore árvores calçada calçadas rua iluminação manutenção solicitação solicitações
reclamação reclamações informação informações denúncia denúncias sugestão sugestões elogio
ouvidoria município municipal prefeitura secretaria serviço serviços educação habitação
assistência funcionário funcionários funcionária conduta área áreas espaço espaços trânsito
sinalização veículo veículos ônibus transporte coleta lixo entulho esgoto drenagem bueiro
pavimentação buraco buracos asfalto ação ações situação condição condições questão
atenção resolução conclusão atualização prorrogação manifestação manifestações protocolo
responsável responsáveis próximo próxima número endereço bairro avenida praça praças
terreno baldio limpeza poda corte capina animais animal cão cães gato gatos vigilância
sanitária epidemiológica dengue médico médica médicos consulta exame exames medicação
medicamento medicamentos atendimento unidade básica posto creche creches escola escolas
matrícula vagas obra obras construção irregular irregulares fiscalização licença alvará
acessibilidade deficiência idoso idosos criança crianças adolescente família famílias
veterinário poluição sonora barulho ruído fumaça queimada queimadas meio ambiente
transparência acesso lei cidadão cidadã cidadãos munícipe usuário usuária horário horários
período mês três após através você vocês está esta fará será há têm vêm além aí lá cá
segurança guarda iluminação lâmpada lâmpadas poste postes energia elétrica rede pública
jurídico jurídica administração finanças tributação imposto impostos cobrança dívida`;

let DICT: Map<number, string[]> | null = null;
function dicionario(extra: string[] = []): Map<number, string[]> {
  if (DICT && !extra.length) return DICT;
  const palavras = new Set<string>();
  const add = (t: string) =>
    t.split(/[^\p{L}]+/u).forEach((w) => { if (w.length > 1 && /[^\x00-\x7f]/.test(w)) palavras.add(w.toLowerCase()); });
  COMUNS.split(/\s+/).forEach(add);
  ASSUNTOS_OUVIDORIA.forEach((g) => { add(g.grupo); g.itens.forEach(add); });
  (ASSUNTOS_CATEGORIAS as readonly any[]).forEach((a) => add(typeof a === "string" ? a : JSON.stringify(a)));
  extra.forEach(add);
  const m = new Map<number, string[]>();
  for (const w of palavras) { const k = [...w].length; m.set(k, [...(m.get(k) ?? []), w]); }
  if (!extra.length) DICT = m;
  return m;
}

function manterCaixa(orig: string, certo: string): string {
  const letras = orig.replace(/\uFFFD/g, "");
  if (letras.length > 1 && letras === letras.toUpperCase()) return certo.toUpperCase();
  const o = [...orig], c = [...certo];
  return c.map((ch, i) => (o[i] && o[i] !== "\uFFFD" && o[i] === o[i].toUpperCase() && o[i] !== o[i].toLowerCase() ? ch.toUpperCase() : ch)).join("");
}

function corrigirLatin1(s: string): string {
  if (!/[ÃÂ][\u0080-\u00BF]/.test(s)) return s;
  try {
    const bytes = Uint8Array.from([...s].map((c) => c.charCodeAt(0) & 0xff));
    const dec = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return dec;
  } catch {
    return s.replace(/Ã([\u0080-\u00BF])/g, (_, c) => String.fromCharCode(0xc0 + c.charCodeAt(0) - 0x80));
  }
}

export function temAcentoQuebrado(s: string | null | undefined): boolean {
  return !!s && (/\uFFFD/.test(s) || /[ÃÂ][\u0080-\u00BF]/.test(s));
}

export function corrigirAcentos(s: string, extra: string[] = []): string;
export function corrigirAcentos(s: string | null | undefined, extra?: string[]): string | null | undefined;
export function corrigirAcentos(s: string | null | undefined, extra: string[] = []) {
  if (!s || !temAcentoQuebrado(s)) return s;
  let out = corrigirLatin1(s);
  if (!out.includes("\uFFFD")) return out;
  const dict = dicionario(extra);
  out = out.replace(/[\p{L}\uFFFD]*\uFFFD[\p{L}\uFFFD]*/gu, (tok) => {
    const n = [...tok].length;
    const re = new RegExp("^" + [...tok.toLowerCase()].map((c) => (c === "\uFFFD" ? "[^\\x00-\\x7f]" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$", "u");
    const achados = (dict.get(n) ?? []).filter((w) => re.test(w));
    if (achados.length === 1) return manterCaixa(tok, achados[0]);
    // Um "?" isolado num caractere vira duas letras às vezes (ex.: "ç" em 2 bytes): tenta n+1
    const re2 = new RegExp("^" + [...tok.toLowerCase()].map((c) => (c === "\uFFFD" ? "[^\\x00-\\x7f]{1,2}" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$", "u");
    const alt = [...(dict.get(n) ?? []), ...(dict.get(n + 1) ?? [])].filter((w) => re2.test(w));
    if (alt.length === 1) return manterCaixa(tok, alt[0]);
    return tok;
  });
  return out;
}
