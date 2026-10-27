import { describe, expect, it } from "vitest";
import { conexaoLicenca } from "./licenca-conexao";

describe("conectividade pelo heartbeat", () => {
  const agora = Date.parse("2026-10-27T02:00:00Z");
  it("confirma online por até duas janelas de cinco minutos", () => {
    expect(conexaoLicenca("2026-10-27T01:50:00Z", agora)).toBe("online");
    expect(conexaoLicenca("2026-10-27T01:49:59Z", agora)).toBe("offline");
  });
  it("não confirma conexão sem uma verificação válida", () => {
    expect(conexaoLicenca(null, agora)).toBe("offline");
    expect(conexaoLicenca("invalida", agora)).toBe("offline");
    expect(conexaoLicenca("2026-10-27T02:01:00Z", agora)).toBe("offline");
  });
});