import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from "@/integrations/supabase/client";
import { PROTOCOLOS_PAGE_SIZE, protocolosPaginaOptions, validarFiltrosProtocolos } from "./protocolos-listagem";

describe("listagem paginada de protocolos", () => {
  it("usa páginas de 50 registros", () => {
    expect(PROTOCOLOS_PAGE_SIZE).toBe(50);
  });
  it("envia a página e todos os filtros para a busca autenticada", async () => {
    const filtros = validarFiltrosProtocolos({ pagina: 2, mes: "all", busca: "saúde rua", status: "aberto" });
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { items: [], pagina: 2, total: 65 }, error: null } as never);
    expect(await protocolosPaginaOptions(filtros, false).queryFn()).toEqual({ items: [], pagina: 2, total: 65 });
    expect(supabase.rpc).toHaveBeenCalledWith("listar_protocolos_pagina", { p_filtros: { ...filtros, somenteVigilancia: false } });
  });
  it("recusa páginas inválidas na URL", () => {
    for (const pagina of [-1, 0, 1.5, "abc", Infinity]) {
      expect(validarFiltrosProtocolos({ pagina }).pagina).toBe(1);
    }
    expect(validarFiltrosProtocolos({ pagina: "3" }).pagina).toBe(3);
  });
  it("não converte falha da consulta em lista vazia", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: "falha de conexão" } } as never);
    await expect(protocolosPaginaOptions(validarFiltrosProtocolos({}), false).queryFn()).rejects.toEqual({ message: "falha de conexão" });
  });
});