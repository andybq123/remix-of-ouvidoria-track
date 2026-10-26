import type { BackupTabela } from "./backup-config";
import type { Json } from "@/integrations/supabase/types";
import { validarTabelaImportacao } from "./import-maintenance.server";

/** Chamado pelo handler autenticado/admin, nunca diretamente pelo cliente. */
export async function importarTabelaValidada(tabela: BackupTabela, rows: Json[]) {
  validarTabelaImportacao(tabela);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("backup_importar", {
    p_tabela: tabela,
    p_rows: rows,
  });
  if (error) throw new Error(`${tabela}: ${error.message}`);
  // Backup de outra instalação pode citar usuários que não existem aqui
  // (ex.: responsável da conta de e-mail): esses vínculos ficam vazios.
  const { error: errLimpeza } = await (supabaseAdmin as any).rpc(
    "limpar_vinculos_usuarios_inexistentes",
  );
  if (errLimpeza) throw new Error(`${tabela}: ${errLimpeza.message}`);
  return { gravados: Number(data ?? 0) };
}
