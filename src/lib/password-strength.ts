// Regra única de senha forte do OuviDesk.
// Uma senha forte exige TODOS os critérios; se faltar qualquer um, é fraca
// e não pode ser salva (validado na tela e no servidor).

export const SENHA_MIN_CARACTERES = 8;

export interface CriterioSenha {
  id: string;
  rotulo: string;
  atende: (senha: string) => boolean;
}

export const CRITERIOS_SENHA: CriterioSenha[] = [
  { id: "tamanho", rotulo: `Pelo menos ${SENHA_MIN_CARACTERES} caracteres`, atende: (s) => s.length >= SENHA_MIN_CARACTERES },
  { id: "maiuscula", rotulo: "Letra maiúscula (A-Z)", atende: (s) => /[A-Z]/.test(s) },
  { id: "minuscula", rotulo: "Letra minúscula (a-z)", atende: (s) => /[a-z]/.test(s) },
  { id: "numero", rotulo: "Número (0-9)", atende: (s) => /\d/.test(s) },
  { id: "especial", rotulo: "Caractere especial (!@#$...)", atende: (s) => /[^A-Za-z0-9]/.test(s) },
];

export interface ResultadoSenha {
  forte: boolean;
  faltando: string[];
  atendidos: number;
  total: number;
}

export function avaliarSenha(senha: string): ResultadoSenha {
  const faltando = CRITERIOS_SENHA.filter((c) => !c.atende(senha)).map((c) => c.rotulo);
  return {
    forte: faltando.length === 0,
    faltando,
    atendidos: CRITERIOS_SENHA.length - faltando.length,
    total: CRITERIOS_SENHA.length,
  };
}

export function senhaForte(senha: string): boolean {
  return avaliarSenha(senha).forte;
}

export const MENSAGEM_SENHA_FRACA =
  "Senha fraca: use pelo menos 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.";
