import { z } from "zod";

export const imapConfigSchema = z.object({
  host: z.string().trim().min(1, "Informe o servidor IMAP").max(253)
    .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, "Informe o nome do servidor, sem https:// ou caminhos"),
  port: z.number().int().min(1).max(65535).default(993),
  user: z.string().trim().min(1, "Informe o usuário").max(320),
  pass: z.string().min(1, "Informe a senha").max(4096),
  usuariosAlternativos: z.array(z.string().trim().min(1).max(320)).max(3).default([]),
});
export type ImapConfig = z.infer<typeof imapConfigSchema>;
export const salvarImapSchema = imapConfigSchema.extend({
  email: z.string().trim().email().transform(v => v.toLowerCase()),
  descricao: z.string().max(500).default(""),
  secretariaId: z.string().uuid().nullable().default(null),
});