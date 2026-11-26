import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Secretaria da Saúde — como a página /saude a encontra no banco.
 *
 * A padronização de siglas (migração 0040) renomeou "Saúde" para
 * "SMS - SECRETARIA DE SAÚDE" e preencheu a sigla. A página buscava
 * a secretaria pelo nome exato antigo ("Saúde"), então passou a não
 * achar nada e ficou vazia — os protocolos continuavam com a
 * secretaria certa e só apareciam na página geral de Protocolos.
 *
 * Busca pela sigla primeiro (padrão atual) e, se não achar, pelo
 * nome antigo (bases ainda sem a migração 0040).
 */

export type SecretariaSaude = { id: string; nome: string };

export async function buscarSecretariaSaude(
  client: SupabaseClient<Database>,
): Promise<SecretariaSaude | null> {
  const porSigla = await client
    .from("secretarias")
    .select("id,nome")
    .eq("sigla", "SMS")
    .maybeSingle();
  if (porSigla.data) return porSigla.data;
  const porNome = await client
    .from("secretarias")
    .select("id,nome")
    .eq("nome", "Saúde")
    .maybeSingle();
  return porNome.data ?? null;
}
