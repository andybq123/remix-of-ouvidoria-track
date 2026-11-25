import { mapDepartmentOf } from "@/lib/map-departments";

import type { MuseTriarProtocoloBody } from "@/lib/muse-api.server";

/**
 * Triagem de protocolo pela integração Muse.
 *
 * Replica a transição do "Concluir triagem" do painel
 * (protocolo-detail-dialog.tsx, handleConcluirTriagem): secretaria
 * obrigatória, descrição (breve relato) com no mínimo 5 caracteres,
 * e-SIC não é triado, Obras exige endereço + ponto no mapa. Não muda
 * status (o protocolo em triagem já está "em andamento") e nunca
 * conclui, encerra ou arquiva: triagem é atribuição e só limpa
 * triagem_pendente, via RPCs aplicar_triagem_muse /
 * reservar_triagem_muse / liberar_triagem_muse (migração 0037),
 * auditadas pelo trigger log_protocolo_changes com autor "Muse".
 *
 * O fluxo do Muse é em dois passos, para a UI mostrar o estado:
 * 1. iniciarTriagemMuse — reserva o protocolo (trava de 10 min, mesmo
 *    TTL do painel); a lista e o detalhe passam a mostrar
 *    "Triando com o Ouvidorizinho".
 * 2. concluirTriagemMuse — aplica secretaria/local/descrição (e
 *    endereço quando houver) e limpa a triagem; o detalhe mostra o
 *    card "Triado pelo Ouvidorizinho" e o Histórico registra o autor.
 * cancelarTriagemMuse libera a reserva quando o Muse desiste.
 */

// Cliente Supabase (admin) passado pelos chamadores; o builder encadeado
// (select/eq/maybeSingle/rpc) não tem tipo estrutural simples neste repo.
type SupabaseAdminLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabela: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): any;
};

export type ProtocoloTriagemRow = {
  id: string;
  numero: string;
  tipo: string | null;
  status: string | null;
  triagem_pendente: boolean | null;
  triagem_origem: string | null;
  triagem_lock_em: string | null;
  triagem_lock_por: string | null;
  triagem_concluida_em: string | null;
  secretaria_id: string | null;
  local_id: string | null;
};

const SELECT_TRIAGEM =
  "id,numero,tipo,status,triagem_pendente,triagem_origem,triagem_lock_em,triagem_lock_por,triagem_concluida_em,secretaria_id,local_id";

/** Linha mínima do protocolo para decidir a triagem. Null quando não existe. */
export async function buscarProtocoloTriagem(
  client: SupabaseAdminLike,
  id: string,
): Promise<ProtocoloTriagemRow | null> {
  const { data, error } = await client
    .from("protocolos")
    .select(SELECT_TRIAGEM)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return (data as ProtocoloTriagemRow | null) ?? null;
}

export type SecretariaTriagem = {
  id: string;
  nome: string | null;
  sigla: string | null;
};

/** Secretaria destino, com nome/sigla para a regra de Obras. Null quando não existe. */
export async function buscarSecretariaTriagem(
  client: SupabaseAdminLike,
  secretariaId: string,
): Promise<SecretariaTriagem | null> {
  const { data, error } = await client
    .from("secretarias")
    .select("id,nome,sigla")
    .eq("id", secretariaId)
    .maybeSingle();

  if (error) throw error;

  return (data as SecretariaTriagem | null) ?? null;
}

/**
 * Obras exige endereço + ponto no mapa, como o painel (isObras em
 * protocolo-detail-dialog.tsx via mapDepartmentOf). Pura — é o que os
 * testes cobrem sem banco.
 */
export function exigeEnderecoObras(secretaria: {
  nome?: string | null;
  sigla?: string | null;
}): boolean {
  return mapDepartmentOf(secretaria) === "obras";
}

export type TriagemMuseIniciada = {
  id: string;
  numero: string;
  triandoPor: "Muse";
  lockEm: string | null;
};

/**
 * Reserva o protocolo para o Muse triar (trava de 10 min). Idempotente:
 * chamar de novo com a trava do Muse ativa só renova a trava.
 */
