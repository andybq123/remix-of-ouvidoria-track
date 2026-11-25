import { createFileRoute, redirect } from "@tanstack/react-router";
import { MuseChatPanel } from "@/components/muse-chat-panel";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/muse-chat")({
  beforeLoad: async () => {
    // Ouvidorzinho desabilitado para o usuário (aba Usuários): o chat não abre.
    const { data } = await supabase.rpc("posso_usar_ouvidorzinho");
    if (data === false) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Ouvidorzinho — OuviDesk" },
      {
        name: "description",
        content:
          "Pergunte sobre os dados do OuviDesk: atrasadas, prazos, secretarias e conferências no 1Doc.",
      },
      { property: "og:title", content: "Ouvidorzinho — OuviDesk" },
      { property: "og:description", content: "Pergunte sobre os dados do OuviDesk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MuseChatPage,
});

function MuseChatPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <img
            src="/ouvidorizinho.png"
            alt="Ouvidorzinho"
            className="h-9 w-9 rounded-full border object-cover"
          />
          Ouvidorzinho
        </h1>
        <p className="text-sm text-muted-foreground">
          O assistente do OuviDesk, movido pelo Muse. Ele também está no canto da tela em todas as
          páginas — é só clicar no mascote para conversar sem sair de onde você está.
        </p>
      </div>
      <MuseChatPanel />
    </div>
  );
}
