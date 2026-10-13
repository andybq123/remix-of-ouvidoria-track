// Verifica no servidor, com a sessão do próprio usuário, se ele é administrador.
export async function exigirAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || data !== true) throw new Error("Acesso negado");
}
