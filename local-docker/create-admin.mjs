// Cria um usuário (ou redefine a senha se já existir) no banco local.
// Uso: node create-admin.mjs email senha [admin|user] [Nome]
import { readFileSync } from "node:fs";

const [email, password, roleArg, nomeArg] = process.argv.slice(2);
const role = roleArg === "user" ? "user" : "admin";
let env = {};
try {
  for (const l of readFileSync(new URL("./.env.local", import.meta.url), "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
} catch {}
const url = process.env.SUPABASE_URL_HOST ?? "http://127.0.0.1:54321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !password || !key) {
  console.error("Uso: node create-admin.mjs email senha [admin|user] [Nome]");
  process.exit(1);
}
if (password.length < 6) { console.error("A senha precisa ter pelo menos 6 caracteres."); process.exit(1); }
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const nome = nomeArg || email.split("@")[0];

// 1. Autoriza o e-mail
let r = await fetch(`${url}/rest/v1/allowed_emails?on_conflict=email`, {
  method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ email: email.toLowerCase(), nome, role }),
});
if (!r.ok) console.error("Aviso (lista de e-mails):", await r.text());

// 2. Procura usuário existente
let userId = null;
for (let page = 1; page <= 20 && !userId; page++) {
  const lr = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: h });
  const j = await lr.json();
  const users = j.users ?? [];
  const u = users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (u) userId = u.id;
  if (users.length < 200) break;
}

if (userId) {
  r = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT", headers: h, body: JSON.stringify({ password, email_confirm: true }),
  });
  if (!r.ok) { console.error("Erro ao redefinir senha:", await r.text()); process.exit(1); }
  console.log(`Senha redefinida: ${email}`);
} else {
  r = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST", headers: h, body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const j = await r.json();
  if (!r.ok) { console.error("Erro ao criar usuário:", JSON.stringify(j)); process.exit(1); }
  userId = j.id;
  console.log(`Usuário criado: ${email}`);
}

// 3. Garante perfil e papel
await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
  method: "POST", headers: { ...h, Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ id: userId, nome, email }),
});
await fetch(`${url}/rest/v1/user_roles?on_conflict=user_id,role`, {
  method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates" },
  body: JSON.stringify({ user_id: userId, role }),
});
console.log(`Pronto! Perfil: ${role}. Já pode entrar no sistema.`);
