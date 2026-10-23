import { z } from "zod";
import { chaveNumeroEsic, formatarNumeroEsic } from "./esic";

/** Números vistos nos prints da caixa (pedidos e despachos de 2026); editável na tela. */
export const NUMEROS_ESIC_IMPRESSOS = [
  "024/2026", "040/2026", "041/2026", "049/2026", "051/2026", "052/2026", "053/2026", "054/2026",
  "057/2026", "058/2026", "059/2026", "062/2026", "063/2026", "068/2026", "069/2026", "071/2026",
  "073/2026", "074/2026", "078/2026", "079/2026", "080/2026", "081/2026", "082/2026", "083/2026",
  "084/2026", "085/2026", "086/2026", "088/2026", "089/2026", "091/2026", "092/2026", "093/2026",
  "094/2026", "095/2026", "096/2026", "097/2026", "098/2026", "099/2026", "100/2026", "101/2026",
].join(", ");

export const esicNumerosBuscaSchema = z.object({
  accountId: z.string().uuid(),
  numeros: z.array(z.string().max(40)).min(1).max(300),
});
export type EsicNumerosBusca = z.infer<typeof esicNumerosBuscaSchema>;

/** Lê números "092/2026" de um texto livre, normalizando e removendo duplicados. */
export function extrairNumerosEsicTexto(texto: string): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const trecho of texto.match(/(?<![\d.])\d[\d.]*\s*\/\s*20\d{2}(?!\d)/g) ?? []) {
    const fmt = formatarNumeroEsic(trecho);
    const chave = chaveNumeroEsic(fmt);
    if (!vistos.has(chave)) { vistos.add(chave); saida.push(fmt); }
  }
  return saida;
}

// A batch bounds each request, never the total mailbox traversal.
export const ESIC_MAIL_BATCH = 10;
export const esicMailboxCursorSchema = z.object({
  accountId: z.string().uuid(),
  pageToken: z.string().max(4096).optional(),
  folder: z.string().max(1024).optional(),
  uidValidity: z.string().max(100).optional(),
  nextUid: z.number().int().positive().optional(),
  maxUid: z.number().int().nonnegative().optional(),
});
export type EsicMailboxCursor = z.infer<typeof esicMailboxCursorSchema>;

export function intervaloEsic(nextUid: number, maxUid: number) {
  const fim = Math.min(maxUid, nextUid + ESIC_MAIL_BATCH - 1);
  return { inicio: nextUid, fim, proximo: fim < maxUid ? fim + 1 : null };
}

export function pastasEsic(pastas: Array<{ path: string; specialUse?: string; flags: Set<string> }>) {
  const selecionaveis = pastas.filter(p => !p.flags.has("\\Noselect"));
  const todas = selecionaveis.find(p => p.specialUse === "\\All");
  // Gmail All Mail already includes Inbox, sent and archived messages.
  return todas
    ? selecionaveis.filter(p => p.path === todas.path || ["\\Junk", "\\Trash"].includes(p.specialUse ?? ""))
    : selecionaveis;
}