import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLicencaEstado } from "@/lib/licenca.functions";

export function useLicencaEstado() {
  const fn = useServerFn(getLicencaEstado);
  const { data } = useQuery({
    queryKey: ["licenca-estado"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return data ?? { bloqueado: false, motivo: null, verificado_em: null };
}

/** true = modo somente consulta: desabilite botões e formulários de edição. */
export function useLicencaBloqueada() {
  return useLicencaEstado().bloqueado;
}
