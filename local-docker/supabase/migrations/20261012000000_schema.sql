create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: protocolo_categoria; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.protocolo_categoria AS ENUM (
    'elogio',
    'reclamacao',
    'pedido_informacao',
    'denuncia',
    'solicitacao',
    'outros',
    'sugestao'
);


--
-- Name: protocolo_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.protocolo_status AS ENUM (
    'aberto',
    'em_andamento',
    'concluido'
);


--
-- Name: protocolo_tipo; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.protocolo_tipo AS ENUM (
    'ouvidoria',
    'lai',
    'esic'
);


--
-- Name: concluir_triagem(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.concluir_triagem(p_id uuid, p_secretaria uuid, p_local uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unauth');
  END IF;
  IF p_secretaria IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_secretaria');
  END IF;

  UPDATE public.protocolos
  SET secretaria_id     = p_secretaria,
      local_id          = p_local,
      triagem_pendente  = false,
      triagem_lock_por  = NULL,
      triagem_lock_em   = NULL
  WHERE id = p_id
    AND triagem_pendente = true
    AND ( triagem_lock_por IS NULL
       OR triagem_lock_por = v_uid
       OR triagem_lock_em < now() - v_lock_expira )
  RETURNING id INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  SELECT p.triagem_pendente, p.triagem_lock_em, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário') AS lock_nome,
         COALESCE(pc.nome, 'outro usuário') AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF NOT v_row.triagem_pendente THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida',
      'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada',
    'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$$;


--
-- Name: concluir_triagem_admin(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.concluir_triagem_admin(p_id uuid, p_secretaria uuid, p_local uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;
  RETURN public.concluir_triagem(p_id, p_secretaria, p_local);
END; $$;


--
-- Name: consultar_protocolo_publico(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consultar_protocolo_publico(p_numero text, p_hash text) RETURNS TABLE(id uuid, numero text, tipo public.protocolo_tipo, categoria public.protocolo_categoria, status public.protocolo_status, assunto text, descricao text, solicitante text, sigilo text, contato_solicitante text, endereco text, latitude double precision, longitude double precision, origem text, data_abertura date, data_prorrogacao date, data_conclusao date, prorrogado boolean, created_at timestamp with time zone, updated_at timestamp with time zone, secretaria_nome text, local_nome text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH q AS (
    SELECT regexp_replace(upper(coalesce(p_numero, '')), '[^0-9/]', '', 'g') AS norm
  )
  SELECT p.id, p.numero, p.tipo, p.categoria, p.status, p.assunto, p.descricao,
         p.solicitante, p.sigilo, p.contato_solicitante, p.endereco,
         p.latitude, p.longitude, p.origem, p.data_abertura, p.data_prorrogacao,
         p.data_conclusao, p.prorrogado, p.created_at, p.updated_at,
         s.nome AS secretaria_nome,
         l.nome AS local_nome
  FROM public.protocolos p
  LEFT JOIN public.secretarias s ON s.id = p.secretaria_id
  LEFT JOIN public.locais l ON l.id = p.local_id
  CROSS JOIN q
  WHERE p.hash_consulta IS NOT NULL
    AND p.hash_consulta = p_hash
    AND (
      regexp_replace(upper(p.numero), '[^0-9/]', '', 'g') = q.norm
      OR split_part(regexp_replace(upper(p.numero), '[^0-9/]', '', 'g'), '/', 1) = q.norm
      OR regexp_replace(upper(p.numero), '[^0-9/]', '', 'g') LIKE q.norm || '/%'
    )
  LIMIT 1;
$$;


--
-- Name: force_triagem_para_ouvidoria(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.force_triagem_para_ouvidoria() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_assunto_norm text;
  v_forcar boolean := false;
  v_saude_triagem text[] := ARRAY[
    'demora em marcar consulta / procedimento',
    'falta de materiais em posto de saude',
    'falta de medicacao',
    'medicos',
    'postos de saude',
    'transporte para tratamento',
    'vacinas'
  ];
  v_termo text;
  v_casa_saude boolean := false;
  v_a_nome_norm text;
BEGIN
  IF TG_OP = 'INSERT'
     AND NEW.tipo = 'ouvidoria'
     AND auth.uid() IS NULL
  THEN
    v_assunto_norm := lower(translate(coalesce(NEW.assunto, ''),
      'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
      'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'));

    -- Assuntos marcados como forçar triagem no catálogo: usa "contém" para
    -- tolerar prefixos como "Ouvidoria 2.240/2026: <assunto>".
    FOR v_a_nome_norm IN
      SELECT lower(translate(a.nome,
        'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
        'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'))
      FROM public.assuntos a
      WHERE a.ativo = true AND a.forcar_triagem = true
    LOOP
      IF position(v_a_nome_norm in v_assunto_norm) > 0 THEN
        v_forcar := true;
        EXIT;
      END IF;
    END LOOP;

    FOREACH v_termo IN ARRAY v_saude_triagem LOOP
      IF position(v_termo in v_assunto_norm) > 0 THEN
        v_casa_saude := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_forcar
       OR NEW.secretaria_id IS NULL
       OR v_casa_saude
    THEN
      NEW.triagem_pendente := true;
    ELSE
      NEW.triagem_pendente := false;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_allowed public.allowed_emails%ROWTYPE;
BEGIN
  SELECT * INTO v_allowed FROM public.allowed_emails WHERE lower(email) = lower(NEW.email) LIMIT 1;
  IF v_allowed.id IS NULL THEN
    RAISE EXCEPTION 'Email % nao autorizado a acessar o sistema', NEW.email;
  END IF;
  INSERT INTO public.profiles (id, nome, email) VALUES (
    NEW.id,
    COALESCE(v_allowed.nome, NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_allowed.role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


--
-- Name: liberar_triagem(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liberar_triagem(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.protocolos
  SET triagem_lock_por = NULL, triagem_lock_em = NULL
  WHERE id = p_id
    AND (triagem_lock_por = auth.uid()
      OR public.has_role(auth.uid(), 'admin'));
END;
$$;


--
-- Name: liberar_triagem_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.liberar_triagem_admin(p_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    PERFORM public.liberar_triagem(p_id);
  END IF;
END; $$;


--
-- Name: log_protocolo_changes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_protocolo_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_uid uuid;
  v_nome text;
  campos text[] := ARRAY['numero','tipo','categoria','status','assunto','descricao','solicitante','secretaria_id','local_id','data_abertura','data_conclusao','data_prorrogacao','prorrogado','triagem_pendente'];
  campo text;
  v_old text;
  v_new text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT nome INTO v_nome FROM public.profiles WHERE id = v_uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.protocolo_historico(protocolo_id, campo, valor_anterior, valor_novo, acao, autor_id, autor_nome)
    VALUES (NEW.id, '_criacao', NULL, NEW.numero, 'create', v_uid, v_nome);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    FOREACH campo IN ARRAY campos LOOP
      EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', campo, campo)
        INTO v_old, v_new USING OLD, NEW;
      IF v_old IS DISTINCT FROM v_new THEN
        INSERT INTO public.protocolo_historico(protocolo_id, campo, valor_anterior, valor_novo, acao, autor_id, autor_nome)
        VALUES (NEW.id, campo, v_old, v_new, 'update', v_uid, v_nome);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: reservar_triagem(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_triagem(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lock_expira interval := interval '10 minutes';
  v_updated record;
  v_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'unauth');
  END IF;

  UPDATE public.protocolos
  SET triagem_lock_por = v_uid,
      triagem_lock_em  = now()
  WHERE id = p_id
    AND triagem_pendente = true
    AND ( triagem_lock_por IS NULL
       OR triagem_lock_por = v_uid
       OR triagem_lock_em < now() - v_lock_expira )
  RETURNING id, triagem_lock_em INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lock_em', v_updated.triagem_lock_em);
  END IF;

  SELECT p.triagem_pendente, p.triagem_lock_por, p.triagem_lock_em,
         p.triagem_concluida_por, p.triagem_concluida_em,
         COALESCE(pl.nome, 'outro usuário')  AS lock_nome,
         COALESCE(pc.nome, 'outro usuário')  AS concluida_nome
    INTO v_row
  FROM public.protocolos p
  LEFT JOIN public.profiles pl ON pl.id = p.triagem_lock_por
  LEFT JOIN public.profiles pc ON pc.id = p.triagem_concluida_por
  WHERE p.id = p_id;

  IF v_row.triagem_pendente = false THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'concluida',
      'por', v_row.concluida_nome, 'em', v_row.triagem_concluida_em);
  END IF;
  RETURN jsonb_build_object('ok', false, 'motivo', 'reservada',
    'por', v_row.lock_nome, 'em', v_row.triagem_lock_em);
END;
$$;


--
-- Name: reservar_triagem_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reservar_triagem_admin(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'forbidden');
  END IF;
  RETURN public.reservar_triagem(p_id);
END; $$;


--
-- Name: stamp_triagem_conclusao(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_triagem_conclusao() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.triagem_pendente = true AND NEW.triagem_pendente = false THEN
    NEW.triagem_concluida_em := COALESCE(NEW.triagem_concluida_em, now());
    NEW.triagem_concluida_por := COALESCE(NEW.triagem_concluida_por, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_config (
    id boolean DEFAULT true NOT NULL,
    provider text DEFAULT 'lovable'::text NOT NULL,
    api_key text,
    model text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    grok_api_key text,
    gemini_api_key text,
    grok_model text,
    gemini_model text,
    lovable_model text,
    priority text[] DEFAULT ARRAY['lovable'::text, 'gemini'::text, 'grok'::text] NOT NULL,
    CONSTRAINT ai_config_id_check CHECK ((id = true)),
    CONSTRAINT ai_config_provider_check CHECK ((provider = ANY (ARRAY['lovable'::text, 'gemini'::text])))
);


--
-- Name: allowed_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.allowed_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    nome text,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assuntos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assuntos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    grupo text,
    secretaria_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    forcar_triagem boolean DEFAULT false NOT NULL
);


--
-- Name: coletas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coletas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    executado_em timestamp with time zone DEFAULT now() NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    novos integer DEFAULT 0 NOT NULL,
    sucesso boolean DEFAULT true NOT NULL,
    erro text,
    duracao_ms integer,
    atualizados integer DEFAULT 0 NOT NULL,
    ja_concluidos integer DEFAULT 0 NOT NULL,
    sem_correspondencia integer DEFAULT 0 NOT NULL,
    ignorados_detalhes jsonb DEFAULT '[]'::jsonb NOT NULL,
    origem text DEFAULT 'extensao'::text NOT NULL
);


--
-- Name: email_inbox_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_inbox_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    descricao text,
    token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    secretaria_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'webhook'::text NOT NULL,
    ultima_sincronizacao timestamp with time zone,
    ultima_sync_novos integer DEFAULT 0 NOT NULL,
    ultima_sync_erros integer DEFAULT 0 NOT NULL,
    ultima_sync_processados integer DEFAULT 0 NOT NULL,
    imap_host text,
    imap_port integer DEFAULT 993,
    imap_user text,
    imap_password text,
    imap_tls boolean DEFAULT true
);


--
-- Name: email_inbox_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_inbox_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    remetente text,
    destinatario text,
    assunto text,
    corpo text,
    status text DEFAULT 'pendente'::text NOT NULL,
    erro text,
    protocolo_id uuid,
    recebido_em timestamp with time zone DEFAULT now() NOT NULL,
    processado_em timestamp with time zone,
    external_id text,
    ai_provider text
);


--
-- Name: locais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secretaria_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    latitude double precision,
    longitude double precision
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    nome text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: protocolo_historico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protocolo_historico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    protocolo_id uuid NOT NULL,
    campo text NOT NULL,
    valor_anterior text,
    valor_novo text,
    acao text DEFAULT 'update'::text NOT NULL,
    autor_id uuid,
    autor_nome text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: protocolos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protocolos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    tipo public.protocolo_tipo NOT NULL,
    assunto text NOT NULL,
    descricao text,
    status public.protocolo_status DEFAULT 'em_andamento'::public.protocolo_status NOT NULL,
    secretaria_id uuid,
    solicitante text,
    data_abertura date DEFAULT CURRENT_DATE NOT NULL,
    prorrogado boolean DEFAULT false NOT NULL,
    data_prorrogacao date,
    data_conclusao date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    categoria public.protocolo_categoria DEFAULT 'solicitacao'::public.protocolo_categoria NOT NULL,
    local_id uuid,
    endereco text,
    latitude double precision,
    longitude double precision,
    origem text,
    sigilo text DEFAULT 'publico'::text NOT NULL,
    contato_solicitante text,
    hash_consulta text,
    ip_solicitante text,
    lat_solicitante double precision,
    lng_solicitante double precision,
    triagem_pendente boolean DEFAULT false NOT NULL,
    triagem_concluida_em timestamp with time zone,
    triagem_concluida_por uuid,
    triagem_lock_por uuid,
    triagem_lock_em timestamp with time zone,
    url text,
    detalhes jsonb,
    coletado_em timestamp with time zone,
    resolucao text,
    responsavel_id uuid,
    CONSTRAINT protocolos_sigilo_check CHECK ((sigilo = ANY (ARRAY['publico'::text, 'sigiloso'::text, 'anonimo'::text])))
);

ALTER TABLE ONLY public.protocolos REPLICA IDENTITY FULL;


--
-- Name: protocolos_antigos_conclusoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.protocolos_antigos_conclusoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    numero integer NOT NULL,
    ano integer NOT NULL,
    url text,
    data_conclusao date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolucao text
);


--
-- Name: secretaria_responsaveis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secretaria_responsaveis (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secretaria_id uuid NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    tipo text DEFAULT 'principal'::text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: secretarias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.secretarias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nome text NOT NULL,
    sigla text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    endereco text,
    latitude double precision,
    longitude double precision,
    icone text
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_config ai_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_config
    ADD CONSTRAINT ai_config_pkey PRIMARY KEY (id);


--
-- Name: allowed_emails allowed_emails_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_emails
    ADD CONSTRAINT allowed_emails_email_key UNIQUE (email);


--
-- Name: allowed_emails allowed_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_emails
    ADD CONSTRAINT allowed_emails_pkey PRIMARY KEY (id);


--
-- Name: assuntos assuntos_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assuntos
    ADD CONSTRAINT assuntos_nome_key UNIQUE (nome);


--
-- Name: assuntos assuntos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assuntos
    ADD CONSTRAINT assuntos_pkey PRIMARY KEY (id);


--
-- Name: coletas coletas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coletas
    ADD CONSTRAINT coletas_pkey PRIMARY KEY (id);


--
-- Name: email_inbox_accounts email_inbox_accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_accounts
    ADD CONSTRAINT email_inbox_accounts_email_key UNIQUE (email);


--
-- Name: email_inbox_accounts email_inbox_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_accounts
    ADD CONSTRAINT email_inbox_accounts_pkey PRIMARY KEY (id);


--
-- Name: email_inbox_accounts email_inbox_accounts_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_accounts
    ADD CONSTRAINT email_inbox_accounts_token_key UNIQUE (token);


--
-- Name: email_inbox_log email_inbox_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_log
    ADD CONSTRAINT email_inbox_log_pkey PRIMARY KEY (id);


--
-- Name: locais locais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locais
    ADD CONSTRAINT locais_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: protocolo_historico protocolo_historico_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolo_historico
    ADD CONSTRAINT protocolo_historico_pkey PRIMARY KEY (id);


--
-- Name: protocolos_antigos_conclusoes protocolos_antigos_conclusoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos_antigos_conclusoes
    ADD CONSTRAINT protocolos_antigos_conclusoes_pkey PRIMARY KEY (id);


--
-- Name: protocolos_antigos_conclusoes protocolos_antigos_conclusoes_source_numero_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos_antigos_conclusoes
    ADD CONSTRAINT protocolos_antigos_conclusoes_source_numero_ano_key UNIQUE (source, numero, ano);


--
-- Name: protocolos protocolos_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_numero_key UNIQUE (numero);


--
-- Name: protocolos protocolos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_pkey PRIMARY KEY (id);


--
-- Name: secretaria_responsaveis secretaria_responsaveis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretaria_responsaveis
    ADD CONSTRAINT secretaria_responsaveis_pkey PRIMARY KEY (id);


--
-- Name: secretarias secretarias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretarias
    ADD CONSTRAINT secretarias_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: email_inbox_log_account_external_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX email_inbox_log_account_external_id_key ON public.email_inbox_log USING btree (account_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_assuntos_secretaria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assuntos_secretaria ON public.assuntos USING btree (secretaria_id);


--
-- Name: idx_coletas_executado_em; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coletas_executado_em ON public.coletas USING btree (executado_em DESC);


--
-- Name: idx_email_inbox_log_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_inbox_log_account ON public.email_inbox_log USING btree (account_id);


--
-- Name: idx_email_inbox_log_recebido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_inbox_log_recebido ON public.email_inbox_log USING btree (recebido_em DESC);


--
-- Name: idx_locais_secretaria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_locais_secretaria ON public.locais USING btree (secretaria_id);


--
-- Name: idx_protocolo_historico_protocolo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolo_historico_protocolo ON public.protocolo_historico USING btree (protocolo_id, created_at DESC);


--
-- Name: idx_protocolos_assunto_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_assunto_trgm ON public.protocolos USING gin (assunto public.gin_trgm_ops);


--
-- Name: idx_protocolos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_categoria ON public.protocolos USING btree (categoria);


--
-- Name: idx_protocolos_data_abertura; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_data_abertura ON public.protocolos USING btree (data_abertura);


--
-- Name: idx_protocolos_data_conclusao; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_data_conclusao ON public.protocolos USING btree (data_conclusao);


--
-- Name: idx_protocolos_descricao_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_descricao_trgm ON public.protocolos USING gin (descricao public.gin_trgm_ops);


--
-- Name: idx_protocolos_hash_consulta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_hash_consulta ON public.protocolos USING btree (hash_consulta);


--
-- Name: idx_protocolos_lista_principal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_lista_principal ON public.protocolos USING btree (triagem_pendente, data_abertura DESC);


--
-- Name: idx_protocolos_local; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_local ON public.protocolos USING btree (local_id);


--
-- Name: idx_protocolos_nao_antigos; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_nao_antigos ON public.protocolos USING btree (data_abertura DESC) WHERE ((origem IS NULL) OR (origem !~~ 'antigo:%'::text));


--
-- Name: idx_protocolos_numero_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_numero_trgm ON public.protocolos USING gin (numero public.gin_trgm_ops);


--
-- Name: idx_protocolos_origem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_origem ON public.protocolos USING btree (origem);


--
-- Name: idx_protocolos_origem_antigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_origem_antigo ON public.protocolos USING btree (data_abertura DESC) WHERE (origem ~~ 'antigo:%'::text);


--
-- Name: idx_protocolos_responsavel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_responsavel ON public.protocolos USING btree (responsavel_id);


--
-- Name: idx_protocolos_secretaria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_secretaria ON public.protocolos USING btree (secretaria_id);


--
-- Name: idx_protocolos_solicitante_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_solicitante_trgm ON public.protocolos USING gin (solicitante public.gin_trgm_ops);


--
-- Name: idx_protocolos_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_status ON public.protocolos USING btree (status);


--
-- Name: idx_protocolos_status_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_status_data ON public.protocolos USING btree (status, data_abertura DESC);


--
-- Name: idx_protocolos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_tipo ON public.protocolos USING btree (tipo);


--
-- Name: idx_protocolos_tipo_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_tipo_categoria ON public.protocolos USING btree (tipo, categoria);


--
-- Name: idx_protocolos_triagem_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_protocolos_triagem_pendente ON public.protocolos USING btree (triagem_pendente) WHERE (triagem_pendente = true);


--
-- Name: idx_secretaria_responsaveis_sec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_secretaria_responsaveis_sec ON public.secretaria_responsaveis USING btree (secretaria_id) WHERE ativo;


--
-- Name: protocolos_numero_normalizado_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX protocolos_numero_normalizado_key ON public.protocolos USING btree (regexp_replace(numero, '[^0-9/]'::text, ''::text, 'g'::text));


--
-- Name: assuntos trg_assuntos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_assuntos_updated_at BEFORE UPDATE ON public.assuntos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_inbox_accounts trg_email_inbox_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_email_inbox_accounts_updated_at BEFORE UPDATE ON public.email_inbox_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: protocolos trg_force_triagem_ouvidoria; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_force_triagem_ouvidoria BEFORE INSERT ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.force_triagem_para_ouvidoria();


--
-- Name: protocolos trg_log_protocolo_changes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_protocolo_changes AFTER INSERT OR UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.log_protocolo_changes();


--
-- Name: secretaria_responsaveis trg_secretaria_responsaveis_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_secretaria_responsaveis_updated_at BEFORE UPDATE ON public.secretaria_responsaveis FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: protocolos trg_stamp_triagem_conclusao; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stamp_triagem_conclusao BEFORE UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.stamp_triagem_conclusao();


--
-- Name: allowed_emails update_allowed_emails_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_allowed_emails_updated_at BEFORE UPDATE ON public.allowed_emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: locais update_locais_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_locais_updated_at BEFORE UPDATE ON public.locais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: protocolos_antigos_conclusoes update_protocolos_antigos_conclusoes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_protocolos_antigos_conclusoes_updated_at BEFORE UPDATE ON public.protocolos_antigos_conclusoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: protocolos update_protocolos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_protocolos_updated_at BEFORE UPDATE ON public.protocolos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: secretarias update_secretarias_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_secretarias_updated_at BEFORE UPDATE ON public.secretarias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: allowed_emails allowed_emails_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.allowed_emails
    ADD CONSTRAINT allowed_emails_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: assuntos assuntos_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assuntos
    ADD CONSTRAINT assuntos_secretaria_id_fkey FOREIGN KEY (secretaria_id) REFERENCES public.secretarias(id) ON DELETE SET NULL;


--
-- Name: email_inbox_accounts email_inbox_accounts_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_accounts
    ADD CONSTRAINT email_inbox_accounts_secretaria_id_fkey FOREIGN KEY (secretaria_id) REFERENCES public.secretarias(id) ON DELETE SET NULL;


--
-- Name: email_inbox_log email_inbox_log_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_log
    ADD CONSTRAINT email_inbox_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.email_inbox_accounts(id) ON DELETE SET NULL;


--
-- Name: email_inbox_log email_inbox_log_protocolo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_inbox_log
    ADD CONSTRAINT email_inbox_log_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos(id) ON DELETE SET NULL;


--
-- Name: locais locais_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locais
    ADD CONSTRAINT locais_secretaria_id_fkey FOREIGN KEY (secretaria_id) REFERENCES public.secretarias(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: protocolo_historico protocolo_historico_protocolo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolo_historico
    ADD CONSTRAINT protocolo_historico_protocolo_id_fkey FOREIGN KEY (protocolo_id) REFERENCES public.protocolos(id) ON DELETE CASCADE;


--
-- Name: protocolos protocolos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: protocolos protocolos_local_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_local_id_fkey FOREIGN KEY (local_id) REFERENCES public.locais(id) ON DELETE SET NULL;


--
-- Name: protocolos protocolos_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.secretaria_responsaveis(id) ON DELETE SET NULL;


--
-- Name: protocolos protocolos_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_secretaria_id_fkey FOREIGN KEY (secretaria_id) REFERENCES public.secretarias(id) ON DELETE SET NULL;


--
-- Name: protocolos protocolos_triagem_concluida_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_triagem_concluida_por_fkey FOREIGN KEY (triagem_concluida_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: protocolos protocolos_triagem_lock_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.protocolos
    ADD CONSTRAINT protocolos_triagem_lock_por_fkey FOREIGN KEY (triagem_lock_por) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: secretaria_responsaveis secretaria_responsaveis_secretaria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretaria_responsaveis
    ADD CONSTRAINT secretaria_responsaveis_secretaria_id_fkey FOREIGN KEY (secretaria_id) REFERENCES public.secretarias(id) ON DELETE CASCADE;


--
-- Name: secretarias secretarias_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.secretarias
    ADD CONSTRAINT secretarias_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: protocolos_antigos_conclusoes Admins atualizam conclusoes antigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins atualizam conclusoes antigos" ON public.protocolos_antigos_conclusoes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: protocolos Admins atualizam protocolos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins atualizam protocolos" ON public.protocolos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins atualizam roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins atualizam roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: assuntos Admins gerenciam assuntos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam assuntos" ON public.assuntos TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_inbox_accounts Admins gerenciam contas de email; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam contas de email" ON public.email_inbox_accounts TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: locais Admins gerenciam locais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam locais" ON public.locais TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: secretaria_responsaveis Admins gerenciam responsaveis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam responsaveis" ON public.secretaria_responsaveis TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: secretarias Admins gerenciam secretarias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins gerenciam secretarias" ON public.secretarias TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: protocolos_antigos_conclusoes Admins inserem conclusoes antigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins inserem conclusoes antigos" ON public.protocolos_antigos_conclusoes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: protocolos Admins inserem protocolos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins inserem protocolos" ON public.protocolos FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins inserem roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins inserem roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_inbox_log Admins leem log de emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins leem log de emails" ON public.email_inbox_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: ai_config Admins manage ai_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage ai_config" ON public.ai_config TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: allowed_emails Admins manage allowed emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage allowed emails" ON public.allowed_emails TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: protocolos_antigos_conclusoes Admins removem conclusoes antigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins removem conclusoes antigos" ON public.protocolos_antigos_conclusoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: email_inbox_log Admins removem log de emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins removem log de emails" ON public.email_inbox_log FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: protocolos Admins removem protocolos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins removem protocolos" ON public.protocolos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins removem roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins removem roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: locais Anon le locais publicos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon le locais publicos" ON public.locais FOR SELECT TO anon USING (true);


--
-- Name: secretarias Anon le secretarias publicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon le secretarias publicas" ON public.secretarias FOR SELECT TO anon USING (true);


--
-- Name: protocolos Anon pode registrar ouvidoria publica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anon pode registrar ouvidoria publica" ON public.protocolos FOR INSERT TO anon WITH CHECK (((tipo = 'ouvidoria'::public.protocolo_tipo) AND (status = 'aberto'::public.protocolo_status) AND (created_by IS NULL) AND (origem IS NOT NULL)));


--
-- Name: protocolos Anyone can submit ouvidoria from public form; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit ouvidoria from public form" ON public.protocolos FOR INSERT TO authenticated, anon WITH CHECK (((tipo = 'ouvidoria'::public.protocolo_tipo) AND (origem = 'Site - Ouvidoria Pública'::text) AND (created_by IS NULL)));


--
-- Name: assuntos Autenticados leem assuntos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Autenticados leem assuntos" ON public.assuntos FOR SELECT TO authenticated USING (true);


--
-- Name: protocolos_antigos_conclusoes Autenticados leem conclusoes antigos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Autenticados leem conclusoes antigos" ON public.protocolos_antigos_conclusoes FOR SELECT TO authenticated USING (true);


--
-- Name: protocolos Autenticados leem protocolos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Autenticados leem protocolos" ON public.protocolos FOR SELECT TO authenticated USING (((auth.uid() IS NOT NULL) AND ((sigilo = 'publico'::text) OR public.has_role(auth.uid(), 'admin'::public.app_role))));


--
-- Name: secretaria_responsaveis Autenticados leem responsaveis; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Autenticados leem responsaveis" ON public.secretaria_responsaveis FOR SELECT TO authenticated USING (true);


--
-- Name: coletas Autenticados podem ler coletas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Autenticados podem ler coletas" ON public.coletas FOR SELECT TO authenticated USING (true);


--
-- Name: protocolo_historico Leitura historico admin ou publico; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leitura historico admin ou publico" ON public.protocolo_historico FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR (EXISTS ( SELECT 1
   FROM public.protocolos p
  WHERE ((p.id = protocolo_historico.protocolo_id) AND (p.sigilo = 'publico'::text))))));


--
-- Name: user_roles Users see own or admin sees all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own or admin sees all" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Usuario edita seu proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuario edita seu proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Usuario insere seu proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuario insere seu proprio perfil" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Usuario le seu proprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuario le seu proprio perfil" ON public.profiles FOR SELECT TO authenticated USING (((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: ai_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

--
-- Name: allowed_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: assuntos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assuntos ENABLE ROW LEVEL SECURITY;

--
-- Name: coletas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coletas ENABLE ROW LEVEL SECURITY;

--
-- Name: email_inbox_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_inbox_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: email_inbox_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_inbox_log ENABLE ROW LEVEL SECURITY;

--
-- Name: locais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: protocolo_historico; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.protocolo_historico ENABLE ROW LEVEL SECURITY;

--
-- Name: protocolos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.protocolos ENABLE ROW LEVEL SECURITY;

--
-- Name: protocolos_antigos_conclusoes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.protocolos_antigos_conclusoes ENABLE ROW LEVEL SECURITY;

--
-- Name: secretaria_responsaveis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secretaria_responsaveis ENABLE ROW LEVEL SECURITY;

--
-- Name: secretarias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.secretarias ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



-- Gatilho de cadastro (cria perfil e papel a partir de allowed_emails)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant select on public.secretarias, public.locais to anon;
grant execute on all functions in schema public to authenticated, service_role;
