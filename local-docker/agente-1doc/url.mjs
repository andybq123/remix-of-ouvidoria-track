// Normaliza links legados sem visitar redirecionadores externos.
// Só retorna destinos HTTP(S) do domínio real do 1Doc, sem credenciais.
export function limparUrl(raw) {
  let u = String(raw || "").trim()
    .replace(/=\r?\n/g, "").replace(/=3D/gi, "=")
    .replace(/&amp;/gi, "&").replace(/&#x3D;|&#61;/gi, "=").replace(/&#x2F;|&#47;/gi, "/")
    .replace(/^[<\["'(]+/, "").replace(/[>\]"').,;:!?]+$/, "").replace(/\s+/g, "");
  if (/^(?:[a-z0-9-]+\.)*1doc\.com\.br(?:[/:?#]|$)/i.test(u)) u = "https://" + u;
  for (let i = 0; i < 3; i++) {
    let p;
    try { p = new URL(u); } catch { return null; }
    if (!/^https?:$/.test(p.protocol) || p.username || p.password) return null;
    if (p.hostname === "1doc.com.br" || p.hostname.endsWith(".1doc.com.br")) return p.toString();
    const inner = p.searchParams.get("q") || p.searchParams.get("url") || p.searchParams.get("u") || p.searchParams.get("target");
    if (!inner || !/^https?:\/\//i.test(inner)) return null;
    u = inner;
  }
  return null;
}