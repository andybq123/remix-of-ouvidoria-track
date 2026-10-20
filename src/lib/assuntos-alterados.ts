// Encontra ouvidorias cujo assunto foi trocado automaticamente (sem usuário)
// ou passou a ser o nome de uma secretaria — sinais da falha do agente 1Doc.
export type HistAssunto = { protocolo_id: string; valor_anterior: string | null; valor_novo: string | null; autor_id: string | null; created_at: string };
export type ProtAssunto = { id: string; numero: string; assunto: string | null };
export type Suspeito = ProtAssunto & { anterior: string | null; alterado_em: string | null; motivo: "automatico" | "secretaria" };

const norm = (s: string | null | undefined) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function assuntosSuspeitos(prots: ProtAssunto[], hist: HistAssunto[], secretarias: string[]): Suspeito[] {
  const nomesSec = new Set(secretarias.map(norm).filter(Boolean));
  const ultimo = new Map<string, HistAssunto>();
  const ultimoAuto = new Map<string, HistAssunto>();
  for (const h of hist) {
    const u = ultimo.get(h.protocolo_id);
    if (!u || h.created_at > u.created_at) ultimo.set(h.protocolo_id, h);
    if (!h.autor_id) {
      const a = ultimoAuto.get(h.protocolo_id);
      if (!a || h.created_at > a.created_at) ultimoAuto.set(h.protocolo_id, h);
    }
  }
  const out: Suspeito[] = [];
  for (const p of prots) {
    const u = ultimo.get(p.id);
    const auto = !!u && !u.autor_id && norm(u.valor_novo) === norm(p.assunto);
    const sec = nomesSec.has(norm(p.assunto));
    if (!auto && !sec) continue;
    const ref = auto ? u! : ultimoAuto.get(p.id) ?? null;
    out.push({ ...p, anterior: ref?.valor_anterior ?? null, alterado_em: ref?.created_at ?? null, motivo: auto ? "automatico" : "secretaria" });
  }
  return out.sort((a, b) => String(b.alterado_em ?? "").localeCompare(String(a.alterado_em ?? "")));
}
