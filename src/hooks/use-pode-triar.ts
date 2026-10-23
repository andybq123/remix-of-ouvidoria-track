import { useIsAdmin } from "@/hooks/use-is-admin";
import { usePodeEditar } from "@/hooks/use-pode-editar";

/** Triagem: administradores e usuários com "Pode modificar o sistema". Somente leitura não vê. */
export function usePodeTriar() {
  const isAdmin = useIsAdmin();
  const podeEditar = usePodeEditar();
  return isAdmin || podeEditar;
}
