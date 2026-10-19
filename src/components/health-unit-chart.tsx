import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartTooltipContent } from "@/components/chart-tooltip";

type UnitDatum = { name: string; value: number };

export function HealthUnitChart({ data }: { data: UnitDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const color = (index: number) => `var(--health-chart-${index % 12 + 1})`;

  return (
    <div className="health-unit-chart min-w-0">
      <div className="relative mx-auto h-[260px] w-full max-w-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="90%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={1}
              stroke="var(--card)"
              strokeWidth={2}
              label={false}
              isAnimationActive={false}
            >
              {data.map((item, index) => <Cell key={item.name} fill={color(index)} />)}
            </Pie>
            <Tooltip content={<ChartTooltipContent unit="protocolo(s)" total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{total}</span>
          <span className="mt-1 text-xs text-muted-foreground">protocolos</span>
        </div>
      </div>
      <ul aria-label="Protocolos por unidade de saúde" className="mt-3 grid max-h-[180px] grid-cols-1 gap-x-5 gap-y-3 overflow-y-auto border-t pt-4 pr-2 sm:grid-cols-2">
        {data.map((item, index) => (
          <li key={item.name} className="flex min-w-0 items-start gap-2 text-xs">
            <svg width="10" height="10" className="mt-0.5 shrink-0" aria-hidden="true">
              <circle cx="5" cy="5" r="5" fill={color(index)} />
            </svg>
            <span className="min-w-0 flex-1 break-words leading-4 text-foreground">{item.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}