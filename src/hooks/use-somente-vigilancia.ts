import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** true quando o usuário só tem áreas por local (ex.: só Vigilância Sanitária), sem secretaria inteira. */
export function useSomenteVigilancia() {
  const { data = false } = useQuery({
    queryKey: ["somente-vigilancia"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const email = (u.user?.email ?? "").toLowerCase();
      if (!email) return false;
      const [{ count: locais }, { count: secs }] = await Promise.all([
        supabase.from("user_locais").select("id", { count: "exact", head: true }).eq("email", email),
        supabase.from("user_secretarias").select("id", { count: "exact", head: true }).eq("email", email),
      ]);
      return (locais ?? 0) > 0 && (secs ?? 0) === 0;
    },
    staleTime: 60_000,
  });
  return data;
}
