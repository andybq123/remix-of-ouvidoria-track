import { describe, it, expect } from "vitest";
import {
  BACKUP_ALERTA_JANELA_MS,
  backupVencido,
  deveMostrarAlertaBackup,
  escolherParaApagar,
  extrairDrivePastaId,
  intervaloLabel,
  motivoAlertaBackup,
  validarBackupConfig,
  type BackupConfigForm,
} from "./backup-auto";

const AGORA = new Date("2026-11-26T16:00:00-03:00");
const DIA = 24 * 60 * 60 * 1000;

function configBase(over: Partial<BackupConfigForm> = {}): BackupConfigForm {
  return {
    habilitado: true,
    intervalo_horas: 24,
    manter_copias: 7,
    destino_vps: true,
    vps_pasta: "backups",
    destino_drive: false,
    drive_pasta_url: "",
    drive_sa_email: null,
    tem_sa_json: false,
    destino_s3: false,
    s3_endpoint: "",
    s3_bucket: "",
    s3_regiao: "",
    s3_prefixo: "ouvidesk-backups/",
    s3_access_key: "",
    tem_s3_secret: false,
    ...over,
  };
}

describe("extrairDrivePastaId", () => {
  it("aceita os formatos de link do Drive e o id solto", () => {
    expect(
      extrairDrivePastaId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx"),
    ).toBe("1AbCdEfGhIjKlMnOpQrStUvWx");
    expect(
      extrairDrivePastaId("https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOpQrStUvWx?usp=sharing"),
    ).toBe("1AbCdEfGhIjKlMnOpQrStUvWx");
    expect(extrairDrivePastaId("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWx")).toBe(
      "1AbCdEfGhIjKlMnOpQrStUvWx",
    );
    expect(extrairDrivePastaId("1AbCdEfGhIjKlMnOpQrStUvWx")).toBe("1AbCdEfGhIjKlMnOpQrStUvWx");
  });
  it("rejeita link sem id", () => {
    expect(extrairDrivePastaId("https://drive.google.com/drive/home")).toBeNull();
    expect(extrairDrivePastaId("")).toBeNull();
    expect(extrairDrivePastaId(null)).toBeNull();
  });
});

describe("intervaloLabel", () => {
  it("nomeia os intervalos", () => {
    expect(intervaloLabel(6)).toBe("a cada 6 horas");
    expect(intervaloLabel(24)).toBe("diário");
    expect(intervaloLabel(168)).toBe("semanal");
  });
});

describe("backupVencido", () => {
  it("sem backup com sucesso, está vencido", () => {
    expect(backupVencido(null, 24, AGORA)).toBe(true);
    expect(backupVencido(undefined, 24, AGORA)).toBe(true);
  });
  it("respeita o intervalo configurado", () => {
    expect(backupVencido(new Date(AGORA.getTime() - 23 * 60 * 60 * 1000), 24, AGORA)).toBe(false);
    expect(backupVencido(new Date(AGORA.getTime() - 25 * 60 * 60 * 1000), 24, AGORA)).toBe(true);
    expect(backupVencido(new Date(AGORA.getTime() - 6 * DIA), 168, AGORA)).toBe(false);
    expect(backupVencido(new Date(AGORA.getTime() - 8 * DIA), 168, AGORA)).toBe(true);
  });
});

describe("escolherParaApagar", () => {
  it("mantém só os N mais recentes", () => {
    const nomes = [
      "ouvidesk-backup-20261120-100000.zip",
      "ouvidesk-backup-20261121-100000.zip",
      "ouvidesk-backup-20261122-100000.zip",
      "ouvidesk-backup-20261123-100000.zip",
    ];
    expect(escolherParaApagar(nomes, 2)).toEqual([
      "ouvidesk-backup-20261120-100000.zip",
      "ouvidesk-backup-20261121-100000.zip",
    ]);
    expect(escolherParaApagar(nomes, 7)).toEqual([]);
    expect(escolherParaApagar(nomes, 0)).toEqual(nomes);
  });
});

describe("alerta semanal", () => {
  it("sem backup, o motivo é 'nunca'", () => {
    expect(motivoAlertaBackup(null, AGORA)).toBe("nunca");
  });
  it("backup recente não alerta; com mais de 7 dias, alerta", () => {
    expect(motivoAlertaBackup(new Date(AGORA.getTime() - 6 * DIA), AGORA)).toBeNull();
    expect(motivoAlertaBackup(new Date(AGORA.getTime() - 8 * DIA), AGORA)).toBe("desatualizado");
  });
  it("não repete o alerta dentro de 7 dias", () => {
    const ultimoOk = new Date(AGORA.getTime() - 8 * DIA);
    expect(deveMostrarAlertaBackup(ultimoOk, null, AGORA)).toBe(true);
    expect(deveMostrarAlertaBackup(ultimoOk, new Date(AGORA.getTime() - 6 * DIA), AGORA)).toBe(
      false,
    );
    expect(deveMostrarAlertaBackup(ultimoOk, new Date(AGORA.getTime() - 8 * DIA), AGORA)).toBe(
      true,
    );
    expect(
      deveMostrarAlertaBackup(new Date(AGORA.getTime() - 6 * DIA), null, AGORA),
    ).toBe(false);
  });
});

describe("validarBackupConfig", () => {
  it("aceita a configuração mínima (só VPS)", () => {
    expect(validarBackupConfig(configBase())).toEqual([]);
  });
  it("exige ao menos um destino quando habilitado", () => {
    expect(
      validarBackupConfig(configBase({ destino_vps: false })),
    ).toContain("Ative ao menos um destino (pasta na VPS, Google Drive ou S3).");
  });
  it("Drive exige link válido e conta de serviço", () => {
    const erros = validarBackupConfig(
      configBase({ destino_drive: true, drive_pasta_url: "https://drive.google.com/drive/home" }),
    );
    expect(erros).toContain("Informe o link da pasta do Google Drive.");
    expect(erros).toContain("Envie o JSON da conta de serviço do Google Drive.");
  });
  it("S3 exige endpoint, bucket e chaves", () => {
    const erros = validarBackupConfig(configBase({ destino_s3: true }));
    expect(erros).toContain("Informe o endpoint do S3.");
    expect(erros).toContain("Informe o bucket do S3.");
    expect(erros).toContain("Informe a chave de acesso do S3.");
    expect(erros).toContain("Informe a chave secreta do S3.");
  });
  it("rejeita intervalo e retenção fora do permitido", () => {
    expect(validarBackupConfig(configBase({ intervalo_horas: 48 }))).toContain(
      "Intervalo inválido.",
    );
    expect(validarBackupConfig(configBase({ manter_copias: 0 }))).toContain(
      "Manter cópias deve ser de 1 a 90.",
    );
  });
  it("desabilitado não exige destino", () => {
    expect(validarBackupConfig(configBase({ habilitado: false, destino_vps: false }))).toEqual(
      [],
    );
  });
});

describe("BACKUP_ALERTA_JANELA_MS", () => {
  it("vale 7 dias", () => {
    expect(BACKUP_ALERTA_JANELA_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
