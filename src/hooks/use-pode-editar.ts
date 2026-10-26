import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLicencaBloqueada } from "@/hooks/use-licenca-bloqueada";

/** Usuário de leitura com "Pode modificar" marcado (não inclui admin). Licença bloqueada = false. */
export function usePodeEditar() {
  const bloqueada = useLicencaBloqueada();
  const { data = false } = useQuery({
    queryKey: ["pode-editar"],
    queryFn: async () => {
      const { data } = await supabase.rpc("posso_editar");
      return !!data;
    },
    staleTime: 60_000,
  });
  return data && !bloqueada;
}
