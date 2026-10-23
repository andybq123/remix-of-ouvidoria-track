import { Building2, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MapDepartmentScope } from "@/lib/map-departments";

const OPTIONS: { value: MapDepartmentScope; label: string; Icon: typeof HeartPulse }[] = [
  { value: "saude", label: "Saúde", Icon: HeartPulse },
  { value: "obras", label: "Obras", Icon: Building2 },
];

export function MapDepartmentToggle({
  value,
  onChange,
  scopes,
}: {
  value: MapDepartmentScope;
  onChange: (value: MapDepartmentScope) => void;
  /** Áreas visíveis; padrão mostra todas. */
  scopes?: MapDepartment[];
}) {
  const visiveis = OPTIONS.filter((o) => !scopes || scopes.includes(o.value as MapDepartment));
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Área exibida no mapa">
      {visiveis.map(({ value: option, label, Icon }) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? "default" : "outline"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className="gap-1.5"
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  );
}
