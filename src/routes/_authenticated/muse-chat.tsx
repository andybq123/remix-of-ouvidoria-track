import { createFileRoute } from "@tanstack/react-router";
import { MuseChatPanel } from "@/components/muse-chat-panel";

export const Route = createFileRoute("/_authenticated/muse-chat")({
  head: () => ({
    meta: [
      { title: "Ouvidorizinho — OuviDesk" },
      {
        name: "description",
        content:
          "Pergunte sobre os dados do OuviDesk: atrasadas, prazos, secretarias e conferências no 1Doc.",
      },
      { property: "og:title", content: "Ouvidorizinho — OuviDesk" },
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
            alt="Ouvidorizinho"
            className="h-9 w-9 rounded-full border object-cover"
          />
          Ouvidorizinho
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
