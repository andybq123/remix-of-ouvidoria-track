import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORIAS, type CategoriaProtocolo, situacaoProtocolo, formatDate, categoriaLabel, categoriaDoProtocolo, PRAZOS, type TipoProtocolo } from "@/lib/prazo";
import { Download, BarChart3, ChevronRight, FileText, Search, X } from "lucide-react";
import * as XLSX from "xlsx";
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAllPaginated } from "@/lib/fetch-all";
import { sortProtocolosPorNumero } from "@/lib/sort-protocolos";
import { useServerFn } from "@tanstack/react-start";
import { gerarRelatorioIA } from "@/lib/relatorio-ia.functions";
import { buildProtocolosAntigos, isAntigo, isAntigoAtrasada } from "@/lib/protocolos-antigos-merge";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/relatorios/")({
  head: () => ({ meta: [
    { title: "Relatórios gerenciais | Controle SETA" },
    { name: "description", content: "Relatórios gerenciais no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:title", content: "Relatórios gerenciais | Controle SETA" },
    { property: "og:description", content: "Relatórios gerenciais no sistema de gestão da Ouvidoria Municipal de Brusque." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RelatoriosPage,
});

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function RelatoriosPage() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(String(currentYear));
  const [mes, setMes] = useState<string>("all");
  const [q, setQ] = useState("");
  const [fCategoria, setFCategoria] = useState<string>("all");
  const [fTipo, setFTipo] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fSecretaria, setFSecretaria] = useState<string>("all");

  const { data: userInfo } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return null;
      const { data: p } = await supabase.from("profiles").select("nome,email").eq("id", data.user.id).maybeSingle();
      return { id: data.user.id, email: data.user.email, nome: p?.nome ?? data.user.email };
    },
  });

  const { data: protocolos = [] } = useQuery({
    queryKey: ["protocolos"],
    queryFn: () =>
      fetchAllPaginated((from, to) =>
        supabase
          .from("protocolos")
          .select("*, secretarias(nome)")
          .order("data_abertura", { ascending: false })
          .range(from, to),
      ),
  });

  const { data: secretarias = [] } = useQuery({
    queryKey: ["secretarias"],
    queryFn: async () => (await supabase.from("secretarias").select("*").order("nome")).data ?? [],
  });

  const { data: locais = [] } = useQuery({
    queryKey: ["locais-all"],
    queryFn: async () => (await supabase.from("locais").select("id, nome, secretaria_id").order("nome")).data ?? [],
  });

  // Mescla protocolos antigos (planilhas históricas) ao dataset dos relatórios.
  const protocolosComAntigos = useMemo(() => {
    const antigos = buildProtocolosAntigos(
      (secretarias as any[]).map((s) => ({ id: s.id, nome: s.nome })),
    );
    return [...(protocolos as any[]), ...antigos].sort(sortProtocolosPorNumero);
  }, [protocolos, secretarias]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    protocolosComAntigos.forEach(p => set.add(p.data_abertura.slice(0, 4)));
    set.add(String(currentYear));
    return Array.from(set).sort().reverse();
  }, [protocolosComAntigos, currentYear]);

  const matchesFilter = (p: any) => {
    if (fCategoria !== "all" && categoriaDoProtocolo(p.tipo, p.categoria) !== fCategoria) return false;
    if (fTipo !== "all" && p.tipo !== fTipo) return false;
    if (fStatus !== "all" && p.status !== fStatus) return false;
    if (fSecretaria !== "all" && p.secretaria_id !== fSecretaria) return false;
    if (q.trim()) {
      const needle = q.toLowerCase();
      const hay = [p.numero, p.numero_esic, p.tipo === "esic" ? "e-SIC acesso à informação" : "", categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria)), p.assunto, p.descricao, p.solicitante, (p as any).secretarias?.nome]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  };

  const filtrados = protocolosComAntigos.filter(matchesFilter);
  const doAno = filtrados.filter(p => {
    if (!p.data_abertura.startsWith(ano)) return false;
    if (mes !== "all" && p.data_abertura.slice(5, 7) !== mes) return false;
    return true;
  });
  const filtrosAtivos = q || fCategoria !== "all" || fTipo !== "all" || fStatus !== "all" || fSecretaria !== "all";
  const clearFilters = () => { setQ(""); setFCategoria("all"); setFTipo("all"); setFStatus("all"); setFSecretaria("all"); };

  // Comparativo mês a mês por categoria
  const comparativoMensal = useMemo(() => {
    const matrix: Record<string, number[]> = {};
    CATEGORIAS.forEach(c => { matrix[c.value] = Array(12).fill(0); });
    doAno.forEach(p => {
      const mes = parseInt(p.data_abertura.slice(5, 7), 10) - 1;
      const cat = categoriaDoProtocolo(p.tipo, p.categoria);
      if (matrix[cat]) matrix[cat][mes]++;
    });
    return matrix;
  }, [doAno]);

  // Resumo anual por secretaria
  const resumoSecretaria = useMemo(() => {
    return secretarias.map(s => {
      const ps = doAno.filter(p => p.secretaria_id === s.id);
      const meses = Array(12).fill(0);
      ps.forEach(p => meses[parseInt(p.data_abertura.slice(5, 7), 10) - 1]++);
      const porCat: Record<string, number> = {};
      CATEGORIAS.forEach(c => { porCat[c.value] = ps.filter(p => categoriaDoProtocolo(p.tipo, p.categoria) === c.value).length; });
      const total = ps.length;
      const abertos = ps.filter(p => p.status !== "concluido").length;
      const concluidos = ps.filter(p => p.status === "concluido").length;
      return { ...s, meses, porCat, total, abertos, concluidos };
    }).sort((a, b) => b.total - a.total);
  }, [secretarias, doAno]);

  function exportComparativoMensal() {
    const rows: any[] = [];
    CATEGORIAS.forEach(c => {
      const row: any = { Categoria: c.label };
      MESES.forEach((m, i) => row[m] = comparativoMensal[c.value][i]);
      row.Total = comparativoMensal[c.value].reduce((a, b) => a + b, 0);
      rows.push(row);
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Comparativo ${ano}`);
    XLSX.writeFile(wb, `comparativo-mensal-${ano}.xlsx`);
  }

  function exportResumoSecretaria() {
    const rows = resumoSecretaria.map(s => {
      const r: any = { Secretaria: s.nome };
      MESES.forEach((m, i) => r[m] = s.meses[i]);
      CATEGORIAS.forEach(c => r[c.label] = s.porCat[c.value]);
      r.Total = s.total;
      r.Abertos = s.abertos;
      r.Concluidos = s.concluidos;
      return r;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Por secretaria ${ano}`);
    XLSX.writeFile(wb, `resumo-secretarias-${ano}.xlsx`);
  }

  const totalMes = MESES.map((_, i) =>
    CATEGORIAS.reduce((sum, c) => sum + comparativoMensal[c.value][i], 0)
  );
  const maxMes = Math.max(1, ...totalMes);

  // Total mês do ano anterior (mesmos filtros, ignora seletor de mês)
  const totalMesAnoAnterior = useMemo(() => {
    const anoAnt = String(parseInt(ano, 10) - 1);
    const arr = Array(12).fill(0);
    filtrados.forEach(p => {
      if (!p.data_abertura.startsWith(anoAnt)) return;
      const m = parseInt(p.data_abertura.slice(5, 7), 10) - 1;
      arr[m]++;
    });
    return arr;
  }, [filtrados, ano]);

  // Cores semânticas por categoria (alinhadas aos badges em prazo.ts)
  const CAT_COLORS: Record<CategoriaProtocolo, { base: string; light: string }> = {
    elogio:            { base: "#16a34a", light: "#4ade80" }, // green-600 → green-400
    reclamacao:        { base: "#dc2626", light: "#f87171" }, // red-600 → red-400
    pedido_informacao: { base: "#9333ea", light: "#c084fc" }, // purple-600 → purple-400
    esic:              { base: "#0f766e", light: "#2dd4bf" }, // teal-700 → teal-400
    denuncia:          { base: "#0a0a0a", light: "#404040" }, // black → neutral-700
    solicitacao:       { base: "#facc15", light: "#fde047" }, // yellow-400 → yellow-300
    sugestao:          { base: "#2563eb", light: "#60a5fa" }, // blue-600 → blue-400
    outros:            { base: "#64748b", light: "#94a3b8" }, // slate-500 → slate-400
  };

  const MonthlyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const monthIndex = MESES.indexOf(label);
    const monthName = MESES_FULL[monthIndex] ?? label;

    const barItems = payload.filter((p: any) => p.dataKey !== "anoAnterior" && (p.value ?? 0) > 0);
    const lineItem = payload.find((p: any) => p.dataKey === "anoAnterior");
    const totalAtual = barItems.reduce((sum: number, p: any) => sum + (p.value ?? 0), 0);

    return (
      <div className="rounded-xl border bg-popover p-3 shadow-lg min-w-[220px]">
        <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b">
          <span className="font-semibold text-sm">{monthName}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>

        <div className="space-y-1.5">
          {barItems.map((item: any) => {
            const cat = CATEGORIAS.find(c => c.value === item.dataKey);
            const pct = totalAtual > 0 ? ((item.value / totalAtual) * 100).toFixed(0) : "0";
            const color = cat ? CAT_COLORS[cat.value].base : "#64748b";
            return (
              <div key={item.dataKey} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color }} />
                  <span className="truncate">{cat?.label ?? item.dataKey}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold">{item.value}</span>
                  <span className="text-muted-foreground w-8 text-right">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2 pt-2 border-t flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total no mês</span>
          <span className="font-bold text-sm">{totalAtual}</span>
        </div>

        {lineItem && (
          <div className="mt-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-muted-foreground" />
              <span className="text-muted-foreground">Ano anterior</span>
            </div>
            <span className="font-medium text-muted-foreground">{lineItem.value}</span>
          </div>
        )}

        {totalAtual > 0 && lineItem && lineItem.value > 0 && (
          <div className="mt-2 pt-2 border-t text-xs">
            <div className="flex items-center gap-1.5">
              {totalAtual > lineItem.value ? (
                <span className="text-green-600 font-medium">▲ {((totalAtual - lineItem.value) / lineItem.value * 100).toFixed(1)}%</span>
              ) : totalAtual < lineItem.value ? (
                <span className="text-red-500 font-medium">▼ {((lineItem.value - totalAtual) / lineItem.value * 100).toFixed(1)}%</span>
              ) : (
                <span className="text-muted-foreground font-medium">= 0%</span>
              )}
              <span className="text-muted-foreground">vs ano anterior</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const monthlyChartData = MESES.map((m, i) => {
    const row: Record<string, any> = { mes: m, total: totalMes[i], anoAnterior: totalMesAnoAnterior[i] };
    CATEGORIAS.forEach(c => { row[c.value] = comparativoMensal[c.value][i]; });
    return row;
  });

  const anoAnt = String(parseInt(ano, 10) - 1);
  const temAnoAnterior = totalMesAnoAnterior.some(v => v > 0);

  // Atrasadas com dias de atraso (todos os anos, não filtra por ano)
  const atrasadas = useMemo(() => {
    return filtrados
      .filter(p => p.status !== "concluido")
      .map(p => ({ ...p, _s: situacaoProtocolo(p as any) }))
      .filter(p => (isAntigo(p) ? isAntigoAtrasada(p) : p._s.situacao === "vencido"))
      .sort((a, b) => a._s.dias - b._s.dias);
  }, [filtrados]);

  function exportAtrasadas() {
    const rows = atrasadas.map(p => ({
      "Número": p.numero,
      "Número e-SIC": p.numero_esic ?? "",
      "Tipo": PRAZOS[p.tipo as TipoProtocolo].label,
      "Categoria": categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria)),
      "Assunto": p.assunto,
      "Secretaria": (p as any).secretarias?.nome ?? "",
      "Solicitante": p.solicitante ?? "",
      "Data Abertura": formatDate(p.data_abertura),
      "Prazo Final": formatDate(p._s.prazoFinal),
      "Dias em atraso": Math.abs(p._s.dias),
      "Prorrogado": p.prorrogado ? "Sim" : "Não",
      "Status": p.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atrasadas");
    XLSX.writeFile(wb, `protocolos-atrasadas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // Exportações PDF
  function pdfHeader(doc: jsPDF, titulo: string) {
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(titulo, 40, 40);
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 40, 56);
    if (filtrosAtivos) {
      const partes: string[] = [];
      if (q) partes.push(`busca:"${q}"`);
      if (fCategoria !== "all") partes.push(`categoria:${categoriaLabel(fCategoria as CategoriaProtocolo)}`);
      if (fTipo !== "all") partes.push(`tipo:${PRAZOS[fTipo as TipoProtocolo]?.label}`);
      if (fStatus !== "all") partes.push(`status:${fStatus}`);
      if (fSecretaria !== "all") {
        const s = secretarias.find((x: any) => x.id === fSecretaria);
        if (s) partes.push(`secretaria:${(s as any).nome}`);
      }
      doc.text(`Filtros: ${partes.join(" · ")}`, 40, 68);
    }
  }

  function pdfSignature(doc: jsPDF) {
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    // hash simples do conteúdo+timestamp para identificar o documento
    const seed = `${userInfo?.id ?? "anon"}|${Date.now()}|${Math.random()}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    const hash = Math.abs(h).toString(36).toUpperCase().padStart(8, "0");
    const docId = `DOC-${new Date().getFullYear()}-${hash}`;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(200);
      doc.line(40, pageHeight - 60, pageWidth - 40, pageHeight - 60);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text(
        `Assinado eletronicamente por: ${userInfo?.nome ?? "—"}${userInfo?.email ? ` <${userInfo.email}>` : ""}`,
        40, pageHeight - 46
      );
      doc.text(`Documento: ${docId}  ·  Emitido em ${new Date().toLocaleString("pt-BR")}`, 40, pageHeight - 34);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - 40, pageHeight - 34, { align: "right" });
    }
  }

  function exportComparativoPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdfHeader(doc, `Comparativo mensal — ${ano}`);
    autoTable(doc, {
      startY: filtrosAtivos ? 84 : 70,
      head: [["Categoria", ...MESES, "Total"]],
      body: CATEGORIAS.map(c => {
        const row = comparativoMensal[c.value];
        return [c.label, ...row.map(String), String(row.reduce((a, b) => a + b, 0))];
      }),
      foot: [["Total", ...totalMes.map(String), String(totalMes.reduce((a, b) => a + b, 0))]],
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
      styles: { fontSize: 9 },
    });
    pdfSignature(doc);
    doc.save(`comparativo-mensal-${ano}.pdf`);
  }

  function exportSecretariasPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdfHeader(doc, `Resumo por secretaria — ${ano}`);
    autoTable(doc, {
      startY: filtrosAtivos ? 84 : 70,
      head: [["Secretaria", ...CATEGORIAS.map(c => c.label), "Total", "Abertos", "Concluídos"]],
      body: resumoSecretaria.map(s => [
        s.nome,
        ...CATEGORIAS.map(c => String(s.porCat[c.value] ?? 0)),
        String(s.total),
        String(s.abertos),
        String(s.concluidos),
      ]),
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8 },
    });
    pdfSignature(doc);
    doc.save(`resumo-secretarias-${ano}.pdf`);
  }

  function exportAtrasadasPDF() {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdfHeader(doc, `Protocolos atrasados (${atrasadas.length})`);
    autoTable(doc, {
      startY: filtrosAtivos ? 84 : 70,
      head: [["Nº", "Nº e-SIC", "Tipo", "Categoria", "Secretaria", "Assunto", "Aberto", "Prazo", "Atraso"]],
      body: atrasadas.map(p => [
        p.numero,
        p.numero_esic ?? "",
        PRAZOS[p.tipo as TipoProtocolo].label,
        categoriaLabel(categoriaDoProtocolo(p.tipo, p.categoria)),
        (p as any).secretarias?.nome ?? "—",
        (p.assunto ?? "").slice(0, 50),
        formatDate(p.data_abertura),
        formatDate(p._s.prazoFinal),
        `+${Math.abs(p._s.dias)}d`,
      ]),
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 8 },
    });
    pdfSignature(doc);
    doc.save(`atrasados-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  // Resumo do ano
  const totalAno = doAno.length;
  const concluidosAno = doAno.filter(p => p.status === "concluido").length;
  const abertosAno = totalAno - concluidosAno;
  const vencidosAno = doAno.filter(p => {
    if (p.status === "concluido") return false;
    if (isAntigo(p)) return isAntigoAtrasada(p);
    return situacaoProtocolo(p as any).situacao === "vencido";
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Relatórios
          </h1>
          <p className="text-sm text-muted-foreground">{doAno.length} protocolos em {ano}</p>
        </div>
        <div className="flex gap-2">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ano inteiro</SelectItem>
              {MESES_FULL.map((m, i) => (
                <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="mensal" className="space-y-4">
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar por número, assunto, solicitante…" className="pl-8" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <Select value={fTipo} onValueChange={setFTipo}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="ouvidoria">Ouvidoria</SelectItem>
                  <SelectItem value="esic">e-SIC</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fCategoria} onValueChange={setFCategoria}>
                <SelectTrigger className="w-[170px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fSecretaria} onValueChange={setFSecretaria}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Secretaria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas secretarias</SelectItem>
                  {secretarias.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {filtrosAtivos && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total {ano}</div><div className="text-2xl font-bold">{totalAno}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Concluídos</div><div className="text-2xl font-bold text-green-600">{concluidosAno}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Em aberto</div><div className="text-2xl font-bold text-blue-600">{abertosAno}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Vencidos</div><div className="text-2xl font-bold text-destructive">{vencidosAno}</div></CardContent></Card>
        </div>

        <TabsList>
          <TabsTrigger value="mensal">Comparativo mensal</TabsTrigger>
          <TabsTrigger value="secretaria">Por secretaria</TabsTrigger>
          <TabsTrigger value="atrasadas">Atrasadas ({atrasadas.length})</TabsTrigger>
          <TabsTrigger value="ia"><Sparkles className="h-3.5 w-3.5 mr-1" /> Relatório IA</TabsTrigger>
        </TabsList>

        <TabsContent value="mensal" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button onClick={exportComparativoPDF} variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button onClick={exportComparativoMensal} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Excel
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Total por mês — {ano}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Barras empilhadas por categoria
                    {temAnoAnterior && <> · linha pontilhada = total de {anoAnt}</>}
                  </p>
                </div>
                <div className="flex gap-4 text-xs">
                  <div><span className="text-muted-foreground">Total: </span><span className="font-semibold">{totalMes.reduce((a,b)=>a+b,0)}</span></div>
                  <div><span className="text-muted-foreground">Média/mês: </span><span className="font-semibold">{(totalMes.reduce((a,b)=>a+b,0)/12).toFixed(1)}</span></div>
                  <div><span className="text-muted-foreground">Pico: </span><span className="font-semibold">{maxMes}</span></div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <defs>
                      {CATEGORIAS.map(c => (
                        <linearGradient key={c.value} id={`grad-${c.value}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CAT_COLORS[c.value].light} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={CAT_COLORS[c.value].base} stopOpacity={1} />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                    <RTooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                      content={<MonthlyTooltip />}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value) => {
                        if (value === "anoAnterior") return `Total ${anoAnt}`;
                        return CATEGORIAS.find(c => c.value === value)?.label ?? value;
                      }}
                    />
                    {CATEGORIAS.map((c, idx) => (
                      <Bar
                        key={c.value}
                        dataKey={c.value}
                        stackId="cat"
                        fill={`url(#grad-${c.value})`}
                        stroke={CAT_COLORS[c.value].base}
                        strokeWidth={0.5}
                        radius={idx === CATEGORIAS.length - 1 ? [4, 4, 0, 0] : 0}
                        maxBarSize={48}
                      />
                    ))}
                    {temAnoAnterior && (
                      <Line
                        type="monotone"
                        dataKey="anoAnterior"
                        stroke="hsl(var(--muted-foreground))"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Por categoria × mês</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 px-2 font-medium">Categoria</th>
                    {MESES.map(m => <th key={m} className="py-2 px-2 font-medium text-center text-xs">{m}</th>)}
                    <th className="py-2 px-2 font-medium text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIAS.map(c => {
                    const total = comparativoMensal[c.value].reduce((a, b) => a + b, 0);
                    return (
                      <tr key={c.value} className="border-b">
                        <td className="py-2 px-2 font-medium">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ background: CAT_COLORS[c.value].base }}
                              aria-hidden
                            />
                            {c.label}
                          </span>
                        </td>
                        {comparativoMensal[c.value].map((v, i) => (
                          <td key={i} className="py-2 px-2 text-center text-xs tabular-nums">{v || "—"}</td>
                        ))}
                        <td className="py-2 px-2 text-center font-semibold">{total}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-secondary font-semibold">
                    <td className="py-2 px-2">Total</td>
                    {totalMes.map((v, i) => <td key={i} className="py-2 px-2 text-center text-xs tabular-nums">{v || "—"}</td>)}
                    <td className="py-2 px-2 text-center">{totalMes.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="secretaria" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button onClick={exportSecretariasPDF} variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button onClick={exportResumoSecretaria} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Excel
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-secondary/40">
                    <th className="py-2 px-3 font-medium">Secretaria</th>
                    {CATEGORIAS.map(c => (
                      <th key={c.value} className="py-2 px-2 font-medium text-center text-xs">{c.label.split(" ")[0]}</th>
                    ))}
                    <th className="py-2 px-2 font-medium text-center">Total</th>
                    <th className="py-2 px-2 font-medium text-center text-destructive">Abertos</th>
                  </tr>
                </thead>
                <tbody>
                  {resumoSecretaria.map(s => (
                    <tr key={s.id} className="border-b hover:bg-secondary/30 cursor-pointer group">
                      <td className="py-2 px-3">
                        <Link to="/relatorios/secretaria/$id" params={{ id: s.id }} className="flex items-center gap-2 hover:text-primary">
                          <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition" />
                          <div>
                            <div className="font-medium underline-offset-2 group-hover:underline">{s.nome}</div>
                          </div>
                        </Link>
                      </td>
                      {CATEGORIAS.map(c => (
                        <td key={c.value} className="py-2 px-2 text-center tabular-nums text-xs">{s.porCat[c.value as CategoriaProtocolo] || "—"}</td>
                      ))}
                      <td className="py-2 px-2 text-center font-semibold">{s.total || "—"}</td>
                      <td className="py-2 px-2 text-center font-semibold text-destructive">{s.abertos || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="atrasadas" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button onClick={exportAtrasadasPDF} variant="outline" size="sm" disabled={atrasadas.length === 0}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button onClick={exportAtrasadas} variant="outline" size="sm" disabled={atrasadas.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Excel
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left bg-secondary/40">
                    <th className="py-2 px-3 font-medium">Nº / Assunto</th>
                    <th className="py-2 px-2 font-medium text-xs">Tipo</th>
                    <th className="py-2 px-2 font-medium text-xs">Secretaria</th>
                    <th className="py-2 px-2 font-medium text-xs">Aberto</th>
                    <th className="py-2 px-2 font-medium text-xs">Venceu</th>
                    <th className="py-2 px-2 font-medium text-xs text-right text-destructive">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {atrasadas.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma atrasada 🎉</td></tr>
                  )}
                  {atrasadas.map(p => (
                    <tr key={p.id} className="border-b hover:bg-secondary/30">
                      <td className="py-2 px-3">
                        <div className="font-mono text-[10px] text-muted-foreground">{p.numero}</div>
                        <div className="text-sm">{p.assunto}</div>
                      </td>
                      <td className="py-2 px-2 text-xs">{p.tipo}</td>
                      <td className="py-2 px-2 text-xs">{(p as any).secretarias?.nome ?? "—"}</td>
                      <td className="py-2 px-2 text-xs">{formatDate(p.data_abertura)}</td>
                      <td className="py-2 px-2 text-xs">{formatDate(p._s.prazoFinal)}</td>
                      <td className="py-2 px-2 text-right font-bold text-destructive">+{Math.abs(p._s.dias)}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ia" className="space-y-4">
          <RelatorioIA secretarias={secretarias as any} locais={locais as any} ano={ano} mes={mes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RelatorioIA({ secretarias, locais, ano, mes }: { secretarias: any[]; locais: any[]; ano: string; mes: string }) {
  const [secretariaId, setSecretariaId] = useState<string>("all");
  const [localId, setLocalId] = useState<string>("all");
  const [pergunta, setPergunta] = useState<string>("");
  const [resultado, setResultado] = useState<{ relatorio: string; total: number; escopo: string; periodo: string } | null>(null);

  const gerar = useServerFn(gerarRelatorioIA);
  const mut = useMutation({
    mutationFn: async () => gerar({
      data: {
        secretariaId: secretariaId === "all" ? null : secretariaId,
        localId: localId === "all" ? null : localId,
        ano, mes: mes as any, pergunta,
      },
    }),
    onSuccess: (data: any) => setResultado(data),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao gerar relatório"),
  });

  const locaisFiltrados = secretariaId === "all" ? locais : locais.filter(l => l.secretaria_id === secretariaId);

  const sugestoes = [
    "Faça um panorama executivo do período, destacando volume, principais categorias e gargalos.",
    "Quais UBS/locais concentram o maior volume de reclamações? Liste os top 5 com números.",
    "Identifique padrões recorrentes nos assuntos e proponha 3 ações de melhoria.",
    "Compare desempenho mês a mês e aponte tendências de alta ou queda.",
  ];

  return (
    <div className="grid lg:grid-cols-[400px_1fr] gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Relatório personalizado por IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Secretaria</label>
            <Select value={secretariaId} onValueChange={(v) => { setSecretariaId(v); setLocalId("all"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as secretarias</SelectItem>
                {secretarias.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">UBS / Local (opcional)</label>
            <Select value={localId} onValueChange={setLocalId} disabled={secretariaId === "all"}>
              <SelectTrigger><SelectValue placeholder={secretariaId === "all" ? "Selecione uma secretaria" : "Todos os locais"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os locais</SelectItem>
                {locaisFiltrados.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            Período usado: <strong>{mes === "all" ? `ano de ${ano}` : `${mes}/${ano}`}</strong> (altere acima na página).
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">O que você quer no relatório?</label>
            <Textarea
              rows={5}
              placeholder="Ex.: Quero um relatório sobre a Saúde no mês de junho, com foco nas reclamações por UBS e sugestões de melhoria."
              value={pergunta}
              onChange={(e) => setPergunta(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sugestões rápidas</div>
            <div className="flex flex-wrap gap-1">
              {sugestoes.map((s, i) => (
                <button key={i} type="button" onClick={() => setPergunta(s)}
                  className="text-[11px] px-2 py-1 rounded border hover:bg-secondary text-left">
                  {s.length > 60 ? s.slice(0, 57) + "…" : s}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || pergunta.trim().length < 3} className="w-full">
            {mut.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando…</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar relatório</>}
          </Button>
        </CardContent>
      </Card>

      <Card className="min-h-[400px]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Resultado</CardTitle>
          {resultado && (
            <Button size="sm" variant="ghost" onClick={() => {
              navigator.clipboard.writeText(resultado.relatorio);
              toast.success("Relatório copiado");
            }}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!resultado && !mut.isPending && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Configure o escopo ao lado e descreva o relatório desejado. A IA analisará os protocolos do período e gerará um documento personalizado.
            </div>
          )}
          {mut.isPending && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Analisando protocolos e redigindo…
            </div>
          )}
          {resultado && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground border-b pb-2">
                {resultado.escopo} · {resultado.periodo} · {resultado.total} protocolo(s) analisado(s)
              </div>
              <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-h1:text-xl prose-h2:text-base prose-h3:text-sm prose-table:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{resultado.relatorio}</ReactMarkdown>
              </article>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
