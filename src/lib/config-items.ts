import { Mail, Bot, Link2Off, RefreshCw, Users, Sparkles, DatabaseBackup, ScrollText, Bug, KeyRound, type LucideIcon } from "lucide-react";

export type ConfigItem = { to: string; label: string; icon: LucideIcon; descricao: string };
export type ConfigGrupo = { titulo: string; itens: ConfigItem[] };

export const CONFIG_GRUPOS: ConfigGrupo[] = [
  {
    titulo: "Integrações",
    itens: [
      { to: "/email-inbox", label: "E-mails", icon: Mail, descricao: "Caixas de entrada e coleta de ouvidorias e e-SIC." },
      { to: "/agente-1doc", label: "Agente 1Doc", icon: Bot, descricao: "Acesso ao 1Doc, conferências e histórico." },
      { to: "/sem-link-1doc", label: "Sem link 1Doc", icon: Link2Off, descricao: "Ouvidorias que ainda não têm link do 1Doc." },
      { to: "/ia-config", label: "IA", icon: Sparkles, descricao: "Provedores e chaves da inteligência artificial." },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { to: "/users", label: "Usuários", icon: Users, descricao: "Contas, permissões e áreas de acesso." },
      { to: "/licenca", label: "Licença", icon: KeyRound, descricao: "Situação da licença e última verificação." },
      { to: "/atualizacao", label: "Atualização", icon: RefreshCw, descricao: "Atualizar o sistema na VPS." },
      { to: "/backup", label: "Backup", icon: DatabaseBackup, descricao: "Exportar e importar cópias dos dados." },
    ],
  },
  {
    titulo: "Diagnóstico",
    itens: [
      { to: "/registro", label: "Registro do sistema", icon: ScrollText, descricao: "Todas as alterações feitas pelos usuários." },
      { to: "/debug", label: "Debug", icon: Bug, descricao: "Ferramentas técnicas e assuntos alterados." },
    ],
  },
];

export const CONFIG_ITEMS: ConfigItem[] = CONFIG_GRUPOS.flatMap((g) => g.itens);
