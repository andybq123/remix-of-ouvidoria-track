import { dominioDoEmail, lerAutoconfigXml, palpitesServidor, type CandidatoImap } from "./imap-autoconfig";

const TIMEOUT = 6000;

async function buscarXml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "follow" });
    if (!r.ok) return null;
    const t = await r.text();
    return t.length < 200_000 ? t : null;
  } catch { return null; }
}

async function autoconfigPublicado(dominio: string, email: string): Promise<CandidatoImap[]> {
  const e = encodeURIComponent(email);
  const urls = [
    `https://autoconfig.${dominio}/mail/config-v1.1.xml?emailaddress=${e}`,
    `https://${dominio}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=${e}`,
    `https://autoconfig.thunderbird.net/v1.1/${dominio}`,
  ];
  const xmls = await Promise.all(urls.map(buscarXml));
  return xmls.flatMap(x => (x ? lerAutoconfigXml(x) : []));
}

/** Nomes canônicos (CNAME) — o certificado costuma valer para o destino, como imap.brusque → imap.armazemdc. */
export async function cadeiaCname(host: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const dns = await import("node:dns");
    let atual = host;
    for (let i = 0; i < 5; i++) {
      const r = await dns.promises.resolveCname(atual).catch(() => [] as string[]);
      const prox = r[0]?.replace(/\.$/, "").toLowerCase();
      if (!prox || prox === atual || out.includes(prox)) break;
      out.push(prox); atual = prox;
    }
  } catch { /* runtime sem DNS */ }
  return out;
}

type Sonda = "ok" | "certificado" | "falha";

/** Abre conexão TLS (direta ou STARTTLS) validando certificado e nome; não autentica. */
export async function sondarImap(c: CandidatoImap): Promise<Sonda> {
  const tls = await import("node:tls");
  const net = await import("node:net");
  return new Promise<Sonda>(resolve => {
    let fim = false;
    const sockets: any[] = [];
    const acabar = (v: Sonda) => { if (fim) return; fim = true; clearTimeout(t); sockets.forEach(s => s.destroy()); resolve(v); };
    const t = setTimeout(() => acabar("falha"), TIMEOUT);
    const erroTls = (e: any) => acabar(/CERT|SELF_SIGNED|ALTNAME|UNABLE_TO_VERIFY/.test(String(e?.code)) ? "certificado" : "falha");
    const tlsOpts = { servername: c.host, rejectUnauthorized: true };
    if (c.seguranca === "SSL") {
      const s = tls.connect({ host: c.host, port: c.port, ...tlsOpts });
      sockets.push(s);
      s.on("error", erroTls);
      s.once("data", (d: Buffer) => acabar(/^\* (OK|PREAUTH)/.test(d.toString()) ? "ok" : "falha"));
      return;
    }
    const s = net.connect({ host: c.host, port: c.port });
    sockets.push(s);
    s.on("error", () => acabar("falha"));
    let buf = ""; let etapa = 0;
    s.on("data", (d: Buffer) => {
      buf += d.toString();
      if (etapa === 0 && /\r?\n/.test(buf)) {
        if (!/^\* OK/.test(buf)) return acabar("falha");
        etapa = 1; buf = ""; s.write("a1 STARTTLS\r\n");
      } else if (etapa === 1 && /a1 /.test(buf)) {
        if (!/a1 OK/i.test(buf)) return acabar("falha");
        etapa = 2; s.removeAllListeners("data");
        const ts = tls.connect({ socket: s, ...tlsOpts }, () => acabar(ts.authorized ? "ok" : "certificado"));
        sockets.push(ts);
        ts.on("error", erroTls);
      }
    });
  });
}

/** Se o certificado não vale para o nome digitado, tenta os destinos CNAME na mesma porta. */
export async function hostSeguro(host: string, port: number, seguranca: CandidatoImap["seguranca"]): Promise<string> {
  const r = await sondarImap({ host, port, seguranca });
  if (r !== "certificado") return host;
  for (const alvo of await cadeiaCname(host)) {
    if ((await sondarImap({ host: alvo, port, seguranca })) === "ok") return alvo;
  }
  return host;
}

export type DeteccaoImap = { host: string; port: number; seguranca: "SSL" | "STARTTLS"; usuario: "email" | "local"; origem: "publicado" | "palpite" };

/** Detecta servidor IMAP pelo e-mail: autoconfig publicado, palpites comuns e correção por CNAME. */
export async function detectarImap(email: string): Promise<DeteccaoImap | null> {
  const dominio = dominioDoEmail(email);
  if (!dominio) return null;
  const publicados = await autoconfigPublicado(dominio, email);
  const lista: (CandidatoImap & { origem: DeteccaoImap["origem"] })[] = [
    ...publicados.map(c => ({ ...c, origem: "publicado" as const })),
    ...palpitesServidor(dominio).map(c => ({ ...c, origem: "palpite" as const })),
  ];
  const vistos = new Set<string>();
  const unicos = lista.filter(c => { const k = `${c.host}:${c.port}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  const tentativas = unicos.map(async c => {
    const r = await sondarImap(c);
    if (r === "ok") return c;
    if (r !== "certificado") return null;
    for (const alvo of await cadeiaCname(c.host)) {
      if ((await sondarImap({ ...c, host: alvo })) === "ok") return { ...c, host: alvo };
    }
    return null;
  });
  // Sondas em paralelo, mas respeita a prioridade: devolve o primeiro da lista que funcionar.
  for (const t of tentativas) {
    const achado = await t;
    if (achado) return { host: achado.host, port: achado.port, seguranca: achado.seguranca, usuario: achado.usuario ?? "email", origem: achado.origem };
  }
  return null;
}
