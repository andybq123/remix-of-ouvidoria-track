export const MAX_PROTOCOL_MAP_IMPORT_LINES = 30;

export type ProtocolAddressLine = {
  line: number;
  numero: string;
  endereco: string;
};

export type ProtocolAddressLineIssue = {
  line: number;
  text: string;
  message: string;
};

export type ProtocolAddressParseResult = {
  entries: ProtocolAddressLine[];
  issues: ProtocolAddressLineIssue[];
};

export function parseProtocolNumber(value: string) {
  const [base = "", ...yearParts] = value.trim().split("/");
  return {
    baseDigits: base.replace(/\D/g, ""),
    yearDigits: yearParts.join("").replace(/\D/g, ""),
  };
}

export function protocolNumberMatches(query: string, stored: string): boolean {
  const requested = parseProtocolNumber(query);
  const candidate = parseProtocolNumber(stored);
  if (!requested.baseDigits) {
    return query.trim().toLocaleLowerCase("pt-BR") === stored.trim().toLocaleLowerCase("pt-BR");
  }
  if (requested.baseDigits !== candidate.baseDigits) return false;
  return !requested.yearDigits || requested.yearDigits === candidate.yearDigits;
}

export function buildProtocolNumberOrFilter(value: string): string {
  const { baseDigits, yearDigits } = parseProtocolNumber(value);
  if (!baseDigits) return "numero.eq.__invalid_protocol_number__";
  const formattedBase = baseDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const bases = [...new Set([baseDigits, formattedBase])];
  const variants = yearDigits
    ? bases.flatMap((base) => [`numero.eq.${base}/${yearDigits}`])
    : bases.flatMap((base) => [`numero.eq.${base}`, `numero.like.${base}/%`]);
  return [...new Set(variants)].join(",");
}

export function parseProtocolAddressLines(raw: string): ProtocolAddressParseResult {
  const parsed: ProtocolAddressLine[] = [];
  const issues: ProtocolAddressLineIssue[] = [];

  raw.split(/\r?\n/).forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const match = trimmed.match(/^(.+?)\s+[—–-]\s+(.+?)\s*$/);
    if (!match) {
      issues.push({
        line: index + 1,
        text: trimmed,
        message: "Use o formato número — endereço.",
      });
      return;
    }

    const numero = match[1].trim();
    const endereco = match[2].trim();
    if (!numero || !endereco || !parseProtocolNumber(numero).baseDigits) {
      issues.push({
        line: index + 1,
        text: trimmed,
        message: !parseProtocolNumber(numero).baseDigits
          ? "O número do protocolo precisa conter ao menos um dígito."
          : "Informe o número do protocolo e o endereço.",
      });
      return;
    }

    parsed.push({ line: index + 1, numero, endereco });
  });

  const occurrences = new Map<string, ProtocolAddressLine[]>();
  for (const entry of parsed) {
    const key = entry.numero.toLocaleLowerCase("pt-BR");
    occurrences.set(key, [...(occurrences.get(key) ?? []), entry]);
  }

  const entries = parsed.filter((entry) => {
    const duplicates = occurrences.get(entry.numero.toLocaleLowerCase("pt-BR")) ?? [];
    if (duplicates.length < 2) return true;
    issues.push({
      line: entry.line,
      text: `${entry.numero} — ${entry.endereco}`,
      message: "Este número de protocolo aparece mais de uma vez no lote; remova a duplicidade.",
    });
    return false;
  });

  return { entries, issues };
}
