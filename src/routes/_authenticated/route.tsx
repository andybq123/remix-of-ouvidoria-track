import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FileText, Building2, LogOut, AlertTriangle, BarChart3, Mail, Users, HeartPulse, Map as MapIcon, Settings, ChevronDown, PanelLeft, PanelTop, Tag, Inbox, Download, Sparkles, DatabaseBackup, Bug, Check, type LucideIcon } from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLayoutMode } from "@/hooks/use-layout-mode";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import brusqueLogo from "@/assets/brusque-brasao.png";
import { RealtimeSyncProvider } from "@/hooks/realtime-sync-context";
import { OnlineUsersProvider, useOnlineUsers } from "@/hooks/use-online-users";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { LayoutMode } from "@/hooks/use-layout-mode";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    if (!roles || roles.length === 0) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { unauthorized: "1" } as any });
    }
    return { user: data.user };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const { user } = Route.useRouteContext();
  const [layoutMode, setLayoutMode] = useLayoutMode();

  const { data: isAdmin = false } = useQuery({
    queryKey: ["is-admin", user.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      return !!data;
    },
  });

  const displayName =
    (user.user_metadata as any)?.nome ||
    (user.user_metadata as any)?.full_name ||
    user.email?.split("@")[0] ||
    "Usuário";

  async function handleLogout() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const nav = ([
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ...(isAdmin ? [{ to: "/tarefas", label: "Triagem", icon: Inbox }] : []),
    { to: "/protocolos", label: "Protocolos", icon: FileText },
    { to: "/saude", label: "Saúde", icon: HeartPulse },
    { to: "/mapa", label: "Mapa", icon: MapIcon },
    { to: "/atrasados", label: "Atrasados", icon: AlertTriangle },
    { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  ]) as { to: string; label: string; icon: any }[];

  const configItems = (isAdmin ? [
    { to: "/secretarias", label: "Secretarias", icon: Building2 },
    { to: "/assuntos", label: "Assuntos", icon: Tag },
    { to: "/email-inbox", label: "E-mails", icon: Mail },
    { to: "/coletor", label: "Coletor 1doc", icon: Download },
    { to: "/agente-1doc", label: "Agente 1Doc", icon: Bot },
    { to: "/users", label: "Usuários", icon: Users },
    { to: "/ia-config", label: "IA", icon: Sparkles },
    { to: "/backup", label: "Backup", icon: DatabaseBackup },
    { to: "/debug", label: "Debug", icon: Bug },
  ] : []) as { to: string; label: string; icon: any }[];
  const configActive = configItems.some(c => pathname.startsWith(c.to));

  const LayoutSwitch = <LayoutSelector mode={layoutMode} onChange={setLayoutMode} />;

  const OnlineIndicatorEl = <OnlineIndicator />;

  if (layoutMode === "workspace") {
    return (
      <WorkspaceLayout
        user={user}
        displayName={displayName}
        pathname={pathname}
        nav={nav}
        configItems={configItems}
        handleLogout={handleLogout}
        onlineIndicator={OnlineIndicatorEl}
        layoutSelector={LayoutSwitch}
      />
    );
  }

  if (layoutMode === "sidebar") {
    const allNav = [...nav, ...configItems];
    return (
      <RealtimeSyncProvider>
      <OnlineUsersProvider userId={user.id} nome={displayName}>
      <div className="min-h-screen flex bg-slate-50 dark:bg-background">
        <aside className="w-64 shrink-0 bg-slate-900 text-slate-100 flex flex-col sticky top-0 h-screen">
          <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-800">
            <img src={brusqueLogo} alt="" className="h-10 w-10 object-contain" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">Ouvidoria de Brusque</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {allNav.map(item => {
              const active = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="border-b bg-card sticky top-0 z-10">
            <div className="px-6 h-16 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-base font-semibold leading-tight truncate">Painel Executivo</div>
                <div className="text-xs text-muted-foreground leading-tight truncate">Visão geral das manifestações da Ouvidoria</div>
              </div>
              <div className="flex items-center gap-1">
                {OnlineIndicatorEl}
                <NotificationBell />
                <ThemeToggle />
                {LayoutSwitch}
                <Button variant="destructive" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Sair</span>
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 px-6 py-6 min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
      </OnlineUsersProvider>
      </RealtimeSyncProvider>
    );
  }

  return (
    <RealtimeSyncProvider>
    <OnlineUsersProvider userId={user.id} nome={displayName}>
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={brusqueLogo} alt="Ouvidoria de Brusque" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block">
              <div className="text-sm font-semibold leading-tight">Ouvidoria de Brusque</div>
              <div className="text-xs text-muted-foreground leading-tight">{"\n"}</div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map(item => {
              const active = pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
            {configItems.length > 0 && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors ${configActive ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}
                >
                  <Settings className="h-4 w-4" />
                  <span className="hidden md:inline">Configurações</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {configItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.to} asChild>
                      <Link to={item.to} className="flex items-center gap-2 cursor-pointer">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>}
          </nav>
          <div className="flex items-center gap-1">
            {OnlineIndicatorEl}
            <NotificationBell />
            <ThemeToggle />
            {LayoutSwitch}
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
    </OnlineUsersProvider>
    </RealtimeSyncProvider>
  );
}

type NavItem = { to: string; label: string; icon: LucideIcon };

function LayoutSelector({
  mode,
  onChange,
}: {
  mode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}) {
  const ModeIcon = mode === "topbar" ? PanelTop : mode === "sidebar" ? PanelLeft : LayoutDashboard;
  const options: { mode: LayoutMode; label: string; Icon: LucideIcon }[] = [
    { mode: "topbar", label: "Navegação superior", Icon: PanelTop },
    { mode: "sidebar", label: "Menu lateral clássico", Icon: PanelLeft },
    { mode: "workspace", label: "Workspace · nova interface", Icon: LayoutDashboard },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Selecionar interface"
          aria-label="Selecionar interface do sistema"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background/80 text-foreground shadow-sm backdrop-blur transition-all hover:bg-accent hover:scale-105"
        >
          <ModeIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          Interface do sistema
        </div>
        {options.map(({ mode: optionMode, label, Icon }) => (
          <DropdownMenuItem
            key={optionMode}
            onSelect={() => onChange(optionMode)}
            className="flex cursor-pointer items-center gap-2"
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {mode === optionMode && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceLayout({
  user,
  displayName,
  pathname,
  nav,
  configItems,
  handleLogout,
  onlineIndicator,
  layoutSelector,
}: {
  user: { id: string };
  displayName: string;
  pathname: string;
  nav: NavItem[];
  configItems: NavItem[];
  handleLogout: () => Promise<void>;
  onlineIndicator: ReactNode;
  layoutSelector: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [configMenuOpen, setConfigMenuOpen] = useState(() =>
    configItems.some((item) => pathname.startsWith(item.to)),
  );
  const currentPage = [...nav, ...configItems].find((item) => pathname.startsWith(item.to));
  const title = currentPage?.label ?? "Painel de gestão";
  const configActive = configItems.some((item) => pathname.startsWith(item.to));
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <RealtimeSyncProvider>
      <OnlineUsersProvider userId={user.id} nome={displayName}>
        <div className="workspace-shell">
          {mobileNavOpen && (
            <button
              type="button"
              aria-label="Fechar menu"
              className="workspace-overlay lg:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
          )}
          <aside className={`workspace-sidebar${mobileNavOpen ? " is-open" : ""}`}>
            <div className="workspace-brand">
              <img src={brusqueLogo} alt="Brasão de Brusque" className="h-10 w-10 object-contain" />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">Ouvidoria de Brusque</div>
              </div>
              <span className="workspace-brand-mark" aria-hidden="true">
                S
              </span>
            </div>

            <nav aria-label="Navegação principal" className="workspace-nav">
              <div className="workspace-nav-heading">GESTÃO</div>
              {nav.map((item) => (
                <WorkspaceNavLink
                  key={item.to}
                  item={item}
                  active={pathname.startsWith(item.to)}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              ))}
              {configItems.length > 0 && (
                <>
                  <button
                    type="button"
                    className={`workspace-nav-heading workspace-nav-heading-spaced workspace-nav-toggle${configActive ? " is-current" : ""}`}
                    aria-label="Configurações"
                    aria-expanded={configMenuOpen}
                    aria-controls="workspace-config-menu"
                    onClick={() => setConfigMenuOpen((open) => !open)}
                  >
                    <span>CONFIGURAÇÕES</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform${configMenuOpen ? " rotate-180" : ""}`} aria-hidden="true" />
                  </button>
                  <div id="workspace-config-menu" hidden={!configMenuOpen}>
                    {configItems.map((item) => (
                      <WorkspaceNavLink
                        key={item.to}
                        item={item}
                        active={pathname.startsWith(item.to)}
                        onNavigate={() => setMobileNavOpen(false)}
                      />
                    ))}
                  </div>
                </>
              )}
            </nav>

            <div className="workspace-account">
              <div className="workspace-avatar" aria-hidden="true">
                {initials || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{displayName}</div>
                <div className="text-xs text-muted-foreground">Sessão ativa</div>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                aria-label="Sair do sistema"
                title="Sair"
                className="workspace-logout bg-red-600 text-white hover:bg-red-700"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </aside>

          <div className="workspace-content">
            <header className="workspace-header">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label="Abrir menu"
                  onClick={() => setMobileNavOpen(true)}
                  className="workspace-mobile-menu lg:hidden"
                >
                  <PanelLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold tracking-tight">{title}</div>
                  <div className="hidden text-xs text-muted-foreground sm:block">
                    Sistema de gestão da Ouvidoria Municipal
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {onlineIndicator}
                <NotificationBell />
                <ThemeToggle />
                {layoutSelector}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleLogout()}
                  className="lg:hidden bg-red-600 text-white hover:bg-red-700"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </header>

            <main className="workspace-main">
              <Outlet />
            </main>
          </div>
        </div>
      </OnlineUsersProvider>
    </RealtimeSyncProvider>
  );
}

function WorkspaceNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`workspace-nav-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
      {active && <span className="workspace-active-marker" aria-hidden="true" />}
    </Link>
  );
}

function OnlineIndicator() {
  const { onlineUsers } = useOnlineUsers();
  const count = onlineUsers.length;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${count} usuário(s) online`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-all hover:bg-accent"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>{count}</span>
            <span className="hidden md:inline text-muted-foreground">online</span>
          </button>
        </TooltipTrigger>
        <TooltipContent align="end" className="max-w-xs">
          <div className="text-xs font-semibold mb-1">Usuários online</div>
          {onlineUsers.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhum</div>
          ) : (
            <ul className="text-xs space-y-0.5">
              {onlineUsers.map(u => (
                <li key={u.user_id} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="truncate">{u.nome || "Usuário"}</span>
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
