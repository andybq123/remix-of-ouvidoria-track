import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isCustomMapEmoji, obterIconeSecretaria, SECRETARIA_ICONES } from "@/lib/secretaria-map-icons";
import type { MapDepartment } from "@/lib/map-departments";

export function SecretariaIconPicker({ value, onChange, setor, id }: {
  value: string;
  onChange: (value: string) => void;
  setor?: MapDepartment | null;
  id: string;
}) {
  const custom = value !== "automatico" && !Object.hasOwn(SECRETARIA_ICONES, value);
  const preview = obterIconeSecretaria(value === "automatico" ? null : value, setor);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Ícone no mapa</Label>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-2xl" aria-label={`Prévia: ${preview.label}`}>{preview.emoji}</span>
        <Select value={custom ? "personalizado" : value} onValueChange={(next) => onChange(next === "personalizado" ? "" : next)}>
          <SelectTrigger id={id}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="automatico">{obterIconeSecretaria(null, setor).emoji} Automático</SelectItem>
            {Object.entries(SECRETARIA_ICONES).map(([key, icon]) => (
              <SelectItem key={key} value={key}>{icon.emoji} {icon.label}</SelectItem>
            ))}
            <SelectItem value="personalizado">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {custom && <>
        <Input aria-label="Emoji personalizado" value={value} maxLength={24} placeholder="Ex.: 🏗️" onChange={(event) => onChange(event.target.value.trim())} />
        {!isCustomMapEmoji(value) && <p className="text-xs text-destructive" role="alert">Informe um único emoji.</p>}
      </>}
    </div>
  );
}