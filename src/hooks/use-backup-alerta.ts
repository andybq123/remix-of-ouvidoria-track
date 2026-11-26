import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  backupAlertaLogin,
  registrarBackupAlertaVisto,
} from "@/lib/backup-auto.functions";

/**
 * Alerta semanal de backup pós-login (só administradores).
 *
 * O servidor decide se mostra: sem backup com sucesso nos últimos 7
 * dias (ou nunca houve) E sem alerta exibido ao admin nos últimos 7
 * dias. Fail-closed: sem resposta, erro ou não-admin, não mostra.
 * Quando o card aparece, registra a exibição no servidor para não
 * repetir dentro da janela de 7 dias.
 */
export function useBackupAlerta() {
  const fn = useServerFn(backupAlertaLogin);
  const registrarFn = useServerFn(registrarBackupAlertaVisto);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["backup-alerta-login"],
    queryFn: () => fn(),
  });

  // Marca o alerta como visto no servidor. Nunca rejeita: se a gravação
  // falhar, o card some na sessão mesmo assim e não insiste.
  const dispensar = useCallback(async () => {
    try {
      await registrarFn();
    } catch {
      // Sem insistir.
    }
    await qc.invalidateQueries({ queryKey: ["backup-alerta-login"] });
  }, [registrarFn, qc]);

  return {
    mostrar: data?.mostrar ?? false,
    motivo: data?.motivo ?? null,
    ultimoOk: data?.ultimo_ok ?? null,
    diasSemBackup: data?.dias_sem_backup ?? null,
    dispensar,
  };
}
