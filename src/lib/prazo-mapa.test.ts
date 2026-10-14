import { describe, expect, it } from "vitest";
import { format, subDays } from "date-fns";
import { resumoPrazoMapa } from "./prazo";

const hoje = new Date();
const dia = (n: number) => format(subDays(hoje, n), "yyyy-MM-dd");
const diaFim = (n: number) => format(subDays(hoje, n - 30), "dd/MM/yyyy");

describe("resumoPrazoMapa (popup do mapa)", () => {
  it("mostra a data-limite e os dias de atraso de uma ouvidoria vencida", () => {
    const r = resumoPrazoMapa({
      tipo: "ouvidoria",
      data_abertura: dia(40),
      prorrogado: false,
      status: "em_andamento",
    });
    expect(r).not.toBeNull();
    // Prazo de 30 dias: abriu há 40 → 10 dias de atraso.
    expect(r!.diasAtraso).toBe(10);
    expect(r!.atrasado).toBe(true);
    expect(r!.concluido).toBe(false);
    expect(r!.diasTexto).toBe("atrasada há 10 dias");
    expect(r!.prazoTexto).toBe(diaFim(40));
  });

  it("usa o singular quando o atraso é de um dia", () => {
    const r = resumoPrazoMapa({
      tipo: "ouvidoria",
      data_abertura: dia(31),
      prorrogado: false,
      status: "aberto",
    });
    expect(r!.diasAtraso).toBe(1);
    expect(r!.diasTexto).toBe("atrasada há 1 dia");
  });

  it("desconta a prorrogação do atraso", () => {
    const r = resumoPrazoMapa({
      tipo: "ouvidoria",
      data_abertura: dia(40),
      prorrogado: true,
      status: "em_andamento",
    });
    // 30 + 30 = 60 dias: ainda faltam 20 dias.
    expect(r!.atrasado).toBe(false);
    expect(r!.diasAtraso).toBe(0);
    expect(r!.diasTexto).toBe("faltam 20 dias");
  });

  it("marca como vencido hoje quando a data-limite é hoje", () => {
    const r = resumoPrazoMapa({
      tipo: "ouvidoria",
      data_abertura: dia(30),
      prorrogado: false,
      status: "em_andamento",
    });
    expect(r!.atrasado).toBe(false);
    expect(r!.diasTexto).toBe("vence hoje");
  });

  it("aplica o prazo de 20 dias do e-SIC", () => {
    const r = resumoPrazoMapa({
      tipo: "esic",
      data_abertura: dia(25),
      prorrogado: false,
      status: "em_andamento",
    });
    expect(r!.diasAtraso).toBe(5);
    expect(r!.diasTexto).toBe("atrasada há 5 dias");
  });

  it("não diz que está atrasada quando o protocolo já foi concluído", () => {
    const r = resumoPrazoMapa({
      tipo: "ouvidoria",
      data_abertura: dia(40),
      prorrogado: false,
      status: "concluido",
      data_conclusao: dia(5),
    });
    expect(r!.concluido).toBe(true);
    expect(r!.atrasado).toBe(false);
    expect(r!.diasTexto).toBe("Concluído");
  });

  it("retorna null sem data de abertura ou com tipo desconhecido", () => {
    expect(resumoPrazoMapa({ tipo: "ouvidoria", data_abertura: null, status: "aberto" })).toBeNull();
    expect(resumoPrazoMapa({ tipo: null, data_abertura: dia(40), status: "aberto" })).toBeNull();
    expect(
      resumoPrazoMapa({ tipo: "inventado", data_abertura: dia(40), status: "aberto" }),
    ).toBeNull();
  });
});
