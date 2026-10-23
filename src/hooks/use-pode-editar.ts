import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Usuário de leitura com "Pode modificar" marcado (não inclui admin). */
export function usePodeEditar() {
  const { data = false } = useQuery({
    queryKey: ["pode-editar"],
    queryFn: async () => {
      const { data } = await supabase.rpc("posso_editar");
      return !!data;
    },
    staleTime: 60_000,
  });
  return data;
}
