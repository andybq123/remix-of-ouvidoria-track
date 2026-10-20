// Validação estrita para links cadastrados manualmente, sem alterar links legados.
export function link1docParaSalvar(raw: string): string | null {
  if (!raw.trim()) return null;
  const link = urlValida1doc(raw);
  if (link) {
    const host = new URL(link).hostname.toLowerCase();
    if (host === "1doc.com.br" || host.endsWith(".1doc.com.br")) return link;
  }
  throw new Error("Informe um link válido do 1Doc (1doc.com.br).");
}

// Limpa e valida links do 1doc (entidades HTML, quoted-printable, redirecionadores).
export function urlValida1doc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u = String(raw).trim()
    .replace(/=\r?\n/g, "").replace(/=3D/gi, "=")
    .replace(/&amp;/gi, "&").replace(/&#x3D;|&#61;/gi, "=").replace(/&#x2F;|&#47;/gi, "/")
    .replace(/^[<\["'(]+/, "").replace(/[>\]"').,;:!?]+$/, "").replace(/\s+/g, "");
  if (/^(www\.)?[a-z0-9-]+\.1doc\.com\.br/i.test(u) || /^1doc\.com\.br/i.test(u)) u = "https://" + u;
  for (let i = 0; i < 3; i++) {
    let p: URL;
    try { p = new URL(u); } catch { return null; }
    const inner = p.searchParams.get("q") || p.searchParams.get("url") || p.searchParams.get("u") || p.searchParams.get("target");
    if (inner && /^https?:\/\//i.test(inner) && !/1doc/i.test(p.hostname)) { u = inner; continue; }
    return /^https?:$/.test(p.protocol) ? p.toString() : null;
  }
  return null;
}
