// Tabelas que entram no backup, na ordem segura de importação.
export const BACKUP_TABELAS = [
  "secretarias",
  "locais",
  "secretaria_responsaveis",
  "assuntos",
  "allowed_emails",
  "profiles",
  "user_roles",
  "email_inbox_accounts",
  "protocolos",
  "protocolo_historico",
  "protocolos_antigos_conclusoes",
  "email_inbox_log",
  "coletas",
  "ai_config",
] as const;
export type BackupTabela = (typeof BACKUP_TABELAS)[number];

export type BackupGrupo = {
  id: string;
  titulo: string;
  descricao: string;
  tabelas: BackupTabela[];
  usuarios?: boolean;
};

export const BACKUP_GRUPOS: BackupGrupo[] = [
  {
    id: "protocolos",
    titulo: "Protocolos",
    descricao: "Todos os protocolos (inclusive os da triagem), histórico de alterações e conclusões dos antigos.",
    tabelas: ["protocolos", "protocolo_historico", "protocolos_antigos_conclusoes"],
  },
  {
    id: "usuarios",
    titulo: "Usuários",
    descricao: "Contas de acesso, perfis e permissões. As senhas vão criptografadas.",
    tabelas: ["allowed_emails", "profiles", "user_roles"],
    usuarios: true,
  },
  {
    id: "secretarias",
    titulo: "Secretarias e locais",
    descricao: "Secretarias, locais/unidades e responsáveis de cada secretaria.",
    tabelas: ["secretarias", "locais", "secretaria_responsaveis"],
  },
  {
    id: "assuntos",
    titulo: "Assuntos",
    descricao: "Catálogo de assuntos e regras de triagem.",
    tabelas: ["assuntos"],
  },
  {
    id: "emails",
    titulo: "E-mails",
    descricao: "Contas de e-mail configuradas e e-mails já coletados.",
    tabelas: ["email_inbox_accounts", "email_inbox_log"],
  },
  {
    id: "coletas",
    titulo: "Coletas do 1doc",
    descricao: "Registro das coletas automáticas.",
    tabelas: ["coletas"],
  },
  {
    id: "ia",
    titulo: "Configuração de IA",
    descricao: "Modelos, ordem de uso e chaves de IA (guarde o arquivo em local seguro).",
    tabelas: ["ai_config"],
  },
];

// Converte valores vindos de CSV (backup antigo) para o formato do banco.
const JSON_COLS = new Set(["detalhes", "ignorados_detalhes"]);
export function normalizarLinhaCsv(row: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === "" || v === undefined) {
      out[k] = null;
      continue;
    }
    if (JSON_COLS.has(k)) {
      try {
        out[k] = JSON.parse(v);
      } catch {
        out[k] = v;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}

// Leitor de CSV simples (aspas, vírgulas e quebras de linha dentro de campos).
export function parseCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  const s = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"') {
        if (s[i + 1] === '"') { campo += '"'; i++; } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      linhas.push(linha); linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas;
  if (!cab) return [];
  return resto
    .filter((l) => l.length > 1 || (l[0] ?? "") !== "")
    .map((l) => Object.fromEntries(cab.map((h, i) => [h, l[i] ?? ""])));
}

// Divide linhas em lotes de até ~maxBytes para envio ao servidor.
export function emLotes<T>(rows: T[], maxBytes = 1_500_000, maxRows = 500): T[][] {
  const lotes: T[][] = [];
  let atual: T[] = [];
  let tam = 0;
  for (const r of rows) {
    const t = JSON.stringify(r).length;
    if (atual.length && (tam + t > maxBytes || atual.length >= maxRows)) {
      lotes.push(atual); atual = []; tam = 0;
    }
    atual.push(r); tam += t;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}
