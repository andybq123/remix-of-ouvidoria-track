// Leitura do JSON de estatísticas da VPS no servidor.
// O coletor do host (local-docker/deploy/coletar-vps-stats.sh, via cron)
// grava local-docker/vps-stats/vps-stats.json; o app vê o repo em /app,
// então o arquivo está em <cwd>/local-docker/vps-stats/vps-stats.json.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parseEstatisticasVps,
  idadeColetaSegundos,
  estaDesatualizado,
  type VpsStatsResposta,
} from "./vps-stats";

export function caminhoArquivoEstatisticasVps(): string {
  return join(process.cwd(), "local-docker", "vps-stats", "vps-stats.json");
}

const INDISPONIVEL: VpsStatsResposta = {
  disponivel: false,
  coletadoEm: null,
  idadeSegundos: null,
  desatualizado: false,
  coleta: null,
};

/** Lê e valida a última coleta. Arquivo ausente ou inválido = coletando. */
export async function lerEstatisticasVps(agoraMs = Date.now()): Promise<VpsStatsResposta> {
  let conteudo: string;
  try {
    conteudo = await readFile(caminhoArquivoEstatisticasVps(), "utf-8");
  } catch {
    return INDISPONIVEL;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(conteudo);
  } catch {
    return INDISPONIVEL;
  }
  const coleta = parseEstatisticasVps(parsed);
  if (!coleta) return INDISPONIVEL;
  const idadeSegundos = idadeColetaSegundos(coleta.coletadoEm, agoraMs);
  return {
    disponivel: true,
    coletadoEm: coleta.coletadoEm,
    idadeSegundos,
    desatualizado: estaDesatualizado(idadeSegundos),
    coleta,
  };
}
