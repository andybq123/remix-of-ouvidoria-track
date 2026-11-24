import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Maximize2, Minus, X } from "lucide-react";
import { MuseChatPanel } from "@/components/muse-chat-panel";
import {
  POSTER_OUVIDORIZINHO,
  VIDEO_POR_ESTADO,
  estadoTocaUmaVez,
  inclinacaoParaCursor,
  proximoIntervaloTelefone,
  resolverEstadoAnimacao,
} from "@/lib/ouvidorizinho-animacao";
import {
  CHAVE_POSICAO_OUVIDORIZINHO,
  TAMANHO_MASCOTE,
  clampPosicao,
  deserializarPosicao,
  posicaoPadrao,
  serializarPosicao,
  type PosicaoWidget,
} from "@/lib/ouvidorizinho-posicao";

/**
 * Ouvidorizinho flutuante e animado — mascote global do OuviDesk.
 *
 * Renderizado uma só vez no layout autenticado, aparece em todas as
 * páginas logadas. O botão é um vídeo do mascote (circular, com borda e
 * sombra) e pode ser arrastado com mouse ou toque para qualquer canto;
 * a posição fica guardada em localStorage. O clique abre o chat como
 * painel flutuante ao lado do mascote, sem sair da página atual — o
 * mesmo painel da página /muse-chat. O botão de minimizar recolhe o
 * painel e deixa só o mascote.
 *
 * Animação (sem som, sem travar a página):
 * - idle em loop: digitando no notebook, piscando e balançando.
 * - de tempos em tempos (45 a 90 segundos, só com o chat fechado e a
 *   aba visível), ele atende um telefone e volta ao idle.
 * - enquanto o chat busca uma resposta, aparece a bola de cristal.
 * - ao passar o mouse por cima, ele olha desconfiado para o cursor
 *   (vídeo de desconfiança + leve inclinação na direção do mouse).
 * Se um vídeo falhar, o mascote volta para a imagem estática.
 * Com prefers-reduced-motion, usa só a imagem estática.
 *
 * z-index 200: acima de modais, menus e do overlay de atualização.
 */
