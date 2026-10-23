import { avaliarSenha, CRITERIOS_SENHA } from "@/lib/password-strength";
import { Check, X } from "lucide-react";

export function PasswordStrengthIndicator({ senha }: { senha: string }) {
  if (!senha) return null;
  const r = avaliarSenha(senha);
  const pct = Math.round((r.atendidos / r.total) * 100);
  const cor = r.forte
    ? "bg-emerald-500"
    : r.atendidos >= Math.ceil(r.total / 2)
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${cor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs font-medium ${r.forte ? "text-emerald-600" : "text-red-600"}`}>
          {r.forte ? "Senha forte" : "Senha fraca"}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
        {CRITERIOS_SENHA.map((c) => {
          const ok = c.atende(senha);
          return (
            <li key={c.id} className={`flex items-center gap-1 text-xs ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>
              {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {c.rotulo}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
