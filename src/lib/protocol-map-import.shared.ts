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
    if (!numero || !endereco) {
      issues.push({
        line: index + 1,
        text: trimmed,
        message: "Informe o número do protocolo e o endereço.",
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
