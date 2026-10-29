import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Request-local client. Only pass the userId supplied by validated auth middleware. */
export function adminComAutor(userId: string) {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error("Configuração do serviço indisponível");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-ouvidesk-autor", userId);
        headers.set("apikey", key);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}