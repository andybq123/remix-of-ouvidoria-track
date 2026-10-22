import { describe, expect, it } from "vitest";
// @ts-expect-error módulo JS compartilhado com o agente da VPS
import { limparUrl } from "../../local-docker/agente-1doc/url.mjs";

const destino = "https://brusque.1doc.com.br/?pg=doc&hash=abc";

describe("links legados no agente 1Doc", () => {
  it("aceita link sem protocolo como a tela", () => {
    expect(limparUrl(" brusque.1doc.com.br/?pg=doc&hash=abc ")).toBe(destino);
  });
  it("remove delimitadores de links coletados por e-mail", () => {
    expect(limparUrl(`<${destino}>`)).toBe(destino);
  });
  it("decodifica entidades HTML e quoted-printable", () => {
    expect(limparUrl("https:&#47;&#47;brusque.1doc.com.br/?pg=3Ddoc&amp;hash=\r\n=3Dabc")).toBe(destino);
  });
  it.each(["q", "url", "u", "target"])("extrai destino 1Doc de redirecionador %s sem visitá-lo", (param) => {
    expect(limparUrl(`https://redirect.example/?${param}=${encodeURIComponent(destino)}`)).toBe(destino);
  });
  it.each([null, "", "não é link", "javascript:alert(1)", "https://1doc.com.br.falso.example/", "https://falso1doc.com.br/", "https://usuario:senha@brusque.1doc.com.br/", "https://redirect.example/?url=https%3A%2F%2Ffalso.example%2F"])("rejeita destino inseguro ou ausente %s", (link) => {
    expect(limparUrl(link)).toBeNull();
  });
});