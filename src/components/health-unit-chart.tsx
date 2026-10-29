import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";

type UnitDatum = { name: string; value: number };

export function HealthUnitChart({ data }: { data: UnitDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const color = (index: number) => `var(--health-chart-${index % 12 + 1})`;

  return (
    <div className="health-unit-chart min-w-0">
      <div className="relative mx-auto h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              startAngle={90}
              endAngle={-270}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              label={false}
              animationDuration={900}
            >
              {data.map((item, index) => <Cell key={item.name} fill={color(index)} />)}
            </Pie>
            <Tooltip content={<ChartTooltipContent unit="protocolo(s)" total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
        </div>
      </div>
      <ul aria-label="Protocolos por unidade de saúde" className="mt-2 grid max-h-[180px] grid-cols-1 gap-x-5 gap-y-1 overflow-y-auto pr-2">
        {data.map((item, index) => (
          <li key={item.name} className="flex min-w-0 items-start gap-2 text-xs">
            <svg width="10" height="10" className="mt-0.5 shrink-0" aria-hidden="true">
              <circle cx="5" cy="5" r="5" fill={color(index)} />
            </svg>
            <span className="min-w-0 flex-1 break-words leading-4 text-foreground">{item.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{total > 0 ? ((item.value / total) * 100).toFixed(1) : "0"}% ({item.value})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}