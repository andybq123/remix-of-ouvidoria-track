import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CategoriaProtocolo } from "@/lib/prazo";

export const CAT_COLORS: Record<CategoriaProtocolo, string> = {
  solicitacao: "hsl(217 91% 60%)",
  reclamacao: "hsl(25 95% 53%)",
  elogio: "hsl(142 71% 45%)",
  denuncia: "hsl(0 84% 60%)",
  pedido_informacao: "hsl(262 83% 58%)",
  esic: "hsl(174 72% 35%)",
  sugestao: "hsl(199 89% 48%)",
  outros: "hsl(215 16% 60%)",
};

export type KpiTone = "primary" | "info" | "success" | "destructive" | "violet" | "emerald" | "warning";

export function KpiCard({ icon: Icon, label, value, hint, hintTrend, suffix, tone, onClick }: {
  icon: any; label: string; value: number | string; hint?: string; suffix?: string;
  hintTrend?: "up" | "down";
  tone: KpiTone;
  onClick?: () => void;
}) {
  const tones: Record<string, { bg: string; fg: string; ring: string; grad: string }> = {
    warning:     { bg: "bg-orange-500/10",  fg: "text-orange-600",    ring: "ring-orange-500/20",  grad: "from-orange-500/10 via-transparent to-transparent" },
    primary:     { bg: "bg-primary/10",     fg: "text-primary",       ring: "ring-primary/20",     grad: "from-primary/10 via-transparent to-transparent" },
    info:        { bg: "bg-amber-500/10",   fg: "text-amber-600",     ring: "ring-amber-500/20",   grad: "from-amber-500/10 via-transparent to-transparent" },
    success:     { bg: "bg-emerald-500/10", fg: "text-emerald-600",   ring: "ring-emerald-500/20", grad: "from-emerald-500/10 via-transparent to-transparent" },
    destructive: { bg: "bg-destructive/10", fg: "text-destructive",   ring: "ring-destructive/20", grad: "from-destructive/10 via-transparent to-transparent" },
    violet:      { bg: "bg-violet-500/10",  fg: "text-violet-600",    ring: "ring-violet-500/20",  grad: "from-violet-500/10 via-transparent to-transparent" },
    emerald:     { bg: "bg-teal-500/10",    fg: "text-teal-600",      ring: "ring-teal-500/20",    grad: "from-teal-500/10 via-transparent to-transparent" },
  };
  const t = tones[tone];
  return (
    <Card
      onClick={onClick}
      className={`relative overflow-hidden border ring-1 ${t.ring} bg-gradient-to-br ${t.grad} ${onClick ? "cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 hover:ring-2" : ""}`}
    >
      <CardContent className="p-4 relative">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl ${t.bg} ${t.fg} flex items-center justify-center shrink-0 shadow-sm`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
            <p className="text-2xl font-bold leading-tight tracking-tight">
              {value}{suffix && <span className="text-sm font-medium text-muted-foreground ml-1">{suffix}</span>}
            </p>
          </div>
        </div>
        {hint && (
          <p className={`mt-2 text-[11px] flex items-center gap-1 ${hintTrend === "up" ? "text-emerald-600" : hintTrend === "down" ? "text-destructive" : "text-muted-foreground"}`}>
            {hint}{hintTrend === "up" && <TrendingUp className="h-3 w-3" />}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
