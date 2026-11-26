/**
 * Backup automático — regras puras (sem acesso a banco ou rede).
 *
 * O backup em si roda no host (local-docker/deploy/backup-auto.sh), que
 * lê a configuração do banco e grava cada execução em backup_runs. Aqui
 * ficam só as regras que o painel e o alerta pós-login compartilham:
 * extrair o id da pasta do Drive a partir do link colado, decidir se o
 * backup está vencido, escolher o que a retenção apaga e decidir se o
 * alerta semanal aparece para o admin.
 */

export const BACKUP_INTERVALOS_HORAS = [6, 12, 24, 168] as const;
export type BackupIntervaloHoras = (typeof BACKUP_INTERVALOS_HORAS)[number];

/** Uma semana, em milissegundos — cadência do alerta aos administradores. */
export const BACKUP_ALERTA_JANELA_MS = 7 * 24 * 60 * 60 * 1000;

/** Prefixo dos arquivos de backup no Drive/S3 (o resto é a data/hora). */
export const BACKUP_ARQUIVO_PREFIXO = "ouvidesk-backup-";

/**
 * Extrai o id da pasta do Google Drive a partir do link colado no painel.
 * Aceita os formatos usuais (/drive/folders/<id>, /open?id=<id>,
 * /drive?id=<id>) e o próprio id solto. Sem id: null.
 */
export function extrairDrivePastaId(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;
  const porCaminho = v.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (porCaminho) return porCaminho[1];
  const porQuery = v.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (porQuery) return porQuery[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(v)) return v;
  return null;
}

/** Rótulo curto do intervalo para o painel ("a cada 6 horas", "diário"...). */
export function intervaloLabel(horas: number): string {
  if (horas === 24) return "diário";
  if (horas === 168) return "semanal";
  return `a cada ${horas} horas`;
}

/**
 * O backup está vencido quando nunca houve um com sucesso, ou o último
 * com sucesso é mais antigo que o intervalo configurado. O runner usa
 * esta mesma regra para decidir se executa.
 */
export function backupVencido(
  ultimoOkEm: Date | string | null | undefined,
  intervaloHoras: number,
  agora = new Date(),
): boolean {
  if (!ultimoOkEm) return true;
  const ultimo = ultimoOkEm instanceof Date ? ultimoOkEm : new Date(ultimoOkEm);
  if (Number.isNaN(ultimo.getTime())) return true;
  return agora.getTime() - ultimo.getTime() > intervaloHoras * 60 * 60 * 1000;
}

/**
 * Nomes ordenados do mais antigo ao mais recente (os arquivos levam a
 * data no nome, então a ordem alfabética é a cronológica). Devolve os
 * que a retenção deve apagar: todos, menos os `manter` mais recentes.
 */
export function escolherParaApagar(nomesOrdenados: string[], manter: number): string[] {
  if (manter < 1) return [...nomesOrdenados];
  if (nomesOrdenados.length <= manter) return [];
  return nomesOrdenados.slice(0, nomesOrdenados.length - manter);
}

/** Motivo do alerta semanal, ou null quando não há nada a alertar. */
export type BackupAlertaMotivo = "nunca" | "desatualizado";

export function motivoAlertaBackup(
  ultimoOkEm: Date | string | null | undefined,
  agora = new Date(),
): BackupAlertaMotivo | null {
  if (!ultimoOkEm) return "nunca";
  const ultimo = ultimoOkEm instanceof Date ? ultimoOkEm : new Date(ultimoOkEm);
  if (Number.isNaN(ultimo.getTime())) return "nunca";
  return agora.getTime() - ultimo.getTime() > BACKUP_ALERTA_JANELA_MS
    ? "desatualizado"
    : null;
}

/**
 * O alerta semanal aparece para o admin quando não há backup com
 * sucesso nos últimos 7 dias (ou nunca houve) E o alerta não foi
 * exibido a ele nos últimos 7 dias. Sem `ultimoAlertaEm`, mostra.
 */
export function deveMostrarAlertaBackup(
  ultimoOkEm: Date | string | null | undefined,
  ultimoAlertaEm: Date | string | null | undefined,
  agora = new Date(),
): boolean {
  if (!motivoAlertaBackup(ultimoOkEm, agora)) return false;
  if (!ultimoAlertaEm) return true;
  const visto = ultimoAlertaEm instanceof Date ? ultimoAlertaEm : new Date(ultimoAlertaEm);
  if (Number.isNaN(visto.getTime())) return true;
  return agora.getTime() - visto.getTime() > BACKUP_ALERTA_JANELA_MS;
}

export type BackupConfigForm = {
  habilitado: boolean;
  intervalo_horas: number;
  manter_copias: number;
  destino_vps: boolean;
  vps_pasta: string;
  destino_drive: boolean;
  drive_pasta_url: string;
  drive_sa_email: string | null;
  tem_sa_json: boolean;
  destino_s3: boolean;
  s3_endpoint: string;
  s3_bucket: string;
  s3_regiao: string;
  s3_prefixo: string;
  s3_access_key: string;
  tem_s3_secret: boolean;
};

/** Validação da configuração antes de salvar. Devolve a lista de erros. */
export function validarBackupConfig(c: BackupConfigForm): string[] {
  const erros: string[] = [];
  if (!BACKUP_INTERVALOS_HORAS.includes(c.intervalo_horas as BackupIntervaloHoras)) {
    erros.push("Intervalo inválido.");
  }
  if (!Number.isInteger(c.manter_copias) || c.manter_copias < 1 || c.manter_copias > 90) {
    erros.push("Manter cópias deve ser de 1 a 90.");
  }
  if (c.habilitado && !c.destino_vps && !c.destino_drive && !c.destino_s3) {
    erros.push("Ative ao menos um destino (pasta na VPS, Google Drive ou S3).");
  }
  if (c.destino_vps && !c.vps_pasta.trim()) {
    erros.push("Informe a pasta na VPS.");
  }
  if (c.destino_drive) {
    if (!extrairDrivePastaId(c.drive_pasta_url)) {
      erros.push("Informe o link da pasta do Google Drive.");
    }
    if (!c.tem_sa_json) {
      erros.push("Envie o JSON da conta de serviço do Google Drive.");
    }
  }
  if (c.destino_s3) {
    if (!c.s3_endpoint.trim()) erros.push("Informe o endpoint do S3.");
    if (!c.s3_bucket.trim()) erros.push("Informe o bucket do S3.");
    if (!c.s3_access_key.trim()) erros.push("Informe a chave de acesso do S3.");
    if (!c.tem_s3_secret) erros.push("Informe a chave secreta do S3.");
  }
  return erros;
}
