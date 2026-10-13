import { existsSync } from "node:fs";
import { join } from "node:path";

/** Arquivos operacionais locais, ignorados pelo Git e preservados em atualizações. */
export function ingestaoPausada(): boolean {
  return existsSync(join(process.cwd(), "local-docker", ".ingestao-pausada"));
}

export function restauracaoAutomaticaIaBloqueada(): boolean {
  return existsSync(join(process.cwd(), "local-docker", ".ia-restauracao-bloqueada"));
}

export function exigirIngestaoAtiva(): void {
  if (ingestaoPausada()) {
    throw new Error(
      "Ingestão pausada para importação de backup. Retome pela VPS após concluir a importação.",
    );
  }
}

/** Protocolos/históricos do novo backup são permitidos; logs/coletas/IA não. */
export function validarTabelaImportacao(tabela: string): void {
  if (ingestaoPausada() && ["email_inbox_log", "coletas", "ai_config"].includes(tabela)) {
    throw new Error(
      "Logs de e-mail, coletas e configuração IA não podem ser restaurados enquanto a base está preparada para importação. Configure a IA manualmente.",
    );
  }
}
