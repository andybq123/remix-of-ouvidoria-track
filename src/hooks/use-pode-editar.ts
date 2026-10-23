import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Usuário de leitura com "Pode modificar" marcado (não inclui admin). */
export function usePodeEditar() {
  const { data = false } = useQuery({
    queryKey: ["pode-editar"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email?.toLowerCase();
      if (!email) return false;
      const { data } = await supabase.from("allowed_emails").select("pode_editar").eq("email", email).maybeSingle();
      return !!data?.pode_editar;
    },
    staleTime: 60_000,
  });
  return data;
}