export async function iniciarTriagemMuse(
  client: SupabaseAdminLike,
  id: string,
): Promise<TriagemMuseIniciada> {
  const atual = await buscarProtocoloTriagem(client, id);

  if (!atual) throw new Error("Protocolo não encontrado");
  if (atual.tipo === "esic") throw new Error("e-SIC não é triado pelo Muse");
  if (!atual.triagem_pendente) throw new Error("Protocolo já triado");

  const { data, error } = await client.rpc("reservar_triagem_muse", { p_id: id });

  if (error) throw error;

  const r = (data ?? {}) as {
    ok?: boolean;
    motivo?: string;
    por?: string | null;
    em?: string | null;
    lock_em?: string | null;
  };

  if (r.ok) {
    return {
      id: atual.id,
      numero: atual.numero,
      triandoPor: "Muse",
      lockEm: r.lock_em ?? null,
    };
  }
  if (r.motivo === "concluida") {
    throw new Error(`Protocolo já triado por ${r.por ?? "outro usuário"}`);
  }
  if (r.motivo === "reservada") {
    throw new Error(`Protocolo em triagem por ${r.por ?? "outro usuário"}`);
  }
  throw new Error("Não foi possível reservar a triagem");
}

export type TriagemMuseConcluida = {
  id: string;
  numero: string;
  secretaria: string;
  secretariaId: string;
  local: string | null;
  localId: string | null;
  descricao: string;
  triadoPor: "Muse";
  triadoEm: string | null;
  triagemPendente: boolean;
};

/**
 * Conclui a triagem: aplica secretaria/local/descrição (e endereço/
 * ponto quando informados) e limpa triagem_pendente via RPC
 * aplicar_triagem_muse. Valida antes no servidor para devolver erros
 * claros; a RPC valida de novo no banco (defesa em profundidade).
 */
export async function concluirTriagemMuse(
  client: SupabaseAdminLike,
  id: string,
  body: MuseTriarProtocoloBody,
): Promise<TriagemMuseConcluida> {
  const atual = await buscarProtocoloTriagem(client, id);

  if (!atual) throw new Error("Protocolo não encontrado");
  if (atual.tipo === "esic") throw new Error("e-SIC não é triado pelo Muse");
  if (!atual.triagem_pendente) throw new Error("Protocolo já triado");

  if (!body.secretaria_id) throw new Error("Defina a secretaria antes de concluir a triagem.");

  const relato = (body.descricao ?? "").trim();
  if (relato.length < 5) {
    throw new Error("Informe uma descrição (breve relato) antes de concluir a triagem.");
  }

  const secretaria = await buscarSecretariaTriagem(client, body.secretaria_id);
  if (!secretaria) throw new Error("Secretaria não encontrada");

  let localNome: string | null = null;
  if (body.local_id !== undefined && body.local_id !== null) {
    const { data: local, error: localError } = await client
      .from("locais")
      .select("id,nome,secretaria_id")
      .eq("id", body.local_id)
      .maybeSingle();
    if (localError) throw localError;
    if (!local) throw new Error("Local não encontrado");
    if ((local as { secretaria_id?: string | null }).secretaria_id !== body.secretaria_id) {
      throw new Error("Local não pertence à secretaria");
    }
    localNome = (local as { nome?: string | null }).nome ?? null;
  }

  // Obras exige endereço + ponto no mapa, como o painel.
  if (exigeEnderecoObras(secretaria)) {
    if (!body.endereco?.trim() || body.latitude == null || body.longitude == null) {
      throw new Error("Endereço e ponto no mapa são obrigatórios para Obras");
    }
  }

  const { error } = await client.rpc("aplicar_triagem_muse", {
    p_id: id,
    p_secretaria: body.secretaria_id,
    p_local: body.local_id ?? null,
    p_descricao: relato,
    p_endereco: body.endereco?.trim() ? body.endereco.trim() : null,
    p_latitude: body.latitude ?? null,
    p_longitude: body.longitude ?? null,
  });

  if (error) throw error;

  const final = await buscarProtocoloTriagem(client, id);
  if (!final) throw new Error("Protocolo não encontrado");

  return {
    id: final.id,
    numero: final.numero,
    secretaria: secretaria.nome ?? "Sem secretaria",
    secretariaId: body.secretaria_id,
    local: localNome,
    localId: body.local_id ?? null,
    descricao: relato,
    triadoPor: "Muse",
    triadoEm: final.triagem_concluida_em,
    triagemPendente: !!final.triagem_pendente,
  };
}

export type TriagemMuseCancelada = {
  id: string;
  numero: string;
  cancelado: true;
};

/** Libera a reserva do Muse quando ele desiste da triagem. */
export async function cancelarTriagemMuse(
  client: SupabaseAdminLike,
  id: string,
): Promise<TriagemMuseCancelada> {
  const atual = await buscarProtocoloTriagem(client, id);

  if (!atual) throw new Error("Protocolo não encontrado");

  const { data, error } = await client.rpc("liberar_triagem_muse", { p_id: id });

  if (error) throw error;

  const r = (data ?? {}) as { ok?: boolean; motivo?: string };

  if (r.ok) return { id: atual.id, numero: atual.numero, cancelado: true as const };

  throw new Error("Nenhuma triagem do Muse em andamento");
}
