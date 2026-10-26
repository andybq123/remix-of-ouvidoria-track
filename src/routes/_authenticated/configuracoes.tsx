import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { CONFIG_GRUPOS } from "@/lib/config-items";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · OuviDesk" },
      { name: "description", content: "Central de configurações do OuviDesk: integrações, usuários, licença e manutenção." },
      { property: "og:title", content: "Configurações · OuviDesk" },
      { property: "og:description", content: "Central de configurações do OuviDesk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Integrações, usuários, licença e manutenção do sistema.</p>
        </div>
      </header>

      {CONFIG_GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{grupo.titulo}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {grupo.itens.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex h-full items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.descricao}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
