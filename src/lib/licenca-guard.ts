import { MENSAGEM_BLOQUEIO } from "./licenca-estado";

type Rpc = { rpc: (fn: "licenca_bloqueada") => PromiseLike<{ data: unknown; error: unknown }> };

/** Lança erro quando a licença está bloqueada. Falha de leitura não bloqueia (o banco também recusa). */
export async function assertLicencaLiberada(client: Rpc): Promise<void> {
  const { data } = await client.rpc("licenca_bloqueada");
  if (data === true) throw new Error(MENSAGEM_BLOQUEIO);
}

export async function licencaBloqueadaAdmin(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("licenca_bloqueada");
  return data === true;
}

export function respostaBloqueada(): Response {
  return Response.json({ ok: false, bloqueado: true, error: MENSAGEM_BLOQUEIO }, { status: 423 });
}
