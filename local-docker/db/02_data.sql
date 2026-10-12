--
-- PostgreSQL database dump
--

\restrict nHIa166ch3Ls9MLUPtYvchmXp7Qs5ruYUuxDlfEf31BeyoQcJwfNAZYbIs7VER4

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: ai_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ai_config (id, provider, api_key, model, updated_at, updated_by, grok_api_key, gemini_api_key, grok_model, gemini_model, lovable_model, priority) FROM stdin;
\.


--
-- Data for Name: allowed_emails; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.allowed_emails (id, email, nome, role, created_by, created_at, updated_at) FROM stdin;
13d708e5-c54a-48f7-8978-7d175a03049e	admin.fe1c4e@seta.local	Admin	admin	\N	2026-10-12 01:02:39.009232+00	2026-10-12 01:02:39.009232+00
\.


--
-- Data for Name: secretarias; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.secretarias (id, nome, sigla, created_at, updated_at, created_by, endereco, latitude, longitude, icone) FROM stdin;
\.


--
-- Data for Name: assuntos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.assuntos (id, nome, grupo, secretaria_id, ativo, created_at, updated_at, forcar_triagem) FROM stdin;
\.


--
-- Data for Name: coletas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coletas (id, executado_em, total, novos, sucesso, erro, duracao_ms, atualizados, ja_concluidos, sem_correspondencia, ignorados_detalhes, origem) FROM stdin;
\.


--
-- Data for Name: email_inbox_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_inbox_accounts (id, email, descricao, token, ativo, secretaria_id, created_by, created_at, updated_at, provider, ultima_sincronizacao, ultima_sync_novos, ultima_sync_erros, ultima_sync_processados, imap_host, imap_port, imap_user, imap_password, imap_tls) FROM stdin;
\.


--
-- Data for Name: locais; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.locais (id, secretaria_id, nome, created_at, updated_at, latitude, longitude) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, nome, email, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: secretaria_responsaveis; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.secretaria_responsaveis (id, secretaria_id, nome, email, telefone, tipo, ativo, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: protocolos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.protocolos (id, numero, tipo, assunto, descricao, status, secretaria_id, solicitante, data_abertura, prorrogado, data_prorrogacao, data_conclusao, created_by, created_at, updated_at, categoria, local_id, endereco, latitude, longitude, origem, sigilo, contato_solicitante, hash_consulta, ip_solicitante, lat_solicitante, lng_solicitante, triagem_pendente, triagem_concluida_em, triagem_concluida_por, triagem_lock_por, triagem_lock_em, url, detalhes, coletado_em, resolucao, responsavel_id) FROM stdin;
\.


--
-- Data for Name: email_inbox_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_inbox_log (id, account_id, remetente, destinatario, assunto, corpo, status, erro, protocolo_id, recebido_em, processado_em, external_id, ai_provider) FROM stdin;
\.


--
-- Data for Name: protocolo_historico; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.protocolo_historico (id, protocolo_id, campo, valor_anterior, valor_novo, acao, autor_id, autor_nome, created_at) FROM stdin;
\.


--
-- Data for Name: protocolos_antigos_conclusoes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.protocolos_antigos_conclusoes (id, source, numero, ano, url, data_conclusao, created_at, updated_at, resolucao) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_roles (id, user_id, role, created_at) FROM stdin;
\.


--
-- PostgreSQL database dump complete
--

\unrestrict nHIa166ch3Ls9MLUPtYvchmXp7Qs5ruYUuxDlfEf31BeyoQcJwfNAZYbIs7VER4

