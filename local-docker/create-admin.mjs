// Cria um admin no banco local. Uso: node create-admin.mjs email senha
const [email, password] = process.argv.slice(2);
const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email || !password || !key) {
  console.error("Uso: SUPABASE_SERVICE_ROLE_KEY=... node create-admin.mjs email senha");
  process.exit(1);
}
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
let r = await fetch(`${url}/rest/v1/allowed_emails`, {
  method: "POST", headers: { ...h, Prefer: "resolution=ignore-duplicates" },
  body: JSON.stringify({ email, nome: "Admin", role: "admin" }),
});
if (!r.ok) console.error("allowed_emails:", await r.text());
r = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST", headers: h,
  body: JSON.stringify({ email, password, email_confirm: true }),
});
console.log(r.ok ? `Admin criado: ${email}` : await r.text());
