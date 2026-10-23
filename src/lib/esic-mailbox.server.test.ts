import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EsicMailboxCursor } from "./esic-mailbox";

const mock = vi.hoisted(() => ({ ingest: vi.fn(), get: vi.fn(), conta: { id: "00000000-0000-4000-8000-000000000001", provider: "gmail", email: "teste@example.local", ativo: true } }));
vi.mock("./import-maintenance.server", () => ({ exigirIngestaoAtiva: vi.fn() }));
vi.mock("./protocolo-ingest.server", () => ({ ingerirEmail: mock.ingest }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const q = { select: () => q, eq: () => q, single: async () => ({ data: mock.conta, error: null }) };
  return q;
} } }));
import { buscarEsicPorNumeros, rechecarLoteEsic } from "./esic-mailbox.server";

beforeEach(() => {
  vi.stubEnv("LOVABLE_API_KEY", "fake-test-key");
  vi.stubEnv("GOOGLE_MAIL_API_KEY", "fake-test-key");
  mock.ingest.mockReset().mockResolvedValue({ ok: true, protocoloId: "esic-teste" });
  mock.get.mockReset();
  vi.stubGlobal("fetch", mock.get);
});
describe("Gmail e-SIC histórico completo", () => {
  it("busca específica percorre 31 páginas e só registra o número solicitado", async () => {
    mock.get.mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/messages")) {
        expect(parsed.searchParams.get("maxResults")).toBe("10");
        expect(parsed.searchParams.get("q")).toContain("e-SIC");
        const pagina = Number(parsed.searchParams.get("pageToken") ?? "1");
        return Response.json({ messages: [{ id: String(pagina) }], nextPageToken: pagina < 31 ? String(pagina + 1) : undefined });
      }
      const numero = parsed.pathname.endsWith("/31") ? "092" : "026";
      return Response.json({ internalDate: String(Date.parse("2026-01-15T12:00:00Z")), payload: {
        headers: [{ name: "Subject", value: `Pedido de e-SIC ${numero}/2026 recebido` }],
        mimeType: "text/plain", body: { data: Buffer.from(`Nº: ${numero}/2026`).toString("base64url") },
      } });
    });
    let cursor: EsicMailboxCursor | null = { accountId: mock.conta.id };
    let paginas = 0;
    while (cursor) {
      const r = await buscarEsicPorNumeros({ accountId: mock.conta.id, numeros: ["092/2026"], cursor });
      cursor = r.proximo;
      paginas++;
    }
    expect(paginas).toBe(31);
    expect(mock.ingest).toHaveBeenCalledTimes(1);
    expect(mock.ingest.mock.calls[0][0]).toMatchObject({ assunto: "Pedido de e-SIC 092/2026 recebido", recheckEsic: true, receivedAt: "2026-01-15T12:00:00.000Z" });
  });
  it("mostra falha de registro por número e continua com o próximo pedido", async () => {
    mock.get.mockImplementation(async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "092" }, { id: "093" }] });
      const numero = parsed.pathname.split("/").at(-1);
      return Response.json({ internalDate: String(Date.parse("2026-01-15T12:00:00Z")), payload: {
        headers: [{ name: "Subject", value: `Pedido de e-SIC ${numero}/2026 recebido` }],
        mimeType: "text/plain", body: { data: Buffer.from(`Nº: ${numero}/2026`).toString("base64url") },
      } });
    });
    mock.ingest.mockRejectedValueOnce({ message: "Could not find the function public.protocolo_esic_por_numero" });
    const r = await buscarEsicPorNumeros({ accountId: mock.conta.id, numeros: ["092/2026", "093/2026"] });
    expect(r.encontrados).toBe(2);
    expect(r.registrados).toBe(1);
    expect(r.erros).toBe(1);
    expect(r.detalhes).toEqual(["0.092/2026: Could not find the function public.protocolo_esic_por_numero"]);
    expect(r.numerosEncontrados).toEqual(["0.092/2026", "0.093/2026"]);
  });
  it("segue três páginas, inclui arquivadas e mantém a data histórica", async () => {
    const urls: URL[] = [];
    mock.get.mockImplementation(async (url: string) => {
      const parsed = new URL(url); urls.push(parsed);
      if (parsed.pathname.endsWith("/messages")) {
        const token = parsed.searchParams.get("pageToken");
        return Response.json({ messages: [{ id: token ?? "primeira" }], nextPageToken: token === "terceira" ? undefined : token === "segunda" ? "terceira" : "segunda" });
      }
      return Response.json({ internalDate: String(Date.parse("2025-01-15T12:00:00Z")), labelIds: ["ARCHIVED"], payload: {
        mimeType: "text/plain", headers: [{ name: "Subject", value: "Pedido de e-SIC 026/2025 recebido" }],
        body: { data: Buffer.from("Novo Protocolo recebido. Nº: 026/2025 Assunto: Pedido De: Cidadão Para: Ouvidoria").toString("base64url") },
      } });
    });
    let cursor: EsicMailboxCursor | null = { accountId: mock.conta.id };
    let lidos = 0;
    while (cursor) { const r = await rechecarLoteEsic(cursor); lidos += r.lidos; cursor = r.proximo; }
    expect(lidos).toBe(3);
    expect(mock.ingest).toHaveBeenCalledTimes(3);
    expect(mock.ingest.mock.calls[0][0]).toMatchObject({ recheckEsic: true, receivedAt: "2025-01-15T12:00:00.000Z" });
    const listas = urls.filter(u => u.pathname.endsWith("/messages"));
    expect(listas).toHaveLength(3);
    for (const url of listas) {
      expect(url.searchParams.get("includeSpamTrash")).toBe("true");
      expect(url.searchParams.has("q")).toBe(false);
      expect(url.searchParams.has("labelIds")).toBe(false);
    }
  });
  it("não ingere mensagens comuns ao varrer a caixa inteira", async () => {
    mock.get.mockImplementation(async (url: string) => Response.json(url.includes("?maxResults")
      ? { messages: [{ id: "comum" }] }
      : { payload: { headers: [{ name: "Subject", value: "Reunião amanhã" }] }, snippet: "Agenda" }));
    const r = await rechecarLoteEsic({ accountId: mock.conta.id });
    expect(r.lidos).toBe(1);
    expect(r.encontrados).toBe(0);
    expect(mock.ingest).not.toHaveBeenCalled();
  });
});