import type { MapDepartment } from "@/lib/map-departments";

export const SECRETARIA_ICONES: Record<string, { emoji: string; label: string }> = {
  saude: { emoji: "🏥", label: "Saúde" },
  educacao: { emoji: "🎓", label: "Educação" },
  obras: { emoji: "🚧", label: "Obras" },
  seguranca: { emoji: "🛡️", label: "Segurança" },
  meio_ambiente: { emoji: "🌳", label: "Meio Ambiente" },
  transporte: { emoji: "🚌", label: "Transporte" },
  cultura: { emoji: "🎭", label: "Cultura" },
  esporte: { emoji: "⚽", label: "Esporte" },
  agricultura: { emoji: "🌱", label: "Agricultura" },
  assistencia_social: { emoji: "🤝", label: "Assistência Social" },
  fazenda: { emoji: "💰", label: "Fazenda" },
  turismo: { emoji: "🧳", label: "Turismo" },
  administracao: { emoji: "🏛️", label: "Administração" },
};

export function obterIconeSecretaria(
  icone?: string | null,
  setor?: MapDepartment | null,
): { key: string; emoji: string; label: string } {
  const automatico = setor && SECRETARIA_ICONES[setor] ? setor : "administracao";
  const key = icone && SECRETARIA_ICONES[icone] ? icone : automatico;
  const configuracao = SECRETARIA_ICONES[key] ?? SECRETARIA_ICONES.administracao;
  return { key, ...configuracao };
}
