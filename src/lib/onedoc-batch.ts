import { z } from "zod";

export const onedocInputSchema = z.object({
  tipo: z.enum(["teste", "unitario", "lote"]),
  protocoloId: z.string().uuid().optional(),
  protocoloIds: z.array(z.string().uuid()).min(1).max(5000).optional(),
  secretariaId: z.string().uuid().optional(),
});

export function idsOuvidorias1doc(protocolos: readonly { id: string; tipo: string; status: string; url?: string | null }[]) {
  return [...new Set(protocolos
    .filter((p) => p.tipo === "ouvidoria" && p.status !== "concluido" && /1doc/i.test(p.url ?? ""))
    .map((p) => p.id))];
}