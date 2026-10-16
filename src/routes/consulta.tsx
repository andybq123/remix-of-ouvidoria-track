import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Printer, MapPin, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import brusqueBrasao from "@/assets/brusque-brasao.png";
import { gerarProtocoloPdf, type ProtocoloPdfData } from "@/lib/protocolo-pdf";

const searchSchema = z.object({
  numero: z.string().optional(),
  hash: z.string().optional(),
});

export const Route = createFileRoute("/consulta")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { property: "og:title", content: "Consulta de protocolo | OuviDesk" },
      { property: "og:description", content: "Consulta de protocolo da Ouvidoria Municipal de Brusque." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Consulta de Protocolo | OuviDesk" },
      { name: "description", content: "Consulte o andamento da sua manifestação na Ouvidoria Municipal de Brusque informando o número do protocolo e o código de consulta." },
    ],
  }),
  component: ConsultaPage,
});

type ProtocoloPublico = {
  id: string;
  numero: string;
  tipo: string;
  categoria: string;
  status: string;
  assunto: string | null;
  descricao: string | null;
  solicitante: string | null;
  sigilo: string | null;
  contato_solicitante: string | null;
  endereco: string | null;
  latitude: number | null;
  longitude: number | null;
  origem: string | null;
  data_abertura: string | null;
  data_prorrogacao: string | null;
  data_conclusao: string | null;
  prorrogado: boolean;
  created_at: string;
  updated_at: string;
  secretaria_nome: string | null;
  local_nome: string | null;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  concluido: { label: "Concluído", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  cancelado: { label: "Cancelado", cls: "bg-red-100 text-red-800 border-red-300" },
  arquivado: { label: "Arquivado", cls: "bg-gray-100 text-gray-800 border-gray-300" },
};

const CATEGORIA_LABELS: Record<string, string> = {
  reclamacao: "Reclamação",
  denuncia: "Denúncia",
  elogio: "Elogio",
  sugestao: "Sugestão",
  solicitacao: "Solicitação",
  informacao: "Pedido de informação",
  pedido_informacao: "Pedido de informação",
  esic: "Pedido e-SIC",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    const dt = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
    return dt.toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-BR"); } catch { return d; }
}

function ConsultaPage() {
  const search = Route.useSearch();
  const [numero, setNumero] = useState(search.numero ?? "");
  const [hash, setHash] = useState(search.hash ?? "");
  const [resultado, setResultado] = useState<ProtocoloPublico | null>(null);

  const consultar = useMutation({
    mutationFn: async () => {
      if (!numero.trim() || !hash.trim()) {
        throw new Error("Informe o número do protocolo e o código de consulta.");
      }
      const { data, error } = await supabase.rpc("consultar_protocolo_publico", {
        p_numero: numero.trim(),
        p_hash: hash.trim().toUpperCase(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("Nenhum protocolo encontrado. Confira o número e o código.");
      return row as ProtocoloPublico;
    },
    onSuccess: (r) => setResultado(r),
    onError: (e: any) => {
      setResultado(null);
      toast.error(e?.message ?? "Falha ao consultar.");
    },
  });

  // Auto-consulta se vier por link com dados
  if (search.numero && search.hash && !resultado && !consultar.isPending && !consultar.isError) {
    consultar.mutate();
  }

  const pdfData = (r: ProtocoloPublico): ProtocoloPdfData => ({
    numero: r.numero,
    hash: hash.trim().toUpperCase(),
    categoria: r.tipo === "esic" ? "Pedido e-SIC" : CATEGORIA_LABELS[r.categoria] ?? r.categoria,
    assunto: r.assunto,
    descricao: r.descricao,
    solicitante: r.solicitante,
    sigilo: r.sigilo,
    contato: r.contato_solicitante,
    endereco: r.endereco,
    secretaria: r.secretaria_nome,
    local: r.local_nome,
    data_abertura: r.data_abertura,
    status: STATUS_LABELS[r.status]?.label ?? r.status,
    origem: r.origem,
  });

  const baixarPdf = () => {
    if (!resultado) return;
    gerarProtocoloPdf(pdfData(resultado)).save(`ouvidoria-${resultado.numero}.pdf`);
  };
  const imprimirPdf = () => {
    if (!resultado) return;
    const doc = gerarProtocoloPdf(pdfData(resultado));
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  };

  const statusInfo = resultado ? STATUS_LABELS[resultado.status] ?? { label: resultado.status, cls: "bg-gray-100 text-gray-800 border-gray-300" } : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-background to-red-50 dark:from-emerald-950/20 dark:via-background dark:to-red-950/20">
      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-white to-red-600" />
      <header className="border-b bg-background/90 backdrop-blur shadow-sm">
        <div className="mx-auto max-w-3xl px-4 py-5 flex items-center gap-4">
          <img src={brusqueBrasao} alt="Brasão de Brusque - SC" className="h-16 w-16 object-contain shrink-0 drop-shadow-sm" width={64} height={64} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-emerald-700 dark:text-emerald-400 font-semibold">Prefeitura Municipal de Brusque · SC</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Consulta de Protocolo</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Acompanhe o andamento da sua manifestação.</p>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/inicio"><ArrowLeft className="h-4 w-4 mr-1" /> Início</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/ouvidoria">Nova manifestação</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Localizar manifestação
            </CardTitle>
            <CardDescription>Informe o número do protocolo e o código de consulta gerado no registro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(e) => { e.preventDefault(); consultar.mutate(); }}
              className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
            >
              <div className="grid gap-2">
                <Label>Número do protocolo *</Label>
                <Input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="Ex.: OUV-2026-000123"
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label>Código de consulta *</Label>
                <Input
                  value={hash}
                  onChange={(e) => setHash(e.target.value.toUpperCase())}
                  placeholder="XXXXX-XXXXX"
                  className="font-mono tracking-wider"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={consultar.isPending}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white w-full md:w-auto"
                >
                  {consultar.isPending ? (
                    <><span className="mr-2 inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Consultando…</>
                  ) : (
                    <><Search className="h-4 w-4 mr-1" /> Consultar</>
                  )}
                </Button>
              </div>
            </form>
            {consultar.isError && (
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-800 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{(consultar.error as Error)?.message ?? "Não foi possível localizar a manifestação."}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {resultado && statusInfo && (
          <Card className="border-2 border-emerald-600/30">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">
                    Protocolo <span className="font-mono">{resultado.numero}</span>
                  </CardTitle>
                  <CardDescription>{resultado.assunto ?? "—"}</CardDescription>
                </div>
                <Badge className={`${statusInfo.cls} border`}>{statusInfo.label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <Info label="Tipo de solicitação" value={resultado.tipo === "esic" ? "Pedido e-SIC" : CATEGORIA_LABELS[resultado.categoria] ?? resultado.categoria} />
                <Info label="Data de abertura" value={fmtDate(resultado.data_abertura)} />
                <Info label="Sigilo" value={resultado.sigilo ?? "—"} />
                <Info label="Origem" value={resultado.origem ?? "—"} />
                <Info label="Secretaria" value={resultado.secretaria_nome ?? "—"} />
                <Info label="Unidade / Local" value={resultado.local_nome ?? "—"} />
                <Info label="Solicitante" value={resultado.solicitante ?? "—"} />
                <Info label="Contato" value={resultado.contato_solicitante ?? "—"} />
                {resultado.prorrogado && (
                  <Info label="Prorrogado até" value={fmtDate(resultado.data_prorrogacao)} />
                )}
                {resultado.data_conclusao && (
                  <Info label="Concluído em" value={fmtDate(resultado.data_conclusao)} />
                )}
                <Info label="Última atualização" value={fmtDateTime(resultado.updated_at)} />
              </div>

              {resultado.endereco && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Endereço</p>
                  <p className="text-sm flex items-start gap-1">
                    <MapPin className="h-4 w-4 mt-0.5 text-emerald-700 shrink-0" />
                    <span>{resultado.endereco}</span>
                  </p>
                  {resultado.latitude && resultado.longitude && (
                    <p className="text-[11px] text-muted-foreground mt-1 ml-5">
                      📍 {resultado.latitude.toFixed(5)}, {resultado.longitude.toFixed(5)}
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Descrição</p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                  {resultado.descricao ?? "—"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button variant="outline" onClick={baixarPdf}>
                  <Download className="h-4 w-4 mr-1" /> Baixar PDF
                </Button>
                <Button variant="outline" onClick={imprimirPdf}>
                  <Printer className="h-4 w-4 mr-1" /> Imprimir
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="border-t bg-background/60">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-[11px] text-muted-foreground">
          Prefeitura Municipal de Brusque — Santa Catarina
        </div>
      </footer>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
