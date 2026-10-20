import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { invalidateProtocoloCaches } from "@/hooks/use-protocolos-realtime";
import { link1docParaSalvar } from "@/lib/url-1doc";

export function ProtocoloOnedocLink({ protocoloId, url, disabled }: {
  protocoloId: string; url: string | null; disabled: boolean;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(url ?? "");
  useEffect(() => setValue(url ?? ""), [protocoloId, url]);

  const salvar = useMutation({
    mutationFn: async () => {
      const novoLink = link1docParaSalvar(value);
      const { data, error } = await supabase.from("protocolos")
        .update({ url: novoLink }).eq("id", protocoloId).select("id, url").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["protocolo", protocoloId], (old: Record<string, unknown> | null | undefined) =>
        old ? { ...old, url: data.url } : old);
      invalidateProtocoloCaches(qc);
      qc.invalidateQueries({ queryKey: ["historico", protocoloId] });
      toast.success(data.url ? "Link do 1Doc salvo" : "Link do 1Doc removido");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar o link"),
  });

  return (
    <div className="space-y-2">
      <Label htmlFor={`onedoc-link-${protocoloId}`}>Link do 1Doc</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={`onedoc-link-${protocoloId}`} type="url" value={value}
          placeholder="https://brusque.1doc.com.br/…" className="min-w-0 flex-1"
          disabled={disabled || salvar.isPending} onChange={(event) => setValue(event.target.value)} />
        <Button type="button" variant="outline" disabled={disabled || salvar.isPending || value === (url ?? "")}
          onClick={() => salvar.mutate()}>
          <Save className="mr-1.5 h-4 w-4" />{salvar.isPending ? "Salvando…" : "Salvar link"}
        </Button>
      </div>
    </div>
  );
}