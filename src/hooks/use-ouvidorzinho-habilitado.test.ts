import { describe, expect, it } from "vitest";
import { ouvidorzinhoHabilitadoParaUsuario } from "./use-ouvidorzinho-habilitado";

describe("acesso ao Ouvidorzinho por usuário", () => {
  it("só o false estrito desabilita", () => {
    expect(ouvidorzinhoHabilitadoParaUsuario(false)).toBe(false);
  });

  it("true mantém habilitado", () => {
    expect(ouvidorzinhoHabilitadoParaUsuario(true)).toBe(true);
  });

  it("fail-open: sem retorno (null/undefined) mantém habilitado", () => {
    expect(ouvidorzinhoHabilitadoParaUsuario(null)).toBe(true);
    expect(ouvidorzinhoHabilitadoParaUsuario(undefined)).toBe(true);
  });
});
