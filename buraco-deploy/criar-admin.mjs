/**
 * Cria o primeiro administrador do Buraco Brusque na instalação local.
 * Uso: node criar-admin.mjs <email> <senha>
 * Lê SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente.
 * Sem dependências: usa fetch do Node 18+.
 */
const [email, password] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!email || !password || !url || !key) {
  console.error("Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node criar-admin.mjs <email> <senha>");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// 1) cria a conta já confirmada
const res = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email, password, email_confirm: true }),
});
if (!res.ok) {
  const texto = await res.text();
  if (!/already|duplicate|exists/i.test(texto)) {
    console.error(`Falha ao criar usuário: ${texto}`);
    process.exit(1);
  }
}

// 2) autoriza o e-mail como administrador (o gatilho do banco concede o papel)
const res2 = await fetch(`${url}/rest/v1/admin_emails`, {
  method: "POST",
  headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify({ email: email.trim().toLowerCase() }),
});
if (!res2.ok) {
  console.error(`Falha ao autorizar e-mail: ${await res2.text()}`);
  process.exit(1);
}

console.log(`Administrador pronto: ${email}`);
