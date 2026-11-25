import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Decide se o Ouvidorzinho aparece para o usuário, a partir do retorno
 * da RPC posso_usar_ouvidorzinho(). Só o `false` estrito desabilita
 * (fail-open: sem linha em allowed_emails, sem a função (antes da
 * migration 0039) ou erro de leitura, o assistente continua aparecendo —
 * ninguém perde o acesso por falha de leitura).
 */
export function ouvidorzinhoHabilitadoParaUsuario(rpcData: unknown): boolean {
  return rpcData !== false;
}

/** Ouvidorzinho habilitado para o usuário logado (padrão: habilitado). */
export function useOuvidorzinhoHabilitado() {
  const { data = true } = useQuery({
    queryKey: ["ouvidorzinho-habilitado"],
    queryFn: async () => {
      const { data } = await supabase.rpc("posso_usar_ouvidorzinho");
      return ouvidorzinhoHabilitadoParaUsuario(data);
    },
    staleTime: 60_000,
  });
  return data;
}
