import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Clock3, Cloud, DatabaseBackup, FolderCog, HardDrive, Play, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getBackupAutoConfig, listarBackupRuns, salvarBackupAutoConfig, solicitarBackupAgora,
} from "@/lib/backup-auto.functions";
import {
  BACKUP_INTERVALOS_HORAS, intervaloLabel, validarBackupConfig, type BackupConfigForm,
} from "@/lib/backup-auto";

function formatarTamanho(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function dataBR(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

/**
 * Backup automático — seção da tela de Backup (só admin).
 *
 * A rotina em si roda na VPS (timer systemd a cada 15 min, que só
 * executa quando o backup está vencido ou foi solicitado aqui). Esta
 * tela grava a configuração (destinos, intervalo, retenção) e mostra
 * o histórico das execuções. Os segredos nunca voltam do servidor:
 * o JSON da conta de serviço e a chave secreta do S3 só são enviados
 * quando trocados.
 */
export function BackupAutomaticoCard() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getBackupAutoConfig);
  const salvar = useServerFn(salvarBackupAutoConfig);
  const solicitar = useServerFn(solicitarBackupAgora);
  const listarRuns = useServerFn(listarBackupRuns);

  const { data: config } = useQuery({
    queryKey: ["backup-auto-config"],
    queryFn: () => getConfig(),
  });
  const { data: runs } = useQuery({
    queryKey: ["backup-runs"],
    queryFn: () => listarRuns(),
    refetchInterval: 30_000,
  });

  const [habilitado, setHabilitado] = useState(false);
  const [intervalo, setIntervalo] = useState("24");
  const [manter, setManter] = useState("7");
  const [destinoVps, setDestinoVps] = useState(true);
  const [vpsPasta, setVpsPasta] = useState("backups");
  const [destinoDrive, setDestinoDrive] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [saJson, setSaJson] = useState<unknown>(null);
  const [saEmailNovo, setSaEmailNovo] = useState("");
  const [saRemovido, setSaRemovido] = useState(false);
  const [destinoS3, setDestinoS3] = useState(false);
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3Regiao, setS3Regiao] = useState("");
  const [s3Prefixo, setS3Prefixo] = useState("ouvidesk-backups/");
  const [s3Access, setS3Access] = useState("");
  const [s3Secret, setS3Secret] = useState("");
  const [s3SecretRemovido, setS3SecretRemovido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const saInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!config) return;
    setHabilitado(config.habilitado);
    setIntervalo(String(config.intervalo_horas));
    setManter(String(config.manter_copias));
    setDestinoVps(config.destino_vps);
    setVpsPasta(config.vps_pasta);
    setDestinoDrive(config.destino_drive);
    setDriveUrl(config.drive_pasta_url);
    setDestinoS3(config.destino_s3);
    setS3Endpoint(config.s3_endpoint);
    setS3Bucket(config.s3_bucket);
    setS3Regiao(config.s3_regiao);
    setS3Prefixo(config.s3_prefixo);
    setS3Access(config.s3_access_key);
    setSaJson(null); setSaEmailNovo(""); setSaRemovido(false);
    setS3Secret(""); setS3SecretRemovido(false);
  }, [config]);

  async function escolherSa(f: File | undefined) {
    if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const email = typeof obj?.client_email === "string" ? obj.client_email : "";
      const chave = typeof obj?.private_key === "string" ? obj.private_key : "";
      if (!email.includes("@") || !chave.startsWith("-----BEGIN")) {
        throw new Error("O arquivo não parece ser o JSON de uma conta de serviço (faltam client_email e private_key).");
      }
      setSaJson(obj); setSaEmailNovo(email); setSaRemovido(false);
      toast.success("Conta de serviço carregada.", { description: email });
    } catch (e: any) {
      toast.error(`Arquivo inválido: ${e.message}`);
    } finally {
      if (saInputRef.current) saInputRef.current.value = "";
    }
  }

  async function salvarConfig() {
    const temSa = (!!config?.tem_sa_json && !saRemovido) || saJson !== null;
    const temSecret = (!!config?.tem_s3_secret && !s3SecretRemovido) || s3Secret.trim().length > 0;
    const form: BackupConfigForm = {
      habilitado, intervalo_horas: Number(intervalo), manter_copias: Number(manter),
      destino_vps: destinoVps, vps_pasta: vpsPasta,
      destino_drive: destinoDrive, drive_pasta_url: driveUrl,
      drive_sa_email: saEmailNovo || config?.drive_sa_email || null, tem_sa_json: temSa,
      destino_s3: destinoS3, s3_endpoint: s3Endpoint, s3_bucket: s3Bucket,
      s3_regiao: s3Regiao, s3_prefixo: s3Prefixo, s3_access_key: s3Access,
      tem_s3_secret: temSecret,
    };
    const erros = validarBackupConfig(form);
    if (erros.length > 0) return toast.error(erros[0], { description: erros.slice(1).join(" ") || undefined });
    setSalvando(true);
    try {
      await salvar({
        data: {
          habilitado, intervalo_horas: Number(intervalo), manter_copias: Number(manter),
          destino_vps: destinoVps, vps_pasta: vpsPasta.trim(),
          destino_drive: destinoDrive, drive_pasta_url: driveUrl.trim(),
          ...(saJson !== null ? { drive_sa_json: saJson } : {}),
          limpar_drive_sa: saRemovido,
          destino_s3: destinoS3, s3_endpoint: s3Endpoint.trim(), s3_bucket: s3Bucket.trim(),
          s3_regiao: s3Regiao.trim(), s3_prefixo: s3Prefixo.trim(),
          s3_access_key: s3Access.trim(),
          ...(s3Secret.trim() ? { s3_secret_key: s3Secret.trim() } : {}),
          limpar_s3_secret: s3SecretRemovido,
        },
      });
      await qc.invalidateQueries({ queryKey: ["backup-auto-config"] });
      toast.success("Configuração de backup automático salva.");
    } catch (e: any) {
      toast.error(`Falha ao salvar: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  }

  async function backupAgora() {
    setSolicitando(true);
    try {
      await solicitar();
      await qc.invalidateQueries({ queryKey: ["backup-auto-config"] });
      await qc.invalidateQueries({ queryKey: ["backup-runs"] });
      toast.success("Backup solicitado.", { description: "A rotina da VPS executa em até 15 minutos." });
    } catch (e: any) {
      toast.error(`Falha ao solicitar: ${e.message}`);
    } finally {
      setSolicitando(false);
    }
  }

  const emAndamento = runs?.[0]?.status === "em_andamento";
  const ultimoOk = config?.ultimo_ok ?? null;
  const proximo = ultimoOk
    ? new Date(new Date(ultimoOk).getTime() + Number(intervalo) * 60 * 60 * 1000)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" /> Backup automático</CardTitle>
        <CardDescription>
          A rotina roda na VPS e guarda o dump completo do banco + o .env.local num .zip.
          Ative um ou mais destinos, escolha o intervalo e quantas cópias manter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={habilitado} onCheckedChange={setHabilitado} />
            <span className="font-medium">Backup automático {habilitado ? "ativado" : "desativado"}</span>
          </label>
          <span className="text-muted-foreground">
            Último backup com sucesso: <strong className="text-foreground">{dataBR(ultimoOk)}</strong>
            {proximo && <> · próximo: <strong className="text-foreground">{proximo.toLocaleString("pt-BR")}</strong></>}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Intervalo</Label>
            <Select value={intervalo} onValueChange={setIntervalo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BACKUP_INTERVALOS_HORAS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{intervaloLabel(h)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Manter cópias (por destino)</Label>
            <Input type="number" min={1} max={90} value={manter} onChange={(e) => setManter(e.target.value)} />
          </div>
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={destinoVps} onCheckedChange={setDestinoVps} />
            <HardDrive className="h-4 w-4" />
            <span className="font-medium">Pasta na VPS</span>
          </label>
          {destinoVps && (
            <div className="space-y-2 pl-8">
              <Label>Pasta (dentro de local-docker)</Label>
              <Input value={vpsPasta} onChange={(e) => setVpsPasta(e.target.value)} placeholder="backups" />
              <p className="text-xs text-muted-foreground">Os arquivos ficam em local-docker/backups/auto-AAAA-MM-DD-HHMMSS/ e só o sistema da VPS lê essa pasta.</p>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={destinoDrive} onCheckedChange={setDestinoDrive} />
            <Cloud className="h-4 w-4" />
            <span className="font-medium">Google Drive (conta de serviço)</span>
          </label>
          {destinoDrive && (
            <div className="space-y-3 pl-8">
              <div className="space-y-2">
                <Label>Link da pasta do Drive</Label>
                <Input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
              </div>
              <div className="space-y-2">
                <Label>JSON da conta de serviço</Label>
                <input ref={saInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => escolherSa(e.target.files?.[0])} />
                {(config?.tem_sa_json && !saRemovido && saJson === null) ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Configurada: {config.drive_sa_email ?? "conta de serviço"}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => { setSaRemovido(true); }}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remover
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => saInputRef.current?.click()}>Trocar arquivo</Button>
                  </div>
                ) : saJson !== null ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Novo arquivo: {saEmailNovo}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => { setSaJson(null); setSaEmailNovo(""); }}>
                      <Trash2 className="h-4 w-4 mr-1" /> Descartar
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => saInputRef.current?.click()}>
                    Enviar JSON da conta de serviço
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Crie a conta de serviço no Google Cloud, compartilhe a pasta do Drive com o e-mail dela
                  (só leitura/escrita na pasta) e envie o arquivo JSON aqui. O backup vai para a pasta informada.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border p-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={destinoS3} onCheckedChange={setDestinoS3} />
            <FolderCog className="h-4 w-4" />
            <span className="font-medium">S3 compatível (Backblaze B2, Wasabi, MinIO...)</span>
          </label>
          {destinoS3 && (
            <div className="grid gap-3 pl-8 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Endpoint</Label>
                <Input value={s3Endpoint} onChange={(e) => setS3Endpoint(e.target.value)} placeholder="https://s3.us-east-005.backblazeb2.com" />
              </div>
              <div className="space-y-2">
                <Label>Bucket</Label>
                <Input value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} placeholder="ouvidesk-backups" />
              </div>
              <div className="space-y-2">
                <Label>Região</Label>
                <Input value={s3Regiao} onChange={(e) => setS3Regiao(e.target.value)} placeholder="us-east-005" />
              </div>
              <div className="space-y-2">
                <Label>Prefixo (pasta dentro do bucket)</Label>
                <Input value={s3Prefixo} onChange={(e) => setS3Prefixo(e.target.value)} placeholder="ouvidesk-backups/" />
              </div>
              <div className="space-y-2">
                <Label>Chave de acesso</Label>
                <Input value={s3Access} onChange={(e) => setS3Access(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Chave secreta {(config?.tem_s3_secret && !s3SecretRemovido) ? "(salva — preencha só para trocar)" : ""}</Label>
                <div className="flex items-center gap-2">
                  <Input type="password" value={s3Secret} onChange={(e) => { setS3Secret(e.target.value); setS3SecretRemovido(false); }} autoComplete="new-password" placeholder={config?.tem_s3_secret ? "••••••••" : ""} />
                  {config?.tem_s3_secret && !s3SecretRemovido && !s3Secret && (
                    <Button variant="ghost" size="sm" onClick={() => setS3SecretRemovido(true)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={salvarConfig} disabled={salvando}>
            <RefreshCw className="h-4 w-4 mr-2" /> Salvar configuração
          </Button>
          <Button variant="outline" onClick={backupAgora} disabled={solicitando || emAndamento || !!config?.solicitacao_pendente}>
            <Play className="h-4 w-4 mr-2" />
            {emAndamento ? "Backup em andamento..." : config?.solicitacao_pendente ? "Backup solicitado — aguardando a VPS" : "Fazer backup agora"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A primeira execução após salvar acontece na próxima rodada da VPS, em até 15 minutos.
          O backup contém todos os dados do sistema (inclusive hashes de senha) — trate o destino como confidencial.
        </p>

        {runs && runs.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Histórico das execuções</h3>
            <div className="space-y-2">
              {runs.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
                  <Badge variant={r.status === "ok" ? "default" : r.status === "erro" ? "destructive" : "secondary"}>
                    {r.status === "ok" ? "OK" : r.status === "erro" ? "Erro" : "Em andamento"}
                  </Badge>
                  <span>{dataBR(r.finalizado_em ?? r.iniciado_em)}</span>
                  {r.arquivo && <span className="font-mono text-xs truncate max-w-64">{r.arquivo}</span>}
                  {r.tamanho_bytes != null && <span className="text-muted-foreground">{formatarTamanho(r.tamanho_bytes)}</span>}
                  {r.destinos.map((d) => (
                    <Badge key={d} variant="outline">{d === "vps" ? "VPS" : d === "drive" ? "Drive" : d === "s3" ? "S3" : d}</Badge>
                  ))}
                  {r.erro && <span className="w-full text-xs text-destructive">{r.erro}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
