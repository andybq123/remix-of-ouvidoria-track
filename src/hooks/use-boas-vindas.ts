import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VIDEO_POR_ESTADO } from "@/lib/ouvidorizinho-animacao";

/**
 * Vídeo do Ouvidorzinho atendendo o telefone — miniatura do card de
 * boas-vindas. O arquivo é o asset binário que já existe em public/
 * (o nome do arquivo mantém o nome antigo; só o nome exibido mudou).
 */
export const VIDEO_BOAS_VINDAS = VIDEO_POR_ESTADO.telefone;

/**
 * Decide se o card de boas-vindas aparece, a partir do retorno da RPC
 * boas_vindas_visto(). Só o `false` estrito mostra o card (fail-closed:
 * sem a função (antes da migration 0039), erro de leitura ou já visto,
 * o card não aparece — nunca insiste).
 */
export function deveMostrarBoasVindas(rpcData: unknown): boolean {
  return rpcData === false;
}

/** Card de boas-vindas do primeiro login: aparece só quando ainda não visto. */
export function useBoasVindas() {
  const { data: visto = true } = useQuery({
    queryKey: ["boas-vindas-visto"],
    queryFn: async () => {
      const { data } = await supabase.rpc("boas_vindas_visto");
      return !!data;
    },
    staleTime: 60_000,
  });
  return { mostrar: deveMostrarBoasVindas(visto), visto };
}

/**
 * Marca o card como visto no servidor (RPC marcar_boas_vindas_visto).
 * Nunca rejeita: se a gravação falhar, o card some na sessão mesmo
 * assim e não insiste no próximo login.
 */
export async function dispensarBoasVindas(): Promise<void> {
  try {
    await supabase.rpc("marcar_boas_vindas_visto");
  } catch {
    // Sem insistir: o card some na sessão mesmo sem gravar no servidor.
  }
}
