import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Clock3, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { POSTER_OUVIDORZINHO } from "@/lib/ouvidorizinho-animacao";
import { useOuvidorzinhoHabilitado } from "@/hooks/use-ouvidorzinho-habilitado";
import {
  VIDEO_BOAS_VINDAS,
  dispensarBoasVindas,
  useBoasVindas,
} from "@/hooks/use-boas-vindas";

/**
 * Card de boas-vindas do primeiro login — aparece uma só vez.
 *
 * Renderizado no layout autenticado (toda página logada), mas só quando o
 * flag boas_vindas_visto do usuário ainda é falso. Ao dispensar ("Começar"
 * ou fechar), marca o flag no servidor e some imediatamente; se a
 * gravação falhar, some na sessão mesmo assim e não insiste.
 *
 * Com o Ouvidorzinho habilitado, mostra a miniatura dele atendendo o
 * telefone (vídeo em loop, sem som); com o Ouvidorzinho desabilitado
 * para o usuário, o card aparece normalmente, só sem o mascote.
 */
export function BoasVindasCard() {
  const { mostrar } = useBoasVindas();
  const ouvidorzinhoHabilitado = useOuvidorzinhoHabilitado();
  const qc = useQueryClient();
  const [dispensado, setDispensado] = useState(false);

  async function fechar() {
    setDispensado(true);
    await dispensarBoasVindas();
    await qc.invalidateQueries({ queryKey: ["boas-vindas-visto"] });
  }

  if (!mostrar || dispensado) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bem-vindo ao OuviDesk"
    >
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="relative space-y-4 p-6 text-center">
          <button
            type="button"
            onClick={() => void fechar()}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            title="Fechar"
            aria-label="Fechar boas-vindas"
          >
            <X className="h-4 w-4" />
          </button>

          {ouvidorzinhoHabilitado && (
            <video
              src={VIDEO_BOAS_VINDAS}
              poster={POSTER_OUVIDORZINHO}
              className="mx-auto h-24 w-24 rounded-full border object-cover"
              muted
              loop
              autoPlay
              playsInline
              aria-hidden="true"
            />
          )}

          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight">Bem-vindo ao OuviDesk!</h2>
            <p className="text-sm text-muted-foreground">
              O sistema que acompanha as demandas do 1Doc com você.
            </p>
          </div>

          <ul className="space-y-2 text-left text-sm">
            <li className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Atrasadas e prazos sempre à vista</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Conferência no 1Doc com baixa automática</span>
            </li>
            <li className="flex items-start gap-2">
              <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Triagem e secretarias organizadas</span>
            </li>
          </ul>

          {ouvidorzinhoHabilitado && (
            <p className="flex items-start justify-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                O Ouvidorzinho, seu assistente, responde dúvidas e abre as telas certas — é só
                clicar no mascote no canto da tela.
              </span>
            </p>
          )}

          <Button onClick={() => void fechar()} className="w-full">
            Começar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
