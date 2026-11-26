import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DatabaseBackup, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBackupAlerta } from "@/hooks/use-backup-alerta";

/**
 * Alerta semanal de backup — aparece logo após o login, só para
 * administradores, quando não há backup com sucesso nos últimos 7 dias
 * (ou nunca houve) e o alerta não foi exibido nos últimos 7 dias.
 *
 * Renderizado no layout autenticado (toda página logada), como o aviso
 * de licença: uma faixa fixa no topo e um diálogo na primeira exibição
 * da sessão. Dispensar ("Entendi" ou o X da faixa) registra a exibição
 * no servidor, então o alerta só volta depois de 7 dias.
 */
export function BackupAlertaCard() {
  const { mostrar, motivo, ultimoOk, diasSemBackup, dispensar } = useBackupAlerta();
  const [dialogoFechado, setDialogoFechado] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("backup-alerta-fechado") === "1");
  const [dispensado, setDispensado] = useState(false);

  if (!mostrar || dispensado) return null;

  const mensagem =
    motivo === "nunca"
      ? "O backup automático nunca foi executado."
      : `O último backup com sucesso foi há ${diasSemBackup ?? "?"} dias.`;
  const ultimo = ultimoOk ? new Date(ultimoOk).toLocaleString("pt-BR") : "—";

  async function fechar() {
    sessionStorage.setItem("backup-alerta-fechado", "1");
    setDialogoFechado(true);
    setDispensado(true);
    await dispensar();
  }

  return (
    <>
      <div className="sticky top-0 z-50 bg-amber-600 text-white text-sm px-4 py-2 flex items-center gap-2">
        <DatabaseBackup className="h-4 w-4 shrink-0" />
        <span className="font-medium">Backup desatualizado.</span>
        <span className="opacity-90 truncate hidden sm:inline">{mensagem}</span>
        <Link to="/backup" className="ml-auto underline shrink-0">
          Abrir backup
        </Link>
        <button
          type="button"
          onClick={() => void fechar()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/20"
          title="Dispensar alerta por 7 dias"
          aria-label="Dispensar alerta de backup"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <AlertDialog open={!dialogoFechado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <DatabaseBackup className="h-5 w-5" /> Backup automático desatualizado
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{mensagem}</p>
                <p><strong>Último backup com sucesso:</strong> {ultimo}</p>
                <p>
                  Sem um backup recente, uma falha na VPS pode perder os dados
                  das ouvidorias. Confira a rotina em Backup e, se preciso,
                  faça um backup agora.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction asChild>
              <Link to="/backup" onClick={() => void fechar()}>
                Abrir backup
              </Link>
            </AlertDialogAction>
            <Button variant="outline" onClick={() => void fechar()}>
              Entendi
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
