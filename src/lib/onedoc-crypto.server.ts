// Cifra a senha do 1Doc com AES-GCM. A chave deriva do service role key,
// que só o servidor e o agente da VPS conhecem. Formato: base64(iv).base64(dados)
async function chave() {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Chave de servidor ausente");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("onedoc:" + base));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

export async function cifrarSenha(senha: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chave(), new TextEncoder().encode(senha));
  return `${b64(iv)}.${b64(new Uint8Array(enc))}`;
}
