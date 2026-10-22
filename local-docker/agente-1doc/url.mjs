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
// Link de rastreio do e-mail do próprio 1Doc (el.1docmail.com.br/ls/click?...).
// O destino vem cifrado, então só dá para descobrir seguindo o redirecionamento.
export function linkRastreio1doc(raw) {
  try {
    const p = new URL(String(raw || "").trim().replace(/&amp;/gi, "&"));
    if (!/^https?:$/.test(p.protocol) || p.username || p.password) return null;
    const h = p.hostname.toLowerCase();
    return h === "1docmail.com.br" || h.endsWith(".1docmail.com.br") ? p.toString() : null;
  } catch { return null; }
}

// Segue os redirecionamentos (sem abrir a página) e aceita só destino no 1Doc.
export async function resolverRastreio1doc(raw, fetcher = fetch) {
  let u = linkRastreio1doc(raw);
  for (let i = 0; u && i < 6; i++) {
    const r = await fetcher(u, { redirect: "manual", signal: AbortSignal.timeout(20000) });
    const loc = r.headers.get("location");
    if (!loc) return null;
    const prox = new URL(loc, u).toString();
    const final = limparUrl(prox);
    if (final) return final;
    u = linkRastreio1doc(prox);
  }
  return null;
}
