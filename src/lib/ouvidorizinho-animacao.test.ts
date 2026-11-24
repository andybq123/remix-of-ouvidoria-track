import { describe, expect, it } from "vitest";
import {
  VIDEO_POR_ESTADO,
  estadoTocaUmaVez,
  inclinacaoParaCursor,
  proximoIntervaloTelefone,
  resolverEstadoAnimacao,
  INTERVALO_TELEFONE_MAX_MS,
  INTERVALO_TELEFONE_MIN_MS,
} from "./ouvidorizinho-animacao";

describe("animação do Ouvidorizinho", () => {
  it("cada estado tem um vídeo próprio", () => {
    expect(VIDEO_POR_ESTADO.idle).toBe("/ouvidorizinho-idle.mp4");
    expect(VIDEO_POR_ESTADO.telefone).toBe("/ouvidorizinho-telefone.mp4");
    expect(VIDEO_POR_ESTADO.pensando).toBe("/ouvidorizinho-pensando.mp4");
    expect(VIDEO_POR_ESTADO.desconfiado).toBe("/ouvidorizinho-desconfiado.mp4");
  });

  it("pensando tem prioridade sobre os outros estados", () => {
    expect(
      resolverEstadoAnimacao({ pensando: true, desconfiadoAtivo: true, telefoneAtivo: true }),
    ).toBe("pensando");
  });

  it("desconfiado vence o telefone, que vence o idle", () => {
    expect(
      resolverEstadoAnimacao({ pensando: false, desconfiadoAtivo: true, telefoneAtivo: true }),
    ).toBe("desconfiado");
    expect(
      resolverEstadoAnimacao({ pensando: false, desconfiadoAtivo: false, telefoneAtivo: true }),
    ).toBe("telefone");
    expect(
      resolverEstadoAnimacao({ pensando: false, desconfiadoAtivo: false, telefoneAtivo: false }),
    ).toBe("idle");
  });

  it("telefone e desconfiado tocam uma vez; idle e pensando são loops", () => {
    expect(estadoTocaUmaVez("telefone")).toBe(true);
    expect(estadoTocaUmaVez("desconfiado")).toBe(true);
    expect(estadoTocaUmaVez("idle")).toBe(false);
    expect(estadoTocaUmaVez("pensando")).toBe(false);
  });

  it("intervalo do telefone fica entre 45 e 90 segundos", () => {
    for (let i = 0; i < 20; i++) {
      const v = proximoIntervaloTelefone();
      expect(v).toBeGreaterThanOrEqual(INTERVALO_TELEFONE_MIN_MS);
      expect(v).toBeLessThanOrEqual(INTERVALO_TELEFONE_MAX_MS);
    }
  });

  it("inclinação para o cursor é limitada e segue o lado do mouse", () => {
    const direita = inclinacaoParaCursor(120, 0);
    expect(direita.rotacao).toBeGreaterThan(0);
    expect(direita.rotacao).toBeLessThanOrEqual(8);
    const esquerda = inclinacaoParaCursor(-120, 0);
    expect(esquerda.rotacao).toBeLessThan(0);
    expect(esquerda.rotacao).toBeGreaterThanOrEqual(-8);
    expect(inclinacaoParaCursor(0, 0)).toEqual({ rotacao: 0, deslocamentoX: 0 });
  });
});
