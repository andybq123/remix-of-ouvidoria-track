import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { somenteSaude } from "@/lib/map-departments";

/** true quando o usuário está vinculado apenas à secretaria da Saúde. */
export function useSomenteSaude() {
  const { data = false } = useQuery({
    queryKey: ["somente-saude"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const email = (u.user?.email ?? "").toLowerCase();
      if (!email) return false;
      const { data, error } = await supabase
        .from("user_secretarias").select("secretarias(nome, sigla)").eq("email", email);
      if (error) throw error;
      return somenteSaude((data ?? []).map((r: any) => r.secretarias ?? {}));
    },
    staleTime: 60_000,
  });
  return data;
}
