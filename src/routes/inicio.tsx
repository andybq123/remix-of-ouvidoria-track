import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Megaphone,
  Search,
  ShieldCheck,
  Clock,
  FileText,
  MapPin,
  ChevronRight,
  BarChart3,
  Users,
  Lock,
  Eye,
  UserX,
} from "lucide-react";
import brusqueBrasao from "@/assets/brusque-brasao.png";

export const Route = createFileRoute("/inicio")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Ouvidoria Municipal de Brusque — SC" },
      { name: "description", content: "Canal oficial de ouvidoria da Prefeitura Municipal de Brusque, SC. Registre manifestações, acompanhe protocolos e colabore com a administração pública." },
      { property: "og:title", content: "Ouvidoria Municipal de Brusque — SC" },
      { property: "og:description", content: "Registre reclamações, denúncias, elogios, sugestões e solicitações na Ouvidoria da Prefeitura de Brusque." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top institutional bar */}
      <div className="bg-brusque-green h-1.5 w-full" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img
              src={brusqueBrasao}
              alt="Brasão de Brusque"
              className="h-12 w-auto"
            />
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold leading-tight tracking-tight text-foreground">
                PREFEITURA MUNICIPAL DE BRUSQUE
              </h1>
              <p className="text-xs text-muted-foreground">Santa Catarina</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/consulta"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Consultar</span>
            </Link>
            <Link
              to="/ouvidoria"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brusque-green px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:brightness-110"
            >
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Nova Manifestação</span>
              <span className="sm:hidden">Registrar</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-background to-red-50 py-16 sm:py-24 dark:from-emerald-950/30 dark:via-background dark:to-red-950/20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brusque-green/20 bg-brusque-green-light/50 px-4 py-1.5 text-sm font-medium text-brusque-green">
              <ShieldCheck className="h-4 w-4" />
              Canal oficial do cidadão
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Ouvidoria Municipal
              <span className="mt-2 block text-brusque-green">de Brusque</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Seu canal direto de comunicação com a Prefeitura. Registre
              reclamações, denúncias, elogios, sugestões e solicitações — de
              forma pública, sigilosa ou anônima.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/ouvidoria"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brusque-green px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brusque-green/20 transition-all hover:brightness-110 sm:w-auto"
              >
                <Megaphone className="h-5 w-5" />
                Registrar Manifestação
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                to="/consulta"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-8 py-3.5 text-base font-semibold text-foreground transition-all hover:border-brusque-green/30 hover:bg-brusque-green-light/30 sm:w-auto"
              >
                <Search className="h-5 w-5" />
                Consultar Protocolo
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Quick access cards */}
      <section className="mx-auto w-full max-w-7xl px-4 py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1 — Nova Manifestação */}
          <Link
            to="/ouvidoria"
            className="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:border-brusque-green/30 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brusque-green/10 text-brusque-green transition-colors group-hover:bg-brusque-green group-hover:text-white">
              <Megaphone className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Nova Manifestação
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Registre sua reclamação, denúncia, elogio, sugestão ou solicitação
              de forma rápida e simples.
            </p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brusque-green">
              Abrir formulário
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>

          {/* Card 2 — Consultar */}
          <Link
            to="/consulta"
            className="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:border-brusque-green/30 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brusque-green/10 text-brusque-green transition-colors group-hover:bg-brusque-green group-hover:text-white">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Consultar Protocolo
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Acompanhe o andamento da sua manifestação informando o número do
              protocolo e o código de consulta.
            </p>
            <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brusque-green">
              Fazer consulta
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>

          {/* Card 3 — Tipos de manifestação */}
          <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:col-span-2 lg:col-span-1">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brusque-red/10 text-brusque-red">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-card-foreground">
              Tipos de Manifestação
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brusque-green" />
                <span>
                  <strong className="text-foreground">Reclamação</strong> —
                  insatisfação com serviço público
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brusque-green" />
                <span>
                  <strong className="text-foreground">Denúncia</strong> —
                  comunicação de irregularidade
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brusque-green" />
                <span>
                  <strong className="text-foreground">Elogio</strong> —
                  reconhecimento de bom atendimento
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brusque-green" />
                <span>
                  <strong className="text-foreground">Sugestão</strong> —
                  proposta de melhoria
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-brusque-green" />
                <span>
                  <strong className="text-foreground">Solicitação</strong> —
                  pedido de serviço ou informação
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="bg-muted/40 py-16">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Como funciona
            </h2>
            <p className="mt-3 text-muted-foreground">
              Quatro passos simples para registrar e acompanhar sua manifestação
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: FileText,
                title: "1. Preencha",
                desc: "Escolha o tipo de manifestação, a área de atuação e descreva sua demanda.",
              },
              {
                icon: MapPin,
                title: "2. Localize",
                desc: "Informe o endereço de referência e, se quiser, marque o ponto no mapa.",
              },
              {
                icon: ShieldCheck,
                title: "3. Envie",
                desc: "Escolha entre manifestação pública, sigilosa ou anônima e envie.",
              },
              {
                icon: Search,
                title: "4. Acompanhe",
                desc: "Use o número do protocolo e o código de consulta para ver o andamento.",
              },
            ].map((step) => (
              <div
                key={step.title}
                className="relative rounded-2xl border bg-background p-6 text-center shadow-sm"
              >
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brusque-green/10 text-brusque-green">
                  <step.icon className="h-7 w-7" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Por que usar a Ouvidoria
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Lock,
              title: "Sigilo garantido",
              desc: "Manifeste-se de forma pública, sigilosa ou anônima. Sua identidade é protegida conforme sua escolha.",
            },
            {
              icon: Clock,
              title: "Prazos definidos",
              desc: "Cada tipo de manifestação possui prazo de resposta regulamentado. Acompanhe o status em tempo real.",
            },
            {
              icon: BarChart3,
              title: "Transparência",
              desc: "Acesso às informações de andamento de forma clara, com histórico completo da tramitação.",
            },
            {
              icon: MapPin,
              title: "Geolocalização",
              desc: "Marque no mapa o local exato da ocorrência, facilitando a identificação e atuação da equipe.",
            },
            {
              icon: Users,
              title: "Participação cidadã",
              desc: "Colabore com a melhoria dos serviços públicos. Sua opinião é fundamental para Brusque.",
            },
            {
              icon: Eye,
              title: "Acompanhamento",
              desc: "Receba um número de protocolo e código de consulta para acompanhar sua manifestação a qualquer momento.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="flex gap-4 rounded-2xl border bg-card p-5 shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brusque-green/10 text-brusque-green">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-card-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sigilo options */}
      <section className="bg-gradient-to-br from-emerald-50 via-background to-red-50 py-16 dark:from-emerald-950/30 dark:via-background dark:to-red-950/20">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-3xl">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Três níveis de sigilo
              </h2>
              <p className="mt-3 text-muted-foreground">
                Você escolhe como quer se manifestar
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: Eye,
                  title: "Pública",
                  desc: "Seus dados são visíveis na tramitação interna do sistema.",
                  color: "text-blue-600",
                  bg: "bg-blue-50",
                },
                {
                  icon: Lock,
                  title: "Sigilosa",
                  desc: "Seus dados são preservados e acessíveis apenas à equipe da ouvidoria.",
                  color: "text-amber-600",
                  bg: "bg-amber-50",
                },
                {
                  icon: UserX,
                  title: "Anônima",
                  desc: "Sem identificação. Recomenda-se informar contato para possível retorno.",
                  color: "text-brusque-red",
                  bg: "bg-red-50",
                },
              ].map((opt) => (
                <div
                  key={opt.title}
                  className="rounded-2xl border bg-background p-6 text-center shadow-sm"
                >
                  <div
                    className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${opt.bg} ${opt.color}`}
                  >
                    <opt.icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">
                    {opt.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {opt.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="relative overflow-hidden rounded-3xl bg-brusque-green px-6 py-14 text-center text-white sm:px-12">
          <div className="relative z-10">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Sua voz faz a diferença
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-emerald-50">
              A Ouvidoria é o canal que garante o direito do cidadão de ser
              ouvido. Participe ativamente da construção de uma Brusque melhor.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/ouvidoria"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-brusque-green shadow-lg transition-all hover:bg-emerald-50 sm:w-auto"
              >
                <Megaphone className="h-5 w-5" />
                Registrar Manifestação
              </Link>
              <Link
                to="/consulta"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-white/30 bg-white/10 px-8 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20 sm:w-auto"
              >
                <Search className="h-5 w-5" />
                Consultar Protocolo
              </Link>
            </div>
          </div>
          {/* Decorative circles */}
          <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-14 -right-14 h-56 w-56 rounded-full bg-white/5" />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <img
                src={brusqueBrasao}
                alt="Brasão de Brusque"
                className="h-10 w-auto opacity-80"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Prefeitura Municipal de Brusque
                </p>
                <p className="text-xs text-muted-foreground">
                  Santa Catarina — Brasil
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <Link to="/ouvidoria" className="hover:text-foreground">
                Nova Manifestação
              </Link>
              <span className="hidden sm:inline text-border">|</span>
              <Link to="/consulta" className="hover:text-foreground">
                Consultar Protocolo
              </Link>
              <span className="hidden sm:inline text-border">|</span>
              <Link to="/auth" className="hover:text-foreground">
                Acesso Administrativo
              </Link>
            </div>
          </div>
          <div className="mt-6 border-t pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Prefeitura Municipal de Brusque — SC.
            Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
