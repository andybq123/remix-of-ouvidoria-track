-- Corrige apenas os três rótulos conhecidos em assuntos cadastrados e títulos
-- de protocolo; não altera descrições, e-mails, nomes de pessoas ou histórico.
-- Idempotente e restrita aos campos usados para exibir/classificar assuntos.
DO $$
DECLARE
  alvo record;
  expressao text;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('assuntos', 'nome'),
      ('protocolos', 'assunto')
    ) AS campos(tabela, coluna)
  LOOP
    expressao := format('%I', alvo.coluna);
    expressao := format(
      'regexp_replace(%s, %L, %L, ''g'')',
      expressao,
      'Ilumina' || chr(65533) || '+o e Energia',
      'Iluminação e Energia'
    );
    expressao := format(
      'regexp_replace(%s, %L, %L, ''g'')',
      expressao,
      'IluminaÃ§Ã£o e Energia',
      'Iluminação e Energia'
    );
    expressao := format(
      'regexp_replace(%s, %L, %L, ''g'')',
      expressao,
      'Funcion' || chr(65533) || '+rios',
      'Funcionários'
    );
    expressao := format(
      'regexp_replace(%s, %L, %L, ''g'')',
      expressao,
      'FuncionÃ¡rios',
      'Funcionários'
    );
    expressao := format(
      'regexp_replace(%s, %L, %L, ''g'')',
      expressao,
      'p' || chr(65533) || '+blica',
      'pública'
    );
    expressao := format(
      'regexp_replace(%s, %L, %L, ''g'')',
      expressao,
      'pÃºblica',
      'pública'
    );

    EXECUTE format(
      'UPDATE public.%I SET %I = %s WHERE %I IS NOT NULL AND (strpos(%I, chr(65533)) > 0 OR strpos(%I, ''Ã'') > 0) AND %I <> %s',
      alvo.tabela,
      alvo.coluna,
      expressao,
      alvo.coluna,
      alvo.coluna,
      alvo.coluna,
      alvo.coluna,
      expressao
    );
  END LOOP;
END;
$$;