export function OuvidorizinhoFloat() {
  const [pos, setPos] = useState<PosicaoWidget | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [aberto, setAberto] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [telefoneAtivo, setTelefoneAtivo] = useState(false);
  const [desconfiadoAtivo, setDesconfiadoAtivo] = useState(false);
  const [videoQuebrou, setVideoQuebrou] = useState(false);
  const [movimentoReduzido, setMovimentoReduzido] = useState(false);
  const [inclinacao, setInclinacao] = useState({ rotacao: 0, deslocamentoX: 0 });
  const arrasteRef = useRef<{
    inicioX: number;
    inicioY: number;
    posX: number;
    posY: number;
    moveu: boolean;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const desconfiadoTimerRef = useRef<number | null>(null);
  const posRef = useRef<PosicaoWidget | null>(null);
  posRef.current = pos;

  const estado = resolverEstadoAnimacao({ pensando, desconfiadoAtivo, telefoneAtivo });
  const animado = !videoQuebrou && !movimentoReduzido;

  useEffect(() => {
    const ler = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });
      const guardada = deserializarPosicao(
        window.localStorage.getItem(CHAVE_POSICAO_OUVIDORIZINHO),
      );
      setPos((atual) => clampPosicao(guardada ?? atual ?? posicaoPadrao(w, h), w, h));
    };
    ler();
    window.addEventListener("resize", ler);
    return () => window.removeEventListener("resize", ler);
  }, []);

  useEffect(() => {
    setMovimentoReduzido(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Telefonema surpresa: a cada 45-90s, só com o chat fechado e a aba visível.
  useEffect(() => {
    if (aberto) return;
    let cancelado = false;
    let timer: number | null = null;
    const agendar = () => {
      timer = window.setTimeout(() => {
        if (cancelado || document.hidden) {
          agendar();
          return;
        }
        setTelefoneAtivo(true);
        agendar();
      }, proximoIntervaloTelefone());
    };
    agendar();
    return () => {
      cancelado = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [aberto]);

  // Quando o vídeo de um estado que toca uma vez termina, volta ao idle.
  function onVideoTerminou() {
    if (estadoTocaUmaVez(estado)) {
      setTelefoneAtivo(false);
      setDesconfiadoAtivo(false);
    }
  }

  // Troca de estado: carrega o vídeo certo e toca (loop só no idle/pensando).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !animado) return;
    video.load();
    void video.play().catch(() => setVideoQuebrou(true));
  }, [estado, animado]);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!pos) return;
    arrasteRef.current = {
      inicioX: e.clientX,
      inicioY: e.clientY,
      posX: pos.x,
      posY: pos.y,
      moveu: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const a = arrasteRef.current;
    if (!a) return;
    const nx = a.posX + (e.clientX - a.inicioX);
    const ny = a.posY + (e.clientY - a.inicioY);
    if (Math.abs(e.clientX - a.inicioX) + Math.abs(e.clientY - a.inicioY) > 6) {
      a.moveu = true;
    }
    setPos(clampPosicao({ x: nx, y: ny }, window.innerWidth, window.innerHeight));
  }

  function onPointerUp() {
    const a = arrasteRef.current;
    arrasteRef.current = null;
    if (!a) return;
    // Clique (sem arrastar) abre/fecha o painel; arrastar só move.
    if (!a.moveu) {
      setAberto((v) => !v);
    } else if (posRef.current) {
      window.localStorage.setItem(CHAVE_POSICAO_OUVIDORIZINHO, serializarPosicao(posRef.current));
    }
  }

  // Hover: cara de desconfiado (com debounce) e inclinação para o cursor.
  function onMouseEnter() {
    if (desconfiadoTimerRef.current !== null) return;
    desconfiadoTimerRef.current = window.setTimeout(() => {
      desconfiadoTimerRef.current = null;
      setDesconfiadoAtivo(true);
    }, 350);
  }

  function onMouseMove(e: React.MouseEvent<HTMLButtonElement>) {
    if (!pos) return;
    const centroX = pos.x + TAMANHO_MASCOTE / 2;
    const centroY = pos.y + TAMANHO_MASCOTE / 2;
    setInclinacao(inclinacaoParaCursor(e.clientX - centroX, e.clientY - centroY));
  }

  function onMouseLeave() {
    if (desconfiadoTimerRef.current !== null) {
      window.clearTimeout(desconfiadoTimerRef.current);
      desconfiadoTimerRef.current = null;
    }
    setDesconfiadoAtivo(false);
    setInclinacao({ rotacao: 0, deslocamentoX: 0 });
  }

  if (!pos || viewport.w === 0) return null;

  const drawerW = Math.min(400, viewport.w - 24);
  const drawerH = Math.min(560, viewport.h - 24);
  const naDireita = pos.x + TAMANHO_MASCOTE / 2 > viewport.w / 2;
  const drawerLeft = naDireita
    ? Math.min(Math.max(pos.x + TAMANHO_MASCOTE - drawerW, 12), viewport.w - drawerW - 12)
    : Math.min(Math.max(pos.x, 12), viewport.w - drawerW - 12);
  const drawerTop = Math.min(
    Math.max(pos.y - drawerH - 12, 12),
    Math.max(12, viewport.h - drawerH - 12),
  );

  return (
    <>
      {aberto && (
        <div
          className="fixed flex flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
          style={{
            left: drawerLeft,
            top: drawerTop,
            width: drawerW,
            height: drawerH,
            zIndex: 200,
          }}
          role="dialog"
          aria-label="Chat com o Ouvidorizinho"
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <img
              src={POSTER_OUVIDORIZINHO}
              alt=""
              className="h-8 w-8 rounded-full border object-cover"
            />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Ouvidorizinho</span>
            <Link
              to="/muse-chat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              title="Abrir em página cheia"
              aria-label="Abrir o chat em página cheia"
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              title="Minimizar"
              aria-label="Minimizar o chat"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              title="Fechar"
              aria-label="Fechar o chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <MuseChatPanel
              alturaMensagens="max-h-[260px] overflow-y-auto"
              onPensandoChange={setPensando}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        className="fixed touch-none select-none overflow-hidden rounded-full border-2 border-primary/60 bg-card shadow-xl transition-shadow hover:shadow-2xl"
        style={{
          left: pos.x,
          top: pos.y,
          width: TAMANHO_MASCOTE,
          height: TAMANHO_MASCOTE,
          zIndex: 200,
          transform: `translateX(${inclinacao.deslocamentoX}px) rotate(${inclinacao.rotacao}deg)`,
        }}
        title="Ouvidorizinho — assistente do OuviDesk (arraste para mover)"
        aria-label={aberto ? "Fechar o Ouvidorizinho" : "Abrir o Ouvidorizinho"}
        aria-expanded={aberto}
      >
        {animado ? (
          <video
            key={estado}
            ref={videoRef}
            src={VIDEO_POR_ESTADO[estado]}
            poster={POSTER_OUVIDORIZINHO}
            className="h-full w-full rounded-full object-cover"
            muted
            playsInline
            loop={!estadoTocaUmaVez(estado)}
            autoPlay
            preload="metadata"
            onEnded={onVideoTerminou}
            onError={() => setVideoQuebrou(true)}
            aria-hidden="true"
          />
        ) : (
          <img
            src={POSTER_OUVIDORIZINHO}
            alt="Ouvidorizinho"
            className="h-full w-full rounded-full object-cover"
            draggable={false}
          />
        )}
      </button>
    </>
  );
}
