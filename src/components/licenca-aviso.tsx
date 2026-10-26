import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useLicencaEstado } from "@/hooks/use-licenca-bloqueada";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TEXTO = "O sistema está em modo somente consulta. Entre em contato com o fornecedor da licença.";

/** Só administradores veem o aviso; usuários comuns apenas têm as edições desabilitadas. */
export function LicencaAviso() {
  const isAdmin = useIsAdmin();
  const { bloqueado, motivo, verificado_em } = useLicencaEstado();
  const [fechado, setFechado] = useState(() =>
    typeof window !== "undefined" && sessionStorage.getItem("licenca-aviso-fechado") === "1");
  if (!isAdmin || !bloqueado) return null;
  const quando = verificado_em ? new Date(verificado_em).toLocaleString("pt-BR") : "—";
  function fechar() {
    sessionStorage.setItem("licenca-aviso-fechado", "1");
    setFechado(true);
  }
  return (
    <>
      <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground text-sm px-4 py-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="font-medium">Licença bloqueada — somente consulta.</span>
        {motivo && <span className="opacity-90 truncate">{motivo}</span>}
      </div>
      <AlertDialog open={!fechado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Sistema bloqueado pela licença
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>{TEXTO}</p>
                <p><strong>Motivo:</strong> {motivo || "não informado"}</p>
                <p><strong>Última verificação:</strong> {quando}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={fechar}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
