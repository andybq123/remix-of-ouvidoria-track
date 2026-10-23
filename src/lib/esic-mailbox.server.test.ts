import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EsicMailboxCursor } from "./esic-mailbox";

const mock = vi.hoisted(() => ({ ingest: vi.fn(), get: vi.fn(), conta: { id: "00000000-0000-4000-8000-000000000001", provider: "gmail", email: "teste@example.local", ativo: true } }));
vi.mock("./import-maintenance.server", () => ({ exigirIngestaoAtiva: vi.fn() }));
vi.mock("./protocolo-ingest.server", () => ({ ingerirEmail: mock.ingest }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => {
  const q = { select: () => q, eq: () => q, single: async () => ({ data: mock.conta, error: null }) };
  return q;
} } }));
import { rechecarLoteEsic } from "./esic-mailbox.server";

beforeEach(() => {
  vi.stubEnv("LOVABLE_API_KEY", "fake-test-key");
  vi.stubEnv("GOOGLE_MAIL_API_KEY", "fake-test-key");
  mock.ingest.mockReset().mockResolvedValue({ ok: true, protocoloId: "esic-teste" });
  mock.get.mockReset();
  vi.stubGlobal("fetch", mock.get);
});
describe("Gmail e-SIC histórico completo", () => {
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