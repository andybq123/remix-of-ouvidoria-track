import { describe, it, expect } from "vitest";
import {
  parseEstatisticasVps,
  idadeColetaSegundos,
  estaDesatualizado,
  formatarBytes,
  formatarPercentual,
  formatarUptime,
  formatarIdade,
  ordenarContainers,
  type VpsStatsColeta,
} from "./vps-stats";

const coletaValida: VpsStatsColeta = {
  versao: 1,
  coletadoEm: "2026-11-25T17:00:00Z",
  hostname: "ip-172-31-17-84",
  uptimeSegundos: 2828100,
  load: [1.15, 0.57, 0.42],
  cpu: { nucleos: 2, usoPercentual: 12.3 },
  memoria: {
    totalBytes: 8589934592,
    usadaBytes: 4294967296,
    livreBytes: 2147483648,
    disponivelBytes: 4294967296,
  },
  disco: {
    totalBytes: 50884108288,
    usadoBytes: 30788395008,
    livreBytes: 20078936064,
    usoPercentual: 60.5,
    pontoMontagem: "/",
  },
  containers: [
    { nome: "local-docker-app-1", estado: "Up 21 hours", emExecucao: true },
    { nome: "supabase_db_buraco-local", estado: "Up 12 days (healthy)", emExecucao: true },
  ],
  node: "v24.22.1",
  appCommit: "aa021da",
  appVersao: "aa021da",
};

describe("parseEstatisticasVps", () => {
  it("aceita uma coleta válida", () => {
    expect(parseEstatisticasVps(coletaValida)).toEqual(coletaValida);
  });

  it("rejeita JSON que não é objeto", () => {
    expect(parseEstatisticasVps(null)).toBeNull();
    expect(parseEstatisticasVps("texto")).toBeNull();
    expect(parseEstatisticasVps([1, 2])).toBeNull();
  });

  it("rejeita versão desconhecida e data inválida", () => {
    expect(parseEstatisticasVps({ ...coletaValida, versao: 2 })).toBeNull();
    expect(parseEstatisticasVps({ ...coletaValida, coletadoEm: "ontem" })).toBeNull();
    const { coletadoEm, ...semData } = coletaValida;
    void coletadoEm;
    expect(parseEstatisticasVps(semData)).toBeNull();
  });

  it("rejeita números fora da faixa", () => {
    expect(parseEstatisticasVps({ ...coletaValida, uptimeSegundos: -1 })).toBeNull();
    expect(
      parseEstatisticasVps({ ...coletaValida, cpu: { nucleos: 2, usoPercentual: 150 } }),
    ).toBeNull();
    expect(
      parseEstatisticasVps({ ...coletaValida, disco: { ...coletaValida.disco, usoPercentual: -1 } }),
    ).toBeNull();
    expect(parseEstatisticasVps({ ...coletaValida, load: [1, 2] })).toBeNull();
  });

  it("rejeita container malformado", () => {
    expect(
      parseEstatisticasVps({
        ...coletaValida,
        containers: [{ nome: "x", estado: "Up", emExecucao: "sim" }],
      }),
    ).toBeNull();
    expect(parseEstatisticasVps({ ...coletaValida, containers: "nenhum" })).toBeNull();
  });

  it("aceita campos opcionais ausentes como null", () => {
    const { hostname, node, appCommit, appVersao, ...rest } = coletaValida;
    void hostname;
    void node;
    void appCommit;
    void appVersao;
    const parsed = parseEstatisticasVps(rest);
    expect(parsed).not.toBeNull();
    expect(parsed?.hostname).toBeNull();
    expect(parsed?.node).toBeNull();
    expect(parsed?.appCommit).toBeNull();
    expect(parsed?.appVersao).toBeNull();
  });
});

describe("idade e desatualização", () => {
  it("calcula a idade em segundos e nunca devolve negativo", () => {
    expect(idadeColetaSegundos("2026-11-25T17:00:00Z", Date.parse("2026-11-25T17:02:30Z"))).toBe(150);
    expect(idadeColetaSegundos("2026-11-25T17:00:00Z", Date.parse("2026-11-25T16:59:00Z"))).toBe(0);
    expect(idadeColetaSegundos("data inválida")).toBeNull();
  });

  it("considera desatualizado só acima de 3 minutos", () => {
    expect(estaDesatualizado(180)).toBe(false);
    expect(estaDesatualizado(181)).toBe(true);
    expect(estaDesatualizado(null)).toBe(false);
  });
});

describe("formatadores", () => {
  it("formatarBytes usa unidades binárias com vírgula decimal", () => {
    expect(formatarBytes(0)).toBe("0 B");
    expect(formatarBytes(512)).toBe("512 B");
    expect(formatarBytes(1024)).toBe("1 KB");
    expect(formatarBytes(1536)).toBe("1,5 KB");
    expect(formatarBytes(5 * 1024 ** 3)).toBe("5 GB");
    expect(formatarBytes(2.5 * 1024 ** 4)).toBe("2,5 TB");
    expect(formatarBytes(-1)).toBe("—");
  });

  it("formatarPercentual usa uma casa decimal", () => {
    expect(formatarPercentual(12.3)).toBe("12,3%");
    expect(formatarPercentual(100)).toBe("100,0%");
  });

  it("formatarUptime cobre segundos, minutos, horas e dias", () => {
    expect(formatarUptime(45)).toBe("45 s");
    expect(formatarUptime(90)).toBe("1 min");
    expect(formatarUptime(3661)).toBe("1 h 1 min");
    expect(formatarUptime(7200)).toBe("2 h");
    expect(formatarUptime(90061)).toBe("1 dia, 1 h");
    expect(formatarUptime(2 * 86400 + 3 * 3600)).toBe("2 dias, 3 h");
    expect(formatarUptime(86400)).toBe("1 dia");
  });

  it("formatarIdade prefixa com 'há'", () => {
    expect(formatarIdade(2)).toBe("agora mesmo");
    expect(formatarIdade(30)).toBe("há 30 s");
    expect(formatarIdade(300)).toBe("há 5 min");
    expect(formatarIdade(7200)).toBe("há 2 h");
  });
});

describe("ordenarContainers", () => {
  it("mostra app, agente 1Doc e coletor de e-mail primeiro", () => {
    const ordenados = ordenarContainers([
      { nome: "supabase_db_buraco-local", estado: "Up", emExecucao: true },
      { nome: "local-docker-coletor-email-1", estado: "Up", emExecucao: true },
      { nome: "outro-container", estado: "Up", emExecucao: true },
      { nome: "local-docker-agente-1doc-1", estado: "Up", emExecucao: true },
      { nome: "local-docker-app-1", estado: "Up", emExecucao: true },
    ]);
    expect(ordenados.map((c) => c.nome)).toEqual([
      "local-docker-app-1",
      "local-docker-agente-1doc-1",
      "local-docker-coletor-email-1",
      "supabase_db_buraco-local",
      "outro-container",
    ]);
  });
});
