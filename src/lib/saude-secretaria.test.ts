import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buscarSecretariaSaude } from "./saude-secretaria";

/** Cliente falso: responde por sigla ou por nome, e registra as consultas. */
function clienteFake(respostas: Record<string, { id: string; nome: string } | null>) {
  const consultas: string[] = [];
  const client = {
    from: (_tabela: string) => ({
      select: (_cols: string) => ({
        eq: (coluna: string, valor: string) => ({
          maybeSingle: async () => {
            consultas.push(`${coluna}=${valor}`);
            return { data: respostas[`${coluna}=${valor}`] ?? null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
  return { consultas, client };
}

describe("buscarSecretariaSaude", () => {
  it("acha pela sigla SMS (nome atual pós-padronização)", async () => {
    const { client, consultas } = clienteFake({
      "sigla=SMS": { id: "8ee7bf01-4cde-494c-8e99-92d3ccabb0f5", nome: "SMS - SECRETARIA DE SAÚDE" },
    });
    const r = await buscarSecretariaSaude(client);
    expect(r?.id).toBe("8ee7bf01-4cde-494c-8e99-92d3ccabb0f5");
    expect(r?.nome).toBe("SMS - SECRETARIA DE SAÚDE");
    // Achou pela sigla: não precisa tentar o nome antigo.
    expect(consultas).toEqual(["sigla=SMS"]);
  });

  it("usa o nome antigo quando a sigla não está preenchida (base sem a migração 0040)", async () => {
    const { client, consultas } = clienteFake({
      "nome=Saúde": { id: "8ee7bf01-4cde-494c-8e99-92d3ccabb0f5", nome: "Saúde" },
    });
    const r = await buscarSecretariaSaude(client);
    expect(r?.nome).toBe("Saúde");
    expect(consultas).toEqual(["sigla=SMS", "nome=Saúde"]);
  });

  it("devolve null quando não há secretaria da Saúde", async () => {
    const { client } = clienteFake({});
    expect(await buscarSecretariaSaude(client)).toBeNull();
  });
});
