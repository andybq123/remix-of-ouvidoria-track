import { describe, expect, it } from "vitest";
import { dominioDoEmail, lerAutoconfigXml, mensagemErroImap, palpitesServidor, usuariosCandidatos } from "./imap-autoconfig";

describe("Detecção automática de e-mail", () => {
  it("extrai o domínio só de e-mails válidos", () => {
    expect(dominioDoEmail("Anderson.Rosa@Brusque.SC.gov.br")).toBe("brusque.sc.gov.br");
    expect(dominioDoEmail("sem-arroba")).toBeNull();
  });
  it("tenta e-mail completo e depois a parte antes do @", () => {
    expect(usuariosCandidatos("anderson.rosa@brusque.sc.gov.br")).toEqual(["anderson.rosa@brusque.sc.gov.br", "anderson.rosa"]);
    expect(usuariosCandidatos("a@b.com", "local")).toEqual(["a", "a@b.com"]);
  });
  it("palpita imap., mail. e domínio, com SSL 993 antes de STARTTLS 143", () => {
    const p = palpitesServidor("brusque.sc.gov.br");
    expect(p[0]).toEqual({ host: "imap.brusque.sc.gov.br", port: 993, seguranca: "SSL" });
    expect(p[1]).toEqual({ host: "imap.brusque.sc.gov.br", port: 143, seguranca: "STARTTLS" });
    expect(p.map(c => c.host)).toContain("mail.brusque.sc.gov.br");
  });
  it("lê XML de autoconfiguração e descarta IMAP sem criptografia", () => {
    const xml = `<clientConfig><emailProvider>
      <incomingServer type="imap"><hostname>imap.x.org</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILLOCALPART%</username></incomingServer>
      <incomingServer type="imap"><hostname>plain.x.org</hostname><port>143</port><socketType>plain</socketType></incomingServer>
      <incomingServer type="pop3"><hostname>pop.x.org</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
    </emailProvider></clientConfig>`;
    expect(lerAutoconfigXml(xml)).toEqual([{ host: "imap.x.org", port: 993, seguranca: "SSL", usuario: "local" }]);
  });
  it("explica senha recusada e certificado sem repassar o texto do servidor", () => {
    expect(mensagemErroImap({ authenticationFailed: true, responseText: "senha-secreta" }, "h")).not.toContain("senha-secreta");
    expect(mensagemErroImap({ authenticationFailed: true }, "h")).toMatch(/recusou o usuário ou a senha/);
    expect(mensagemErroImap({ code: "ClosedAfterConnectTLS" }, "h")).toMatch(/encerrou a conexão/);
    expect(mensagemErroImap({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }, "imap.x.org")).toMatch(/certificado/);
  });
});
