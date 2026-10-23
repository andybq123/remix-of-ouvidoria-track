import { z } from "zod";

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