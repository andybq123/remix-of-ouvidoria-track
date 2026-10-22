import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Invalida em lote os caches ligados a protocolos (dashboard, listas,
 * relatórios, triagem, atrasados, detalhe). Reutilizado no dialog e no hook.
 */
export function invalidateProtocoloCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey?.[0];
      if (typeof k !== "string") return false;
      return (
        k === "protocolos" ||
        k.startsWith("protocolos-") ||
        k.startsWith("relatorio") ||
        k === "triagem-stats" ||
        k === "triagem-pendentes-count" ||
        k === "atrasados" ||
        k.startsWith("dashboard") ||
        k === "protocolo" || k === "historico"
      );
    },
  });
}

/**
 * Assina Realtime na tabela `protocolos` e revalida os caches ligados
 * quando qualquer usuário insere/atualiza/remove um protocolo.
 * Deve ser montado uma única vez no layout autenticado.
 *
 * Retorna `lastSyncAt` — timestamp da última revalidação (útil para exibir
 * um pequeno indicador "Atualizado agora" na dashboard).
 */
export function useProtocolosRealtime() {
  const qc = useQueryClient();
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const schedule = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        invalidateProtocoloCaches(qc);
        setLastSyncAt(Date.now());
      }, 300);
    };

    const channel = supabase
      .channel("protocolos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "protocolos" },
        () => schedule(),
      )
      .subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return { lastSyncAt };
}

/**
 * Pequeno helper para exibir um badge "Atualizado agora" que some após N ms.
 */
export function useRecentSyncFlag(lastSyncAt: number | null, windowMs = 2500) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!lastSyncAt) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), windowMs);
    return () => window.clearTimeout(t);
  }, [lastSyncAt, windowMs]);
  return visible;
}