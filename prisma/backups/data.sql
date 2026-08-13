SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict wutzR88XgcUssDAsnZFFXuTpeidIBIsSro38nkHKin5XG0EEutUlc9PrQh3OBmc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

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
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") FROM stdin;
\.


--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."custom_oauth_providers" ("id", "provider_type", "identifier", "name", "client_id", "client_secret", "acceptable_client_ids", "scopes", "pkce_enabled", "attribute_mapping", "authorization_params", "enabled", "email_optional", "issuer", "discovery_url", "skip_nonce_check", "cached_discovery", "discovery_cached_at", "authorization_url", "token_url", "userinfo_url", "jwks_uri", "created_at", "updated_at", "custom_claims_allowlist") FROM stdin;
\.


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") FROM stdin;
00000000-0000-0000-0000-000000000000	090cd507-9bfe-4bb4-84c9-16c9075fff8a	authenticated	authenticated	amir@gmail.com	$2a$10$Zqj3tJKzw3aMeCSJTHv9o.A/McoI86KDx9rVmEmSZa3z9Ya29nAdS	2026-07-25 04:48:00.107469+00	\N		\N		\N			\N	2026-08-08 08:04:58.814079+00	{"provider": "email", "providers": ["email"]}	{"sub": "090cd507-9bfe-4bb4-84c9-16c9075fff8a", "email": "amir@gmail.com", "full_name": "Amir", "email_verified": true, "phone_verified": false}	\N	2026-07-25 04:48:00.090126+00	2026-08-08 08:04:58.840279+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	7ef56478-5844-46b5-8dfe-831297dca49e	authenticated	authenticated	customer1@gmail.com	$2a$10$Xo6rIwLtkHPKToH/ckL4nO5Ue7hiEvee7rOLhBS.Gj4FZtsz7eJEm	2026-07-18 04:13:40.780702+00	\N		\N		\N			\N	2026-08-10 11:10:48.685162+00	{"provider": "email", "providers": ["email"]}	{"sub": "7ef56478-5844-46b5-8dfe-831297dca49e", "email": "customer1@gmail.com", "full_name": "Customer1", "email_verified": true, "phone_verified": false}	\N	2026-07-18 04:13:40.757785+00	2026-08-10 11:10:48.702666+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	d2ca418a-680e-480c-9b86-e734a4a8f796	authenticated	authenticated	nik@gmail.com	$2a$10$BdKO1vA.XiYjDYLCW6NCZuwnf0PFK1rQK2rAB97u3vSfeodQkRiqG	2026-08-03 11:14:34.410934+00	\N		\N		\N			\N	2026-08-09 12:42:19.350641+00	{"provider": "email", "providers": ["email"]}	{"sub": "d2ca418a-680e-480c-9b86-e734a4a8f796", "email": "nik@gmail.com", "full_name": "Nik", "email_verified": true, "phone_verified": false}	\N	2026-08-03 11:14:34.383103+00	2026-08-09 12:42:19.399468+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	15368da1-d7e4-4c8a-8dc4-5e6988c955d3	authenticated	authenticated	cust3@gmail.com	$2a$10$Rrdx6ErMBslO6XTglUj7/ugDGb5mNQwoyIVFh1psgiThTCasKTGBi	2026-07-23 13:39:20.203526+00	\N		\N		\N			\N	2026-08-10 11:12:54.932995+00	{"provider": "email", "providers": ["email"]}	{"sub": "15368da1-d7e4-4c8a-8dc4-5e6988c955d3", "email": "cust3@gmail.com", "full_name": "customer 3", "email_verified": true, "phone_verified": false}	\N	2026-07-23 13:39:20.185543+00	2026-08-10 11:12:54.9394+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	74fb8cd1-0135-40e3-8840-b7062b0c7048	authenticated	authenticated	ali@gmail.com	$2a$10$W8Eh4LgA9IFTUKNVW/F5mupT3vFR5saZO8754a92g/56louusQ4ne	2026-07-25 01:38:08.663899+00	\N		\N		\N			\N	2026-08-12 16:23:45.440787+00	{"provider": "email", "providers": ["email"]}	{"sub": "74fb8cd1-0135-40e3-8840-b7062b0c7048", "email": "ali@gmail.com", "full_name": "Alif", "email_verified": true, "phone_verified": false}	\N	2026-07-25 01:38:08.64651+00	2026-08-12 16:23:45.455498+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	45938e83-d40a-411a-93bc-3134d97aadca	authenticated	authenticated	supplier@gmail.com	$2a$10$waU11ndWk8CcjNIxEmnn9eL5lkJankylM4QFc2n0.T5EQD9SkBW4q	2026-07-18 04:15:33.922827+00	\N		\N		\N			\N	2026-08-12 16:26:06.006581+00	{"provider": "email", "providers": ["email"]}	{"sub": "45938e83-d40a-411a-93bc-3134d97aadca", "email": "supplier@gmail.com", "full_name": "supplier", "email_verified": true, "phone_verified": false}	\N	2026-07-18 04:15:33.912725+00	2026-08-12 16:26:06.014113+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	b98b5fc8-3940-49dc-95b2-acc4e2420337	authenticated	authenticated	csmin92@gmail.com	$2a$10$2c2EfZgfuRZldo3j0bHf9OWemxTEUr.9xZOhsIjD0TMrQ/jGcavfm	2026-07-17 14:28:15.153325+00	\N		\N		\N			\N	2026-08-13 13:29:43.005421+00	{"provider": "email", "providers": ["email"]}	{"sub": "b98b5fc8-3940-49dc-95b2-acc4e2420337", "email": "csmin92@gmail.com", "full_name": "Amin Adnan", "email_verified": true, "phone_verified": false}	\N	2026-07-17 14:28:15.136859+00	2026-08-13 16:24:21.350317+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	866d6f46-416e-4ad0-a7f0-bae5bf9ced71	authenticated	authenticated	muhamad.amin.a.adnan@gmail.com	$2a$10$3ohOOw4gvrARfLokYvkqq.oOCVD5b1gDW6nYvVULaRVmZzfAB7aG.	2026-07-17 15:31:13.676706+00	\N		\N		\N			\N	2026-07-18 03:56:23.468776+00	{"provider": "email", "providers": ["email"]}	{"sub": "866d6f46-416e-4ad0-a7f0-bae5bf9ced71", "email": "muhamad.amin.a.adnan@gmail.com", "full_name": "Amin Adnan 2", "email_verified": true, "phone_verified": false}	\N	2026-07-17 15:31:13.664403+00	2026-07-18 03:56:23.483873+00	\N	\N			\N		0	\N		\N	f	\N	f
00000000-0000-0000-0000-000000000000	3bafb164-c03b-4944-af60-10bfe24709a6	authenticated	authenticated	customer2@gmail.com	$2a$10$U71wXiyPgGFz6c9CB3ECWeinUF7174TJ.PFhhr8LDjBpy/im0giYm	2026-07-18 05:17:29.773949+00	\N		\N		\N			\N	2026-07-26 05:30:06.051832+00	{"provider": "email", "providers": ["email"]}	{"sub": "3bafb164-c03b-4944-af60-10bfe24709a6", "email": "customer2@gmail.com", "full_name": "customer2", "email_verified": true, "phone_verified": false}	\N	2026-07-18 05:17:29.752076+00	2026-07-26 05:30:06.074094+00	\N	\N			\N		0	\N		\N	f	\N	f
\.


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") FROM stdin;
b98b5fc8-3940-49dc-95b2-acc4e2420337	b98b5fc8-3940-49dc-95b2-acc4e2420337	{"sub": "b98b5fc8-3940-49dc-95b2-acc4e2420337", "email": "csmin92@gmail.com", "full_name": "Amin Adnan", "email_verified": false, "phone_verified": false}	email	2026-07-17 14:28:15.148372+00	2026-07-17 14:28:15.148421+00	2026-07-17 14:28:15.148421+00	ec7199cb-2466-444f-bf82-6b849194d4d5
866d6f46-416e-4ad0-a7f0-bae5bf9ced71	866d6f46-416e-4ad0-a7f0-bae5bf9ced71	{"sub": "866d6f46-416e-4ad0-a7f0-bae5bf9ced71", "email": "muhamad.amin.a.adnan@gmail.com", "full_name": "Amin Adnan 2", "email_verified": false, "phone_verified": false}	email	2026-07-17 15:31:13.672736+00	2026-07-17 15:31:13.672785+00	2026-07-17 15:31:13.672785+00	f8d1114a-0108-40a8-9f49-a7c1f14e4b45
7ef56478-5844-46b5-8dfe-831297dca49e	7ef56478-5844-46b5-8dfe-831297dca49e	{"sub": "7ef56478-5844-46b5-8dfe-831297dca49e", "email": "customer1@gmail.com", "full_name": "Customer1", "email_verified": false, "phone_verified": false}	email	2026-07-18 04:13:40.773945+00	2026-07-18 04:13:40.774001+00	2026-07-18 04:13:40.774001+00	a57c9883-85ad-4203-9ce8-067424662eb1
45938e83-d40a-411a-93bc-3134d97aadca	45938e83-d40a-411a-93bc-3134d97aadca	{"sub": "45938e83-d40a-411a-93bc-3134d97aadca", "email": "supplier@gmail.com", "full_name": "supplier", "email_verified": false, "phone_verified": false}	email	2026-07-18 04:15:33.918343+00	2026-07-18 04:15:33.918402+00	2026-07-18 04:15:33.918402+00	23d44386-6eae-402a-b879-41e81fb7bc2f
3bafb164-c03b-4944-af60-10bfe24709a6	3bafb164-c03b-4944-af60-10bfe24709a6	{"sub": "3bafb164-c03b-4944-af60-10bfe24709a6", "email": "customer2@gmail.com", "full_name": "customer2", "email_verified": false, "phone_verified": false}	email	2026-07-18 05:17:29.769298+00	2026-07-18 05:17:29.769358+00	2026-07-18 05:17:29.769358+00	7f6c3ece-1fc3-40b8-a4fc-502df41a9bd7
15368da1-d7e4-4c8a-8dc4-5e6988c955d3	15368da1-d7e4-4c8a-8dc4-5e6988c955d3	{"sub": "15368da1-d7e4-4c8a-8dc4-5e6988c955d3", "email": "cust3@gmail.com", "full_name": "customer 3", "email_verified": false, "phone_verified": false}	email	2026-07-23 13:39:20.197883+00	2026-07-23 13:39:20.197944+00	2026-07-23 13:39:20.197944+00	ebcde8ee-acf9-4832-90f4-584fd4a4a87d
74fb8cd1-0135-40e3-8840-b7062b0c7048	74fb8cd1-0135-40e3-8840-b7062b0c7048	{"sub": "74fb8cd1-0135-40e3-8840-b7062b0c7048", "email": "ali@gmail.com", "full_name": "Ali", "email_verified": false, "phone_verified": false}	email	2026-07-25 01:38:08.659405+00	2026-07-25 01:38:08.659456+00	2026-07-25 01:38:08.659456+00	0c11b1e5-e7f3-4069-aa38-d68671d76d19
090cd507-9bfe-4bb4-84c9-16c9075fff8a	090cd507-9bfe-4bb4-84c9-16c9075fff8a	{"sub": "090cd507-9bfe-4bb4-84c9-16c9075fff8a", "email": "amir@gmail.com", "full_name": "Amir", "email_verified": false, "phone_verified": false}	email	2026-07-25 04:48:00.101247+00	2026-07-25 04:48:00.101297+00	2026-07-25 04:48:00.101297+00	79c59f6d-e973-4a82-a9b0-f2e33d22a94e
d2ca418a-680e-480c-9b86-e734a4a8f796	d2ca418a-680e-480c-9b86-e734a4a8f796	{"sub": "d2ca418a-680e-480c-9b86-e734a4a8f796", "email": "nik@gmail.com", "full_name": "Nik", "email_verified": false, "phone_verified": false}	email	2026-08-03 11:14:34.405954+00	2026-08-03 11:14:34.406036+00	2026-08-03 11:14:34.406036+00	69b8e23c-a40c-4d6f-83f1-70fcc2925700
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."instances" ("id", "uuid", "raw_base_config", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_clients" ("id", "client_secret_hash", "registration_type", "redirect_uris", "grant_types", "client_name", "client_uri", "logo_uri", "created_at", "updated_at", "deleted_at", "client_type", "token_endpoint_auth_method") FROM stdin;
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") FROM stdin;
b94b1535-5f0f-4650-acd8-2351ca98baa1	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-12 16:59:42.947766+00	2026-08-12 16:59:42.947766+00	\N	aal1	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	161.142.125.16	\N	\N	\N	\N	\N
38ee2685-390e-46fd-b65d-c921e470e6b7	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-13 13:29:43.006919+00	2026-08-13 16:24:21.375795+00	\N	aal1	\N	2026-08-13 16:24:21.375671	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36	161.142.139.64	\N	\N	\N	\N	\N
\.


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") FROM stdin;
b94b1535-5f0f-4650-acd8-2351ca98baa1	2026-08-12 16:59:42.98119+00	2026-08-12 16:59:42.98119+00	password	3086cbac-d37e-4a09-a5d7-6bfdea1aad90
38ee2685-390e-46fd-b65d-c921e470e6b7	2026-08-13 13:29:43.054575+00	2026-08-13 13:29:43.054575+00	password	8d81c487-166d-459b-b7e8-f0b3ecc6710c
\.


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_factors" ("id", "user_id", "friendly_name", "factor_type", "status", "created_at", "updated_at", "secret", "phone", "last_challenged_at", "web_authn_credential", "web_authn_aaguid", "last_webauthn_challenge_data") FROM stdin;
\.


--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."mfa_challenges" ("id", "factor_id", "created_at", "verified_at", "ip_address", "otp_code", "web_authn_session_data") FROM stdin;
\.


--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_authorizations" ("id", "authorization_id", "client_id", "user_id", "redirect_uri", "scope", "state", "resource", "code_challenge", "code_challenge_method", "response_type", "status", "authorization_code", "created_at", "expires_at", "approved_at", "nonce") FROM stdin;
\.


--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_client_states" ("id", "provider_type", "code_verifier", "created_at") FROM stdin;
\.


--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."oauth_consents" ("id", "user_id", "client_id", "scopes", "granted_at", "revoked_at") FROM stdin;
\.


--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") FROM stdin;
00000000-0000-0000-0000-000000000000	572	anq4pls7bjqs	b98b5fc8-3940-49dc-95b2-acc4e2420337	f	2026-08-12 16:59:42.966596+00	2026-08-12 16:59:42.966596+00	\N	b94b1535-5f0f-4650-acd8-2351ca98baa1
00000000-0000-0000-0000-000000000000	573	aebbbkrzimlz	b98b5fc8-3940-49dc-95b2-acc4e2420337	t	2026-08-13 13:29:43.028653+00	2026-08-13 16:24:21.306665+00	\N	38ee2685-390e-46fd-b65d-c921e470e6b7
00000000-0000-0000-0000-000000000000	574	c4sm3uc5dfhz	b98b5fc8-3940-49dc-95b2-acc4e2420337	f	2026-08-13 16:24:21.334243+00	2026-08-13 16:24:21.334243+00	aebbbkrzimlz	38ee2685-390e-46fd-b65d-c921e470e6b7
\.


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sso_providers" ("id", "resource_id", "created_at", "updated_at", "disabled") FROM stdin;
\.


--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."saml_providers" ("id", "sso_provider_id", "entity_id", "metadata_xml", "metadata_url", "attribute_mapping", "created_at", "updated_at", "name_id_format") FROM stdin;
\.


--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."saml_relay_states" ("id", "sso_provider_id", "request_id", "for_email", "redirect_to", "created_at", "updated_at", "flow_state_id") FROM stdin;
\.


--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."sso_domains" ("id", "sso_provider_id", "domain", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."webauthn_challenges" ("id", "user_id", "challenge_type", "session_data", "created_at", "expires_at") FROM stdin;
\.


--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY "auth"."webauthn_credentials" ("id", "user_id", "credential_id", "public_key", "attestation_type", "aaguid", "sign_count", "transports", "backup_eligible", "backed_up", "friendly_name", "created_at", "updated_at", "last_used_at") FROM stdin;
\.


--
-- Data for Name: delivery_batches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."delivery_batches" ("id", "batch_code", "delivery_date", "supplier_name", "supplier_notes", "hub_name", "lalamove_tracking_url", "status", "created_by", "created_at", "updated_at", "packing_started_at", "packing_completed_at", "lalamove_booked_at", "hub_arrived_at", "ready_for_rider_at", "booking_reference", "delivery_started_at", "completed_at") FROM stdin;
\.


--
-- Data for Name: Orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."Orders" ("id", "created_at", "full_name", "phone_number", "email_address", "street_address", "postcode", "city", "state", "order_notes", "item_options", "order_items", "delivery_slot", "order_summary", "subtotal", "delivery_fee", "total", "user_id", "supplier_weights", "updated_at", "updated_by", "payment_status", "paid_at", "paid_by", "apartment", "house_unit", "pickup_location", "delivery_point_name", "delivery_method", "delivery_batch_id", "packing_started_at", "packing_completed_at", "supplier_dispatch_started_at", "supplier_dispatch_completed_at", "ready_for_rider_at", "lalamove_tracking_url", "booking_reference", "lalamove_booked_at", "delivery_status", "delivered_at", "gross_profit", "revenue", "supplier_cost", "profit_margin_percent", "pricing_snapshot_timestamp", "frozen_total", "currency") FROM stdin;
50	2026-08-08 08:05:38.519038+00	AMIr	0123323233	amir@gmail.com				Selangor	\N	[{"name": "Senangin", "productId": "senangin", "preparation": "whole"}]	[{"name": "Senangin", "unit": "per kg", "image": "fish/merah-potong-red-grouper-cut.webp", "price": 37, "category": "fish", "quantity": 1, "costPrice": 34, "productId": "senangin", "grossProfit": 6, "preparation": "whole", "pricingType": "per_kg", "gross_profit": 6.00, "orderingMode": "whole_or_weight", "supplierName": "Shah", "actual_weight": 2, "averageWeight": 0, "selling_total": 74.00, "supplier_total": 68.00, "profit_margin_percent": 8.11, "selling_price_per_unit": 37, "supplier_cost_per_unit": 34, "pricing_snapshot_timestamp": "2026-08-08T08:06:26.151881+00:00"}]	friday	{"status": "confirmed", "orderRef": "RFG-MSK39VFS", "deliveryDate": "Friday, 14 August 2026", "deliveryWindow": "6:30–8:30 PM", "statusTimeline": [{"done": true, "time": "04:05 pm", "status": "Order Confirmed"}, {"done": false, "time": "Friday morning", "status": "Being Prepared"}, {"done": false, "time": "Friday 6:30", "status": "Out for Delivery"}, {"done": false, "time": "Friday by end of window", "status": "Delivered"}]}	0.00	0.00	74.00	090cd507-9bfe-4bb4-84c9-16c9075fff8a	{"0": 2}	2026-08-08 08:06:26.15+00	45938e83-d40a-411a-93bc-3134d97aadca	Paid	2026-08-08 08:06:38.772+00	b98b5fc8-3940-49dc-95b2-acc4e2420337	Rimbun	A-12-22	Delivery to Lobby A Rimbun	Delivery to Lobby A Rimbun		\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	6.00	74.00	68.00	8.11	2026-08-08 08:06:26.151881+00	74.00	MYR
49	2026-08-08 07:32:40.20144+00	Ali	0132234565	ali@gmail.com				Selangor	\N	[{"name": "Senangin", "productId": "senangin", "preparation": "whole"}]	[{"name": "Senangin", "unit": "per kg", "image": "fish/merah-potong-red-grouper-cut.webp", "price": 37, "category": "fish", "quantity": 1, "costPrice": 34, "productId": "senangin", "grossProfit": 6, "preparation": "whole", "pricingType": "per_kg", "gross_profit": 6.00, "orderingMode": "whole_or_weight", "supplierName": "Shah", "actual_weight": 2, "averageWeight": 0, "selling_total": 74.00, "supplier_total": 68.00, "profit_margin_percent": 8.11, "selling_price_per_unit": 37, "supplier_cost_per_unit": 34, "pricing_snapshot_timestamp": "2026-08-08T07:32:52.170728+00:00"}]	friday	{"status": "confirmed", "orderRef": "RFG-MSK23GZN", "deliveryDate": "Friday, 14 August 2026", "deliveryWindow": "6:30–8:30 PM", "statusTimeline": [{"done": true, "time": "03:32 pm", "status": "Order Confirmed"}, {"done": false, "time": "Friday morning", "status": "Being Prepared"}, {"done": false, "time": "Friday 6:30", "status": "Out for Delivery"}, {"done": false, "time": "Friday by end of window", "status": "Delivered"}]}	0.00	2.00	76.00	74fb8cd1-0135-40e3-8840-b7062b0c7048	{"0": 2}	2026-08-10 11:10:25.574+00	45938e83-d40a-411a-93bc-3134d97aadca	Paid	2026-08-08 08:06:43.877+00	b98b5fc8-3940-49dc-95b2-acc4e2420337	Rimbun	A-12-3	Rimbun Lobby B	Rimbun Lobby B		\N	2026-08-10 11:10:22.074+00	2026-08-10 11:10:25.574+00	\N	\N	\N	\N	\N	\N	\N	\N	6.00	74.00	68.00	8.11	2026-08-08 07:32:52.170728+00	76.00	MYR
51	2026-08-10 11:11:27.09771+00	Ahmad	0132245654	customer1@gmail.com				Selangor	\N	[{"name": "Combo A", "productId": "combo-a-1785581894775", "preparation": null}]	[{"name": "Combo A", "unit": "combo", "image": "combos/chatgpt-image-aug-1-2026-06-57-41-pm.webp", "price": 46.55, "comboId": "combo-a-1785581894775", "isCombo": true, "quantity": 1, "productId": "combo-a-1785581894775", "comboItems": [{"name": "Whole Broiler Chicken", "unit": "per bird", "image": "chicken/ayam-segar-2.webp", "label": "Whole Broiler Chicken x1", "price": 19, "quantity": 1, "productId": "broiler-chicken", "preparation": "whole", "pricingType": "fixed", "sellingUnit": "piece", "quantityValue": 1}, {"name": "Siakap (Asian Sea Bass)", "unit": "per ekor", "image": "fish/siakap.webp", "label": "Siakap (Asian Sea Bass) x1", "price": 11, "quantity": 1, "productId": "siakap", "preparation": "cleaned", "pricingType": "fixed", "sellingUnit": "piece", "quantityValue": 1}, {"name": "Cencaru (Torpedo Scad)", "unit": "kg", "image": "fish/cencaru-torpedo-scad.webp", "label": "Cencaru (Torpedo Scad) 1kg", "price": 10, "quantity": 1, "productId": "cencaru", "preparation": "whole", "pricingType": "per_kg", "sellingUnit": "kg", "quantityValue": 1}, {"name": "Udang A (Grade A Prawns)", "unit": "kg", "image": "prawns/udang-a.webp", "label": "Udang A (Grade A Prawns) 0.5kg", "price": 36, "quantity": 1, "productId": "udang-a", "pricingType": "per_kg", "sellingUnit": "kg", "quantityValue": 0.5}], "grossProfit": 46.55, "gross_profit": 46.55, "actual_weight": 1, "selling_total": 46.55, "supplier_total": 0.00, "profit_margin_percent": 100.00, "selling_price_per_unit": 46.55, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-10T11:11:27.09771+00:00"}]	friday	{"status": "confirmed", "orderRef": "RFG-MSN4SIPV", "deliveryDate": "Friday, 14 August 2026", "deliveryWindow": "6:30–8:30 PM", "statusTimeline": [{"done": true, "time": "07:11 pm", "status": "Order Confirmed"}, {"done": false, "time": "Friday morning", "status": "Being Prepared"}, {"done": false, "time": "Friday 6:30", "status": "Out for Delivery"}, {"done": false, "time": "Friday by end of window", "status": "Delivered"}]}	46.55	5.00	51.55	7ef56478-5844-46b5-8dfe-831297dca49e	{}	\N	\N	Pending	\N	\N		A-54-34	Residensi Mirai CD	Residensi Mirai CD	Lobby Collection	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	46.55	46.55	0.00	100.00	2026-08-10 11:11:27.09771+00	51.55	MYR
52	2026-08-10 11:13:32.963451+00	Ahmad	0132233322	cust3@gmail.com				Selangor	\N	[{"name": "Bawal Hitam (Black Pomfret)", "productId": "bawal-hitam", "preparation": "whole"}, {"name": "Bawal Putih (White Pomfret)", "productId": "bawal-putih", "preparation": "whole"}, {"name": "Keli (Catfish)", "productId": "keli", "preparation": "cleaned"}]	[{"name": "Bawal Hitam (Black Pomfret)", "unit": "per ekor", "image": "fish/bawal-hitam-black-pomfret-under-3mb.webp", "price": 27, "category": "fish", "quantity": 1, "costPrice": 0, "productId": "bawal-hitam", "grossProfit": 27, "preparation": "whole", "pricingType": "per_kg", "gross_profit": 27.00, "orderingMode": "whole_or_weight", "supplierName": "", "actual_weight": 1, "averageWeight": 600, "selling_total": 27.00, "supplier_total": 0.00, "estimatedWeight": 0.6, "profit_margin_percent": 100.00, "selling_price_per_unit": 27, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-10T11:14:20.785164+00:00"}, {"name": "Bawal Putih (White Pomfret)", "unit": "per ekor", "image": "fish/bawal-putih-white-pomfret.webp", "price": 34, "category": "fish", "quantity": 1, "costPrice": 0, "productId": "bawal-putih", "grossProfit": 34, "preparation": "whole", "pricingType": "per_kg", "gross_profit": 34.00, "orderingMode": "whole_or_weight", "supplierName": "", "actual_weight": 1, "averageWeight": 600, "selling_total": 34.00, "supplier_total": 0.00, "estimatedWeight": 0.6, "profit_margin_percent": 100.00, "selling_price_per_unit": 34, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-10T11:14:20.785164+00:00"}, {"name": "Keli (Catfish)", "unit": "per ekor", "image": "fish/keli-catfish.webp", "price": 9, "category": "fish", "quantity": 1, "costPrice": 0, "productId": "keli", "grossProfit": 18, "preparation": "cleaned", "pricingType": "per_kg", "gross_profit": 18.00, "orderingMode": "weight_only", "supplierName": "", "actual_weight": 2, "averageWeight": 500, "selling_total": 18.00, "supplier_total": 0.00, "estimatedWeight": 0.5, "profit_margin_percent": 100.00, "showEstimatedQuantity": true, "selling_price_per_unit": 9, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-10T11:14:20.785164+00:00"}]	wednesday	{"status": "confirmed", "orderRef": "RFG-MSN4V80C", "deliveryDate": "Wednesday, 12 August 2026", "deliveryWindow": "6:30–8:30 PM", "statusTimeline": [{"done": true, "time": "07:13 pm", "status": "Order Confirmed"}, {"done": false, "time": "Wednesday morning", "status": "Being Prepared"}, {"done": false, "time": "Wednesday 6:30", "status": "Out for Delivery"}, {"done": false, "time": "Wednesday by end of window", "status": "Delivered"}]}	41.10	2.00	81.00	15368da1-d7e4-4c8a-8dc4-5e6988c955d3	{"0": 1, "1": 1, "2": 2}	2026-08-10 11:14:20.567+00	45938e83-d40a-411a-93bc-3134d97aadca	Ready To Pay	\N	\N		F-22-3	Mutiara Lobby C	Mutiara Lobby C	Customer Come Down	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	79.00	79.00	0.00	100.00	2026-08-10 11:14:20.785164+00	81.00	MYR
53	2026-08-12 16:25:38.449307+00	Ali Test	0132234565	ali@gmail.com				Selangor	\N	[{"name": "Whole Broiler Chicken", "productId": "broiler-chicken", "preparation": "whole"}, {"name": "Bawal Emas (Golden Pomfret)", "productId": "bawal-emas", "preparation": "whole"}, {"name": "Udang A (Grade A Prawns)", "productId": "udang-a", "preparation": "whole"}, {"name": "Combo A", "productId": "combo-a-1785581894775", "preparation": null}]	[{"name": "Whole Broiler Chicken", "unit": "per bird", "image": "chicken/ayam-segar-2.webp", "price": 19, "category": "chicken", "quantity": 1, "costPrice": 0, "productId": "broiler-chicken", "grossProfit": 19, "preparation": "whole", "pricingType": "fixed", "gross_profit": 19.00, "orderingMode": "fixed_quantity", "supplierName": "", "actual_weight": 1, "averageWeight": 1600, "selling_total": 19.00, "supplier_total": 0.00, "profit_margin_percent": 100.00, "selling_price_per_unit": 19, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-12T16:44:20.388167+00:00"}, {"name": "Bawal Emas (Golden Pomfret)", "unit": "per ekor", "image": "fish/bawal-emas-golden-pomfret-under-3mb.webp", "price": 32, "category": "fish", "quantity": 1, "costPrice": 28, "productId": "bawal-emas", "grossProfit": 8, "preparation": "whole", "pricingType": "per_kg", "gross_profit": 8.00, "orderingMode": "whole_or_weight", "supplierName": "Shah", "actual_weight": 2, "averageWeight": 600, "selling_total": 64.00, "supplier_total": 56.00, "estimatedWeight": 1, "profit_margin_percent": 12.50, "selling_price_per_unit": 32, "supplier_cost_per_unit": 28, "pricing_snapshot_timestamp": "2026-08-12T16:44:20.388167+00:00"}, {"name": "Udang A (Grade A Prawns)", "unit": "per kg", "image": "prawns/udang-a.webp", "price": 36, "category": "prawns", "quantity": 1, "costPrice": 0, "productId": "udang-a", "grossProfit": 36, "preparation": "whole", "pricingType": "per_kg", "gross_profit": 36.00, "orderingMode": "weight_only", "supplierName": "", "actual_weight": 1, "averageWeight": 29, "selling_total": 36.00, "supplier_total": 0.00, "estimatedWeight": 1, "profit_margin_percent": 100.00, "showEstimatedQuantity": true, "selling_price_per_unit": 36, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-12T16:44:20.388167+00:00"}, {"name": "Combo A", "unit": "combo", "image": "combos/chatgpt-image-aug-1-2026-06-57-41-pm.webp", "price": 46.55, "comboId": "combo-a-1785581894775", "isCombo": true, "quantity": 1, "productId": "combo-a-1785581894775", "comboItems": [{"name": "Whole Broiler Chicken", "unit": "per bird", "image": "chicken/ayam-segar-2.webp", "label": "Whole Broiler Chicken x1", "price": 19, "quantity": 1, "productId": "broiler-chicken", "preparation": "whole", "pricingType": "fixed", "sellingUnit": "piece", "quantityValue": 1}, {"name": "Siakap (Asian Sea Bass)", "unit": "per ekor", "image": "fish/siakap.webp", "label": "Siakap (Asian Sea Bass) x1", "price": 11, "quantity": 1, "productId": "siakap", "preparation": "cleaned", "pricingType": "fixed", "sellingUnit": "piece", "quantityValue": 1}, {"name": "Cencaru (Torpedo Scad)", "unit": "kg", "image": "fish/cencaru-torpedo-scad.webp", "label": "Cencaru (Torpedo Scad) 1kg", "price": 10, "quantity": 1, "productId": "cencaru", "preparation": "whole", "pricingType": "per_kg", "sellingUnit": "kg", "quantityValue": 1}, {"name": "Udang A (Grade A Prawns)", "unit": "kg", "image": "prawns/udang-a.webp", "label": "Udang A (Grade A Prawns) 0.5kg", "price": 36, "quantity": 1, "productId": "udang-a", "pricingType": "per_kg", "sellingUnit": "kg", "quantityValue": 0.5}], "grossProfit": 46.55, "gross_profit": 46.55, "actual_weight": 1, "selling_total": 46.55, "supplier_total": 0.00, "profit_margin_percent": 100.00, "selling_price_per_unit": 46.55, "supplier_cost_per_unit": 0, "pricing_snapshot_timestamp": "2026-08-12T16:44:20.388167+00:00"}]	friday	{"status": "confirmed", "orderRef": "RFG-MSQAW9GY", "deliveryDate": "Friday, 14 August 2026", "deliveryWindow": "6:30–8:30 PM", "statusTimeline": [{"done": true, "time": "12:25 am", "status": "Order Confirmed"}, {"done": false, "time": "Friday morning", "status": "Being Prepared"}, {"done": false, "time": "Friday 6:30", "status": "Out for Delivery"}, {"done": false, "time": "Friday by end of window", "status": "Delivered"}]}	133.55	2.00	167.55	74fb8cd1-0135-40e3-8840-b7062b0c7048	{"1": 2, "2": 1}	2026-08-12 16:44:19.548+00	45938e83-d40a-411a-93bc-3134d97aadca	Ready To Pay	\N	\N	Rimbun	A-12-3	Rimbun Lobby B	Rimbun Lobby B		\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	109.55	165.55	56.00	66.17	2026-08-12 16:44:20.388167+00	167.55	MYR
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."Product" ("id", "name", "name_ms", "category", "price", "unit", "price_note", "weight", "quantity", "description", "long_description", "image", "images", "freshness", "preparation_options", "vendor_id", "vendor_name", "tags", "is_popular", "created_at", "ordering_mode", "display_order", "is_pinned", "slice_unit", "min_slice", "max_slice", "default_slice", "slice_increment", "slice_instruction", "cost_price", "cost_supplier_name") FROM stdin;
bawal-emas	Bawal Emas (Golden Pomfret)	Bawal Emas	fish	32.00	per ekor	RM32/kg	\N	0	Golden pomfret — prized for its rich, sweet flesh. Excellent steamed or fried.	Bawal Emas, or Golden Pomfret, is one of the most sought-after table fish in Malaysia. Its firm, white flesh has a naturally sweet flavour with minimal bones. Best steamed whole with soy, ginger, and spring onion, or deep-fried until golden. Priced at RM32/kg — final price adjusted to actual fish weight at delivery.	fish/bawal-emas-golden-pomfret-under-3mb.webp	{fish/bawal-emas-golden-pomfret-under-3mb.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Shah	{premium,pomfret,sweet-flesh}	t	2026-07-12 06:31:04.42184+00	whole_or_weight	0	f	slice	1	20	2	1		28.00	Shah
senangin	Senangin	Senangin	fish	37.00	per kg	RM37/kg	\N	0	Senangin	Senangin	fish/merah-potong-red-grouper-cut.webp	{fish/merah-potong-red-grouper-cut.webp}	available	{whole,cleaned,descaled,gutted}	Shah	Shah	{}	f	2026-08-08 06:00:27.163728+00	whole_or_weight	28	f	slice	1	20	2	1		34.00	Shah
selar-kuning	Selar Kuning (Yellowstripe Trevally)	Ikan Selar Kuning	fish	13.00	per ekor	RM13/kg	\N	0	Small fish with a vivid yellow stripe. Delicious fried or in soups.	Selar Kuning (Yellowstripe Trevally) is distinguished by a bright yellow stripe along its silver body. Its flesh is slightly firmer than regular selar, with a more pronounced flavour. Great fried with turmeric, in a clear stock-based soup, or marinated and grilled. Priced at RM13/kg.	fish/selar-kuning.webp	{fish/selar-kuning.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{trevally,yellow-stripe,soups}	f	2026-07-12 06:31:04.42184+00	weight_only	17	f	slice	1	20	2	1		0.00	
siakap	Siakap (Asian Sea Bass)	Ikan Siakap	fish	11.00	per ekor	RM11/ekor	\N	0	Fresh siakap, delivered the day it leaves the water. A Malaysian household favourite.	Siakap (Asian Sea Bass) is one of Malaysia's most prized and versatile table fish. Firm white flesh, naturally sweet, and adaptable to almost any cooking style — steamed with soy and ginger, grilled with sambal, in a light assam soup, or deep-fried. Delivered fresh the same day it leaves our partner farm. Fixed price RM11 per fish.	fish/siakap.webp	{fish/siakap.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{sea-bass,local,versatile}	t	2026-07-12 06:31:04.42184+00	whole_or_weight	18	f	slice	1	20	2	1		0.00	
tenggiri-potong	Tenggiri Potong (Spanish Mackerel — Cut)	Tenggiri Potong	fish	45.00	per ekor	RM45/kg	\N	0	Spanish mackerel pre-cut into thick steaks. Ready to cook straight away.	Tenggiri Potong is Spanish Mackerel already cut into thick, even steaks — perfect for households who want zero prep work. The large, firm pieces hold their shape beautifully when fried, grilled, or added to a rich masak lemak. Priced at RM45/kg.	fish/tenggiri-potong-under-3mb.webp	{fish/tenggiri-potong-under-3mb.webp,fish/tenggiri-spanish-mackerel.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{mackerel,cut-steak,convenient}	f	2026-07-12 06:31:04.42184+00	slice	23	f	slice	3	20	3	1		0.00	
sotong-kembang	Sotong Kembang (Cuttlefish)	Sotong Kembang	squid	20.00	per kg	RM20/kg	1 kg	0	Fresh cuttlefish — meaty, thick-bodied, wonderful in dry curries and stir-fries.	Sotong Kembang (Cuttlefish) is the rounder, flatter cousin of tube squid. Its body is thicker and meatier, making it especially satisfying in dry-style dishes. Absolutely delicious in a dry sambal hitam, a Nyonya-style kari sotong, or simply scored, marinated, and grilled over charcoal. Landed fresh daily from coastal boats. Exceptional value at RM20/kg.	squid/sotong-kembang.webp	{squid/sotong-kembang.webp}	available	{}	vendor-razif	Aminah Seafood Trading	{cuttlefish,meaty,dry-curry,affordable}	f	2026-07-12 06:31:04.42184+00	weight_only	20	f	slice	1	20	2	1		0.00	
talapia-merah	Talapia Merah (Red Tilapia)	Ikan Talapia Merah	fish	17.00	per ekor	RM17/kg	\N	0	Farm-fresh red tilapia. Mild, versatile, and great value for families.	Talapia Merah (Red Tilapia) is a widely loved freshwater fish across Malaysia — mild-flavoured, easy to cook, and affordable. Excellent steamed with soy sauce, fried whole, or cooked in a clear herbal soup. Farm-raised fresh, delivered same day. Priced at RM17/kg.	fish/talapia-merah-red-tilapia.webp	{fish/talapia-merah-red-tilapia.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{tilapia,farm-fresh,mild}	f	2026-07-12 06:31:04.42184+00	weight_only	21	f	slice	1	20	2	1		0.00	
tenggiri	Tenggiri (Spanish Mackerel)	Ikan Tenggiri	fish	37.00	per ekor	RM37/kg	\N	0	Premium Spanish mackerel. Firm, almost boneless — ideal for steaks and curries.	Tenggiri (Spanish Mackerel) is one of Malaysia's most premium everyday fish — firm, near-boneless, and rich in flavour. Famous for its use in fish crackers and premium fish balls, but equally wonderful as thick steaks fried or in a spiced curry. Priced at RM37/kg.	fish/tenggiri-spanish-mackerel.webp	{fish/tenggiri-spanish-mackerel.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{mackerel,premium,firm-flesh}	t	2026-07-12 06:31:04.42184+00	whole_or_weight	22	f	slice	1	20	2	1		0.00	
broiler-chicken	Whole Broiler Chicken	Ayam Broiler (Utuh)	chicken	19.00	per bird	\N	1.5–1.7 kg	0	Freshly slaughtered broiler chicken. Choose your preferred cut — from whole bird to 16 pieces.	Our broiler chickens are slaughtered fresh every morning at our Halal-certified partner farm in Rawang, Selangor, never chilled for more than a few hours before delivery. Each bird weighs between 1.5 and 1.7 kg and arrives cleaned and ready to cook. Choose to receive it whole, cleaned, or have it cut into 4, 12, or 16 pieces — ideal for curries, grilling, roasting, or family-style cooking. No hormones, no additives.	chicken/ayam-segar-2.webp	{chicken/ayam-segar-2.webp,chicken/ayam-segar-1.webp,chicken/ayam-potong.webp,chicken/ayam-potong-2.webp}	available	{whole,cut4,cut12,cut16}	vendor-hassan	Aminah Seafood Trading	{fresh-daily,halal,no-hormones}	t	2026-07-12 06:31:04.42184+00	fixed_quantity	3	f	slice	1	20	2	1		0.00	
jenahak-potong	Jenahak Potong (Red Snapper — Cut)	Jenahak Potong	fish	45.00	per ekor	RM45/kg	\N	0	Premium red snapper, pre-cut — restaurant-quality, ready to cook.	Jenahak Potong refers to larger red snapper cut into steaks — the same premium fish used in fine dining, now delivered fresh to your door. Rich, firm flesh ideal for grilling, baking, or a luxurious curry. Priced at RM45/kg.	fish/jenahak-potong-red-snapper-cut-2.webp	{fish/jenahak-potong-red-snapper-cut-2.webp,fish/jenahak-b-red-snapper-b.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{premium,snapper,cut}	f	2026-07-12 06:31:04.42184+00	slice	6	f	slice	3	20	3	1		0.00	
jenahak-b	Jenahak B (Red Snapper B)	Jenahak B	fish	37.00	per ekor	RM37/kg	\N	0	Medium-grade red snapper. Flavourful and versatile for everyday cooking.	Jenahak B is a medium-sized red snapper — firm, flavourful flesh with a mild sweetness. Excellent steamed whole, baked, or in a clear soup. A more affordable entry point to the premium snapper family. Priced at RM37/kg.	fish/jenahak-b-red-snapper-b.webp	{fish/jenahak-b-red-snapper-b.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{snapper,versatile,everyday}	f	2026-07-12 06:31:04.42184+00	whole_or_weight	5	f	slice	1	20	2	1		0.00	
tongkol-hitam	Tongkol Hitam (Frigate Tuna)	Tongkol Hitam	fish	15.00	per ekor	RM15/kg	\N	0	Dark-fleshed tuna. Bold, robust flavour — excellent in sambal and curries.	Tongkol Hitam (Frigate Tuna) has a darker, richer flesh than its paler cousin. Its bold flavour stands up to strongly spiced preparations — sambal, rendang, or a thick black-pepper sauce. A popular and very affordable tuna option. Priced at RM15/kg.	fish/tongkol-hitam-frigate-tuna.webp	{fish/tongkol-hitam-frigate-tuna.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{tuna,bold-flavour,sambal}	f	2026-07-12 06:31:04.42184+00	weight_only	24	f	slice	1	20	2	1		0.00	
bawal-hitam	Bawal Hitam (Black Pomfret)	Bawal Hitam	fish	27.00	per ekor	RM27/kg	\N	0	Black pomfret with firm, flavourful flesh. Great for curry or grilling.	Bawal Hitam (Black Pomfret) has a more pronounced sea flavour than its golden cousin — slightly firmer and excellent in curry, assam pedas, or grilled over charcoal. A popular affordable choice for family meals. Priced at RM27/kg; final price based on actual fish weight.	fish/bawal-hitam-black-pomfret-under-3mb.webp	{fish/bawal-hitam-black-pomfret-under-3mb.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{pomfret,curry,affordable}	f	2026-07-12 06:31:04.42184+00	whole_or_weight	1	f	slice	1	20	2	1		0.00	
tongkol-putih	Tongkol Putih (Bullet Tuna)	Tongkol Putih	fish	13.00	per ekor	RM13/kg	\N	0	Lighter-fleshed small tuna. Milder than tongkol hitam, great for nasi lemak sambal.	Tongkol Putih (Bullet Tuna) has lighter, slightly milder flesh compared to tongkol hitam. It's the fish behind some of Malaysia's most iconic nasi lemak sambal ikan — firm, slightly oily, and deeply satisfying. Also good grilled or in a dry-fried sambal with shallots and chilli. Priced at RM13/kg.	fish/tongkol-putih-bullet-tuna.webp	{fish/tongkol-putih-bullet-tuna.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{tuna,nasi-lemak,sambal}	f	2026-07-12 06:31:04.42184+00	weight_only	25	f	slice	1	20	2	1		0.00	
udang-rencah	Udang Rencah (Mixed Small Prawns)	Udang Rencah	prawns	19.00	per kg	RM19/kg	1 kg	0	Mixed small prawns — ideal for prawn noodles, curries, and sambals.	Udang Rencah are smaller mixed prawns, fantastic value for dishes where size matters less than flavour. Their shells add incredible depth to prawn stock, noodle broths (mee udang), and spiced sambal bases. Fresh the same morning as delivery — never frozen. A kitchen staple for home cooks who want genuine prawn flavour without the premium price.	https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800	{https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?auto=compress&cs=tinysrgb&w=800}	available	{}	vendor-razif	Aminah Seafood Trading	{small-prawns,stock,curries,affordable}	f	2026-07-12 06:31:04.42184+00	weight_only	27	f	slice	1	20	2	1		0.00	
kerisi-a	Kerisi A (Pink Snapper)	Ikan Kerisi A	fish	16.00	per ekor	RM16/kg	\N	0	Sweet pink snapper. Family favourite with fine, delicate flesh.	Kerisi (Pink Snapper or Threadfin Bream) is adored for its sweet, fine-textured flesh and relatively small bones. Grade-A batch means consistently sized, fresh fish. Try it steamed, deep-fried crispy, or in a light lemak broth. Priced at RM16/kg.	fish/kerisi-a-pink-snapper.webp	{fish/kerisi-a-pink-snapper.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{pink-snapper,family-friendly,delicate}	t	2026-07-12 06:31:04.42184+00	weight_only	8	f	slice	1	20	2	1		0.00	
mabong-a	Mabong A (Indian Mackerel)	Ikan Mabong A	fish	19.00	per ekor	RM19/kg	\N	0	Fatty, flavourful Indian mackerel. Rich in omega-3 and excellent fried.	Mabong (Indian Mackerel) is one of Malaysia's most nutritious everyday fish — loaded with omega-3 fatty acids. Its bold, oily flavour stands up beautifully to rempah-based curries, sambal, or a simple garlic stir-fry. Grade A means larger, plumper fish. Priced at RM19/kg.	fish/mabong-a-indian-mackerel.webp	{fish/mabong-a-indian-mackerel.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{mackerel,omega-3,flavourful}	f	2026-07-12 06:31:04.42184+00	weight_only	9	f	slice	1	20	2	1		0.00	
nyok	Nyok (Indian Halibut)	Ikan Nyok	fish	30.00	per ekor	RM30/kg	\N	0	Flat, firm-fleshed halibut. Excellent fried whole or in a rich curry.	Nyok (Indian Halibut or flounder) is a flat-bodied, thick-fleshed fish with a mild, clean flavour. It fries beautifully to a crispy exterior while staying moist inside. Also excellent in assam pedas or mild coconut curry. Priced at RM30/kg.	fish/nyok-indian-halibut.webp	{fish/nyok-indian-halibut.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{halibut,flat-fish,crispy-fried}	f	2026-07-12 06:31:04.42184+00	weight_only	12	f	slice	1	20	2	1		0.00	
keli	Keli (Catfish)	Ikan Keli	fish	9.00	per ekor	RM9/kg	\N	0	Fresh local catfish. Tender, flavourful, and incredibly affordable.	Ikan Keli (Catfish) is one of Malaysia's most affordable and nutritious freshwater fish. Its tender, slightly fatty flesh absorbs spice wonderfully — making it a standout in sambal keli, masak lemak, or deep-fried whole until crispy. Farm-raised locally and delivered fresh. At RM9/kg, it's exceptional value.	fish/keli-catfish.webp	{fish/keli-catfish.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{catfish,affordable,tender}	f	2026-07-12 06:31:04.42184+00	weight_only	7	f	slice	1	20	2	1		0.00	
sardin	Sardin (Indian Oil Sardine)	Ikan Sardin	fish	14.00	per ekor	RM14/kg	\N	0	Fresh local sardines — not the canned kind. Grilled, fried, or curried.	Fresh sardin (Indian Oil Sardine) is a world away from the canned version — rich, oily, and deeply flavourful. Grilled over charcoal with a squeeze of lime, fried with turmeric and chilli, or cooked in a robust tomato-based curry. An excellent source of omega-3s and calcium. Priced at RM14/kg.	fish/sardin-indian-oil-sardine.webp	{fish/sardin-indian-oil-sardine.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{sardine,omega-3,fresh}	f	2026-07-12 06:31:04.42184+00	weight_only	15	f	slice	1	20	2	1		0.00	
sotong-a	Sotong A (Grade A Squid)	Sotong A	squid	37.00	per kg	RM37/kg	1 kg	0	Premium grade-A squid — firm tubes and tentacles, landed fresh daily.	Sotong A is our grade-A squid — the largest, most uniform tubes from our day-boat catch. Landed fresh from the Strait of Malacca and South China Sea each morning. The flesh is firm, milky-white, and naturally sweet when cooked correctly. Ideal for sambal sotong, crispy fried calamari, black-ink pasta, or stuffed and baked whole. Best quality for presentation-worthy dishes.	squid/sotong-a.webp	{squid/sotong-a.webp}	available	{}	vendor-razif	Aminah Seafood Trading	{grade-a,premium,squid,fresh}	t	2026-07-12 06:31:04.42184+00	weight_only	19	f	slice	1	20	2	1		0.00	
bawal-putih	Bawal Putih (White Pomfret)	Bawal Putih	fish	34.00	per ekor	RM34/kg	\N	0	Premium white pomfret. Delicate, near-boneless — the finest pomfret variety.	Bawal Putih (White Pomfret or Silver Pomfret) is considered the finest of the pomfret family in Malaysia. Its flesh is delicate, lightly sweet, and nearly boneless — making it a favourite for steaming and light broths. Priced at RM34/kg; final price based on actual fish weight.	fish/bawal-putih-white-pomfret.webp	{fish/bawal-putih-white-pomfret.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{premium,white-pomfret,delicate}	t	2026-07-12 06:31:04.42184+00	whole_or_weight	2	f	slice	1	20	2	1		0.00	
cencaru	Cencaru (Torpedo Scad)	Ikan Cencaru	fish	10.00	per ekor	RM10/kg	\N	0	Classic kampung fish. Perfect stuffed with sambal and fried crispy.	Cencaru is a beloved affordable Malaysian table fish packed with omega-3s. Star of the famous ikan cencaru sumbat sambal, it's also great grilled, fried whole, or in a sour assam broth. Priced at RM10/kg; final price based on actual fish weight.	fish/cencaru-torpedo-scad.webp	{fish/cencaru-torpedo-scad.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{affordable,kampung,omega-3}	t	2026-07-12 06:31:04.42184+00	weight_only	4	f	slice	1	20	2	1		0.00	
merah-potong	Merah Potong (Red Grouper — Cut)	Ikan Merah Potong	fish	45.00	per ekor	RM45/kg	\N	0	Premium red grouper cut into steaks. Restaurant-grade, fresh daily.	Ikan Merah Potong — red grouper steaks — is a highly prized restaurant-quality fish. The flesh is thick, firm, and naturally sweet. Available pre-cut for convenience; perfect for steaming, frying, or baking in a claypot. Priced at RM45/kg.	fish/merah-potong-red-grouper-cut-2.webp	{fish/merah-potong-red-grouper-cut-2.webp,fish/merah-b-red-grouper-b.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{premium,grouper,restaurant-grade}	f	2026-07-12 06:31:04.42184+00	slice	11	f	slice	3	20	3	1		0.00	
merah-b	Merah B (Red Grouper B)	Ikan Merah B	fish	39.00	per ekor	RM39/kg	\N	0	Red grouper — firm, sweet flesh. A premium fish at a friendlier price.	Ikan Merah B is a medium-grade red grouper — still premium quality, just a smaller or slightly less uniform cut. Excellent for steaming whole, making a clear soup, or frying with rempah. Priced at RM39/kg.	fish/merah-b-red-grouper-b.webp	{fish/merah-b-red-grouper-b.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{grouper,sweet-flesh,steaming}	f	2026-07-12 06:31:04.42184+00	whole_or_weight	10	f	slice	1	20	2	1		0.00	
parang	Parang (Wolf Herring)	Ikan Parang	fish	15.00	per kg	Harga mengikut pasaran	\N	0	Elongated silver herring. Popular for otah-otah and fish paste dishes.	Ikan Parang (Wolf Herring) is a long, silver-bodied fish most famous as the main ingredient in traditional otah-otah and kerisik-paste dishes. Its oily, fine-textured meat blends beautifully with spice pastes. Sold by the kilogram; price follows market rate and will be confirmed at time of order.	fish/parang-wolf-herring.webp	{fish/parang-wolf-herring.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{herring,otah-otah,paste-fish}	f	2026-07-12 06:31:04.42184+00	weight_only	13	f	slice	1	20	2	1		0.00	
pelaling	Pelaling (Yellowstripe Scad)	Ikan Pelaling	fish	16.00	per ekor	RM16/kg	\N	0	Affordable everyday fish. Tasty fried whole or in a light curry.	Pelaling (Yellowstripe Scad) is a small, affordable everyday fish with a pleasant mild flavour. Often fried whole until crispy and served with sambal belacan, or used in light soups. A household staple across Malaysia. Priced at RM16/kg.	fish/pelaling-yellowstripe-scad.webp	{fish/pelaling-yellowstripe-scad.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{scad,affordable,everyday}	f	2026-07-12 06:31:04.42184+00	weight_only	14	f	slice	1	20	2	1		0.00	
selar	Selar (Oxeye Scad)	Ikan Selar	fish	14.00	per ekor	RM14/kg	\N	0	Small round scad. Crispy fried whole or in asam pedas — simple and delicious.	Ikan Selar is a small, round-bodied scad common across Malaysian waters. Its firm white flesh fries beautifully and tastes great with a sharp asam pedas. Often served whole — the crispy tail and fins are considered a delicacy by many. Priced at RM14/kg.	fish/selar-oxeye-scad.webp	{fish/selar-oxeye-scad.webp}	available	{whole,cleaned,descaled,gutted}	vendor-aminah	Aminah Seafood Trading	{scad,fried,everyday}	f	2026-07-12 06:31:04.42184+00	weight_only	16	f	slice	1	20	2	1		0.00	
udang-a	Udang A (Grade A Prawns)	Udang A	prawns	36.00	per kg	RM36/kg	1 kg	0	Premium grade-A prawns — large, plump, and sweet. Harvested fresh same morning.	Udang A is our premium grade of freshwater and brackish prawns — the largest, most uniform batch we source each delivery day. Harvested the morning of your delivery from prawn farms in Perak and Selangor, never frozen. The shells are firm and bright, the flesh sweet and snappy — a hallmark of genuine freshness. Perfect for butter prawns, sambal udang, grilled whole, or simply steamed with garlic.	prawns/udang-a.webp	{prawns/udang-a.webp,prawns/udang-a-pinggan.webp}	available	{}	vendor-razif	Aminah Seafood trading	{grade-a,premium,large,never-frozen}	t	2026-07-12 06:31:04.42184+00	weight_only	26	f	slice	1	20	2	1		0.00	
\.


--
-- Data for Name: combos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."combos" ("id", "name", "name_ms", "slug", "description", "badge", "category_label", "tagline", "price", "original_value", "image", "images", "servings", "highlights", "featured", "active", "created_at", "updated_at", "display_order", "is_pinned") FROM stdin;
combo-b-1785626401069	Combo B	Kombo B	combo-b		Best Value			28.50	47.50		{}	4	{}	f	t	2026-08-01 23:20:01.855181+00	2026-08-01 23:20:01.68+00	0	f
combo-a-1785581894775	Combo A	Kombo A	combo-a		Best Value			46.55	49.00	combos/chatgpt-image-aug-1-2026-06-57-41-pm.webp	{combos/chatgpt-image-aug-1-2026-06-57-41-pm.webp}	4	{}	f	t	2026-08-01 10:58:14.693702+00	2026-08-01 11:02:01.747+00	1	f
\.


--
-- Data for Name: combo_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."combo_items" ("id", "combo_id", "product_id", "quantity_value", "selling_unit", "sort_order", "custom_label", "preparation", "unit", "created_at") FROM stdin;
b95135a8-b6c8-40bc-8144-803580f827cc	combo-a-1785581894775	broiler-chicken	1.00	piece	0	\N	whole	per bird	2026-08-01 11:02:01.707461+00
e7011a3d-b98b-42da-98a6-d00027b859a5	combo-a-1785581894775	siakap	1.00	piece	1	\N	cleaned	per ekor	2026-08-01 11:02:01.707461+00
f0e7f59a-74e1-4483-a82a-16603dbfe97f	combo-a-1785581894775	cencaru	1.00	kg	2	\N	whole	per ekor	2026-08-01 11:02:01.707461+00
cd41fe64-79fe-486c-8295-070825746f03	combo-a-1785581894775	udang-a	0.50	kg	3	\N	\N	per kg	2026-08-01 11:02:01.707461+00
d0092455-bfa1-4968-b887-7c0a2ca3e24a	combo-b-1785626401069	siakap	1.00	piece	0	\N	whole	per ekor	2026-08-01 23:20:02.040819+00
b537bc05-ac18-46c7-9703-659c547e8288	combo-b-1785626401069	udang-a	0.50	kg	1	\N	\N	per kg	2026-08-01 23:20:02.040819+00
6e3f21ae-1e94-47bc-9c92-5d0dd90877b9	combo-b-1785626401069	sotong-a	0.50	kg	2	\N	\N	per kg	2026-08-01 23:20:02.040819+00
\.


--
-- Data for Name: customer_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."customer_profiles" ("id", "full_name", "phone", "email_address", "address", "postcode", "city", "state", "apartment", "house_unit", "pickup_location", "notes", "created_at", "updated_at") FROM stdin;
3bafb164-c03b-4944-af60-10bfe24709a6	Ahmad	0123232234	customer2@gmail.com	\N	\N	\N	\N	RImbun	A-12-32	Delivery to Lobby A Rimbun	testing customer 2	2026-07-26 05:30:43.836513+00	2026-07-26 05:30:43.814+00
090cd507-9bfe-4bb4-84c9-16c9075fff8a	AMIr	0123323233	amir@gmail.com	\N	\N	\N	\N	Rimbun	A-12-22	Delivery to Lobby A Rimbun	\N	2026-07-25 05:49:42.958524+00	2026-08-08 08:05:38.616+00
7ef56478-5844-46b5-8dfe-831297dca49e	Ahmad	0132245654	customer1@gmail.com	\N	\N	\N	\N		A-54-34	Residensi Mirai CD	\N	2026-08-10 11:11:27.177184+00	2026-08-10 11:11:26.963+00
15368da1-d7e4-4c8a-8dc4-5e6988c955d3	Ahmad	0132233322	cust3@gmail.com	\N	\N	\N	\N		F-22-3	Mutiara Lobby C	\N	2026-08-10 11:13:33.008309+00	2026-08-10 11:13:32.82+00
74fb8cd1-0135-40e3-8840-b7062b0c7048	Ali Test	0132234565	ali@gmail.com	\N	\N	\N	\N	Rimbun	A-12-3	Rimbun Lobby B	\N	2026-07-25 05:26:17.592247+00	2026-08-12 16:25:37.678+00
\.


--
-- Data for Name: delivery_batch_manifest; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."delivery_batch_manifest" ("id", "batch_id", "order_id", "packed", "loaded", "packed_at", "loaded_at", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: delivery_points; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."delivery_points" ("id", "name", "delivery_fee", "delivery_method", "display_order", "active", "created_at", "updated_at", "area", "pickup_notes", "latitude", "longitude") FROM stdin;
7	Rimbun Lobby A	2.00	Lobby Collection	1	t	2026-08-03 11:02:08.437281+00	2026-08-03 14:38:05.432+00	\N	\N	\N	\N
8	Rimbun Lobby B	2.00	Lobby Collection	2	t	2026-08-03 11:02:08.437281+00	2026-08-03 14:38:05.484+00	\N	\N	\N	\N
9	Mutiara Lobby A	2.00	Lobby Collection	3	t	2026-08-03 11:02:08.437281+00	2026-08-03 14:38:05.514+00	\N	\N	\N	\N
10	Mutiara Lobby B	2.00	Lobby Collection	4	t	2026-08-03 11:02:08.437281+00	2026-08-03 14:38:05.548+00	\N	\N	\N	\N
17	Mutiara Lobby C	2.00	Customer Come Down	5	t	2026-08-03 14:38:02.12158+00	2026-08-03 14:38:05.579+00	Mutiara Lobby C	\N	\N	\N
16	Residensi Zamrud AB	2.00	Customer Come Down	6	t	2026-08-03 14:36:02.283118+00	2026-08-03 14:38:05.623+00	Residensi Zamrud AB	\N	\N	\N
15	Residensi Zamrud CD	2.00	Customer Come Down	7	t	2026-08-03 14:35:47.358075+00	2026-08-03 14:38:05.657+00	Residensi Zamrud CD	\N	\N	\N
11	Residensi Zamrud E	2.00	Security Collection	8	t	2026-08-03 11:02:08.437281+00	2026-08-03 14:38:05.692+00	Residensi Zamrud E	\N	\N	\N
12	Emas Security House	2.00	Customer Come Down	9	t	2026-08-03 11:02:08.437281+00	2026-08-03 14:38:05.725+00	Emas Security House	\N	\N	\N
13	Residensi Mirai AB	5.00	Lobby Collection	10	t	2026-08-03 14:26:35.877476+00	2026-08-03 14:38:05.758+00	Residensi Mirai AB	\N	\N	\N
14	Residensi Mirai CD	5.00	Lobby Collection	11	t	2026-08-03 14:31:27.976105+00	2026-08-03 14:38:05.792+00	Residensi Mirai CD	\N	\N	\N
\.


--
-- Data for Name: historical_business_daily; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."historical_business_daily" ("id", "business_date", "order_count", "revenue_amount", "supplier_cost_amount", "delivery_income_amount", "gross_profit_amount", "source", "notes", "created_by", "updated_by", "created_at", "updated_at") FROM stdin;
1	2026-04-09	8	428.00	388.00	0.00	40.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
2	2026-04-13	3	192.00	164.00	0.00	28.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
3	2026-04-15	4	212.00	180.00	0.00	32.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
4	2026-04-17	6	450.00	387.00	0.00	63.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
5	2026-04-22	9	611.00	511.00	0.00	100.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
6	2026-04-24	10	630.00	561.00	0.00	69.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
7	2026-04-29	18	958.80	820.00	0.00	138.80	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
8	2026-05-01	5	250.00	215.00	0.00	35.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
9	2026-05-06	12	641.50	601.00	0.00	40.50	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
10	2026-05-08	6	320.00	274.00	0.00	46.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
11	2026-05-13	5	233.50	210.00	0.00	23.50	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
12	2026-05-15	8	452.00	386.00	0.00	66.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
13	2026-05-20	7	420.00	363.00	0.00	57.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
14	2026-05-22	6	325.00	283.00	0.00	42.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
15	2026-06-03	3	120.00	105.00	0.00	15.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
16	2026-06-05	6	351.00	309.00	0.00	42.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
17	2026-06-10	10	687.15	636.00	0.00	51.15	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
18	2026-06-12	3	104.00	90.00	0.00	14.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
19	2026-06-17	5	315.20	274.00	0.00	41.20	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
20	2026-06-19	9	475.60	429.00	0.00	46.60	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
21	2026-06-24	14	750.76	696.00	0.00	54.76	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
22	2026-06-26	12	686.40	600.00	0.00	86.40	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
23	2026-07-01	11	694.16	481.00	25.00	188.16	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
24	2026-07-03	13	861.55	720.00	30.00	111.55	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
25	2026-07-08	4	264.00	226.00	8.00	30.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
26	2026-07-10	6	325.00	292.00	20.00	13.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
27	2026-07-15	9	578.00	482.00	20.00	76.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
28	2026-07-17	6	348.99	290.00	15.00	43.99	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
29	2026-07-22	10	715.52	592.00	31.00	92.52	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
30	2026-07-24	5	326.50	275.00	15.00	36.50	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
31	2026-07-28	8	458.00	381.00	20.00	57.00	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
32	2026-07-31	11	580.23	487.00	25.00	68.23	historical_import	\N	\N	\N	2026-08-08 09:53:14.803008+00	2026-08-08 09:53:14.803008+00
\.


--
-- Data for Name: selling_price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."selling_price_history" ("id", "product_id", "selling_price", "effective_from", "effective_to", "is_active", "created_by", "created_at", "updated_at", "updated_by") FROM stdin;
1	bawal-emas	32.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
2	selar-kuning	13.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
3	siakap	11.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
4	tenggiri-potong	45.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
5	sotong-kembang	20.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
6	talapia-merah	17.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
7	tenggiri	37.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
8	broiler-chicken	19.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
9	jenahak-potong	45.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
10	jenahak-b	37.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
11	tongkol-hitam	15.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
12	bawal-hitam	27.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
13	tongkol-putih	13.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
14	udang-rencah	19.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
15	kerisi-a	16.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
16	mabong-a	19.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
17	nyok	30.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
18	keli	9.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
19	sardin	14.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
20	sotong-a	37.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
21	bawal-putih	34.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
22	cencaru	10.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
23	merah-potong	45.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
24	merah-b	39.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
25	parang	15.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
26	pelaling	16.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
27	selar	14.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
28	udang-a	36.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
29	senangin	37.00	2026-08-08 06:00:27.163728+00	2026-08-08 06:00:27.24084+00	f	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 06:00:27.163728+00	2026-08-08 06:00:27.24084+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
30	senangin	37.00	2026-08-08 06:00:27.24084+00	\N	t	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 06:00:27.24084+00	2026-08-08 06:00:27.24084+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
\.


--
-- Data for Name: site_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."site_settings" ("key", "value", "updated_at") FROM stdin;
show_home_suppliers	"true"	2026-08-01 11:59:32.611+00
footer_show_shop	"true"	2026-08-01 15:58:12.559+00
footer_show_family_combo	"true"	2026-08-01 15:58:28.8+00
footer_show_suppliers	"true"	2026-08-01 15:58:28.8+00
contact_phone	"+60132248890"	2026-08-01 15:59:20.106+00
contact_whatsapp	"+60132248890"	2026-08-01 15:59:36.458+00
social_facebook	""	2026-08-01 16:00:41.995+00
site_logo	"branding/freshgo-logo-image.webp"	2026-08-01 22:39:32.779+00
site_name	"FreshGo"	2026-08-01 22:42:28.08+00
show_home_testimonials	"true"	2026-08-01 22:46:25.027+00
allow_customer_registration	"true"	2026-08-01 22:46:30.975+00
show_suppliers	"true"	2026-08-01 22:46:59.081+00
show_family_combo	"true"	2026-08-01 22:47:00.297+00
show_shop	"true"	2026-08-01 22:47:05.744+00
show_recurring_basket	"true"	2026-08-01 22:47:07.034+00
maintenance_mode	"false"	2026-08-01 22:47:09.581+00
show_home_delivery_schedule	"true"	2026-08-01 22:47:14.777+00
default_product_sort	"manual"	2026-08-02 12:53:24.185706+00
default_combo_sort	"manual"	2026-08-02 12:53:24.185706+00
pickup_locations	["Delivery to Lobby A Rimbun", "Delivery to Lobby B Rimbun", "Delivery to Security House Zamrud Blok E", "Delivery to Meja depan Surau Zamrud CD", "Delivery to Meja depan Zaeem Mart Zamrud Blok AB", "Delivery to Lobby A Mutiara", "Delivery to Lobby B Mutiara", "Delivery to Lobby C Mutiara", "Delivery to Security House Emas", "Delivery to Meja Blok AB Mirai", "Delivery to Meja Blok CD Mirai"]	2026-08-02 15:30:41.949+00
announcement_message	"We deliver to your door every Wednesday & Friday, 6:30PM – 8:30PM"	2026-08-04 11:41:56.3+00
delivery_days	["Wednesday", "Friday"]	2026-08-04 11:42:36.144+00
delivery_time	"6:30–8:30 PM"	2026-08-04 11:42:36.6+00
\.


--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."suppliers" ("id", "name", "contact_person", "phone", "email", "address", "is_active", "created_by", "created_at", "updated_at", "currency", "payment_terms", "tax_id", "account_ref") FROM stdin;
1	Shah	\N	\N	\N	\N	t	\N	2026-08-08 05:57:55.50389+00	2026-08-08 05:57:55.50389+00	MYR	\N	\N	\N
\.


--
-- Data for Name: supplier_price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."supplier_price_history" ("id", "product_id", "supplier_id", "supplier_name", "cost_price", "effective_from", "effective_to", "is_active", "created_by", "created_at", "updated_at", "updated_by") FROM stdin;
2	selar-kuning	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
3	siakap	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
4	tenggiri-potong	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
5	sotong-kembang	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
6	talapia-merah	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
7	tenggiri	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
8	broiler-chicken	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
9	jenahak-potong	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
10	jenahak-b	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
11	tongkol-hitam	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
12	bawal-hitam	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
13	tongkol-putih	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
14	udang-rencah	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
15	kerisi-a	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
16	mabong-a	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
17	nyok	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
18	keli	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
19	sardin	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
20	sotong-a	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
21	bawal-putih	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
22	cencaru	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
23	merah-potong	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
24	merah-b	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
25	parang	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
26	pelaling	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
27	selar	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
28	udang-a	\N		0.00	2026-08-08 05:55:10.828602+00	\N	t	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:55:10.828602+00	\N
1	bawal-emas	\N		0.00	2026-08-08 05:55:10.828602+00	2026-08-08 05:57:55.50389+00	f	\N	2026-08-08 05:55:10.828602+00	2026-08-08 05:57:55.50389+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
29	bawal-emas	1	Shah	28.00	2026-08-08 05:57:55.50389+00	\N	t	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 05:57:55.50389+00	2026-08-08 05:57:55.50389+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
30	senangin	\N	Shah	35.00	2026-08-08 06:00:27.163728+00	2026-08-08 06:00:27.282772+00	f	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 06:00:27.163728+00	2026-08-08 06:00:27.282772+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
31	senangin	1	Shah	35.00	2026-08-08 06:00:27.282772+00	2026-08-08 07:30:48.96567+00	f	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 06:00:27.282772+00	2026-08-08 07:30:48.96567+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
32	senangin	1	Shah	34.00	2026-08-08 07:30:48.96567+00	\N	t	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 07:30:48.96567+00	2026-08-08 07:30:48.96567+00	b98b5fc8-3940-49dc-95b2-acc4e2420337
\.


--
-- Data for Name: supplier_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."supplier_profiles" ("id", "user_id", "vendor_id", "display_name", "created_at") FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY "public"."user_roles" ("id", "role", "created_at") FROM stdin;
b98b5fc8-3940-49dc-95b2-acc4e2420337	admin	2026-07-17 15:23:35.102768+00
45938e83-d40a-411a-93bc-3134d97aadca	supplier	2026-07-18 04:16:03.866497+00
d2ca418a-680e-480c-9b86-e734a4a8f796	delivery_rider	2026-08-03 11:15:48.36669+00
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") FROM stdin;
product-images	product-images	\N	2026-07-27 23:31:08.930154+00	2026-07-27 23:31:08.930154+00	t	f	10485760	\N	\N	STANDARD
branding	branding	\N	2026-08-01 16:28:58.096591+00	2026-08-01 16:28:58.096591+00	t	f	3145728	{image/jpeg,image/png,image/webp}	\N	STANDARD
\.


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets_analytics" ("name", "type", "format", "created_at", "updated_at", "id", "deleted_at") FROM stdin;
\.


--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."buckets_vectors" ("id", "type", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") FROM stdin;
d46348d5-23db-41fa-8d14-145e5d896eab	product-images	combos/chatgpt-image-aug-1-2026-06-57-41-pm.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 10:57:50.596798+00	2026-08-01 10:57:50.596798+00	2026-08-01 10:57:50.596798+00	{"eTag": "\\"40d1b6314ebbcbac311a85d2dd7fc80e\\"", "size": 298138, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T10:57:51.000Z", "contentLength": 298138, "httpStatusCode": 200}	6255881d-ada1-433b-8d56-7721779c3544	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
012d1912-7a19-492f-940f-3e9f832473ec	product-images	fish/merah-potong-red-grouper-cut.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-08 06:00:17.735661+00	2026-08-08 06:00:17.735661+00	2026-08-08 06:00:17.735661+00	{"eTag": "\\"cfce4ece8baeed1802650d66da4d3427\\"", "size": 246282, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-08T06:00:18.000Z", "contentLength": 246282, "httpStatusCode": 200}	8169c1ab-5f04-4095-a729-8eff6df9f908	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
8cdd12e4-6e7d-4b23-badb-d5321a96444f	product-images	fish/bawal-hitam-black-pomfret-under-3mb.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:47:34.269896+00	2026-07-29 14:47:34.269896+00	2026-07-29 14:47:34.269896+00	{"eTag": "\\"d90ec35522491af7849dd3705d8a6807\\"", "size": 340734, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:47:35.000Z", "contentLength": 340734, "httpStatusCode": 200}	0d9f3852-8129-4381-80ad-49876d974be4	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
8f6a1648-fe01-4867-afcd-bb0f2da68c77	product-images	fish/bawal-putih-white-pomfret.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:48:11.366132+00	2026-07-29 14:48:11.366132+00	2026-07-29 14:48:11.366132+00	{"eTag": "\\"24ace9f10fa78cb903f130d78ff7c8f2\\"", "size": 194188, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:48:12.000Z", "contentLength": 194188, "httpStatusCode": 200}	7f65cbf2-374c-47dd-bb7e-cb126c6fe21c	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
b3015a6a-34f7-4452-9026-16607deb588c	product-images	fish/siakap.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-27 23:38:10.068919+00	2026-07-28 16:34:39.540003+00	2026-07-27 23:38:10.068919+00	{"eTag": "\\"ed97be7a6912188ffe6445b138366f82\\"", "size": 200864, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-28T16:34:40.000Z", "contentLength": 200864, "httpStatusCode": 200}	d37b3183-ece9-4aee-abdd-209ab939d0cc	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
4bbec5df-eb46-4a33-a4ed-a87ae6a66ffb	product-images	fish/cencaru-torpedo-scad.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:51:40.378648+00	2026-07-29 14:51:40.378648+00	2026-07-29 14:51:40.378648+00	{"eTag": "\\"7cd6e2687a2e92e223ebb6b3763d8522\\"", "size": 209492, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:51:41.000Z", "contentLength": 209492, "httpStatusCode": 200}	b66799fe-7ba2-4532-904b-bd5aabad1a61	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
87a36e58-6649-4732-95c1-904404afd816	product-images	fish/mabong-a-indian-mackerel.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:52:00.639327+00	2026-07-29 14:52:00.639327+00	2026-07-29 14:52:00.639327+00	{"eTag": "\\"84c50e89c8e40019ddf87fed5a1bb5e7\\"", "size": 190512, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:52:01.000Z", "contentLength": 190512, "httpStatusCode": 200}	9b575b68-2504-425e-9418-13f1167e510c	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
3903d8a2-868c-461b-b799-cfdc82dd3052	product-images	fish/kerisi-a-pink-snapper.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:52:32.248063+00	2026-07-29 14:52:32.248063+00	2026-07-29 14:52:32.248063+00	{"eTag": "\\"b32a80ceccd5a634dee26273620eca97\\"", "size": 237428, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:52:33.000Z", "contentLength": 237428, "httpStatusCode": 200}	464040eb-77ef-497c-89a9-7d88cdbd930c	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
ec8d19fd-b518-47ae-8d70-39a6d8b80982	product-images	fish/selar-oxeye-scad.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:53:53.388955+00	2026-07-29 14:53:53.388955+00	2026-07-29 14:53:53.388955+00	{"eTag": "\\"0ccec4087f83239c74cea7d7ce0cfddc\\"", "size": 252280, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:53:54.000Z", "contentLength": 252280, "httpStatusCode": 200}	f4c4ad67-35d4-4ab3-a212-00dacfa3048e	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
a97067f0-2f9f-4deb-8827-851cfe868557	product-images	fish/selar-kuning.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:56:29.25596+00	2026-07-29 14:56:29.25596+00	2026-07-29 14:56:29.25596+00	{"eTag": "\\"b7166c0303d34e99adf8ce9fba976250\\"", "size": 277846, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:56:30.000Z", "contentLength": 277846, "httpStatusCode": 200}	c48652f1-6e44-497c-aa84-a4acd98db87f	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
c52c3b26-5a5c-41c8-9880-04748893a9a1	product-images	fish/jenahak-b-red-snapper-b.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:49:35.998094+00	2026-07-29 15:41:30.4977+00	2026-07-29 14:49:35.998094+00	{"eTag": "\\"41c4494d800e9e66584d0e78a0b8b9a3\\"", "size": 262560, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:41:31.000Z", "contentLength": 262560, "httpStatusCode": 200}	8242267b-fb46-499f-b689-eb84de9851ba	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
3796fa4b-9018-4211-883a-ac172c685808	product-images	fish/nyok-indian-halibut.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:54:16.037218+00	2026-07-29 14:54:16.037218+00	2026-07-29 14:54:16.037218+00	{"eTag": "\\"99f554f923f0ba432a24c041dd61ea75\\"", "size": 220384, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:54:17.000Z", "contentLength": 220384, "httpStatusCode": 200}	b5fdd1ae-5119-4d06-8100-889af59e8564	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
7f6d73c8-c601-4101-97c4-a7e2d5327e45	product-images	fish/parang-wolf-herring.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:54:39.462063+00	2026-07-29 14:54:39.462063+00	2026-07-29 14:54:39.462063+00	{"eTag": "\\"79e182817705af68e3fc3995dd9028b3\\"", "size": 239442, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:54:40.000Z", "contentLength": 239442, "httpStatusCode": 200}	3981fa75-1153-46e3-a107-79aa66bb6f7c	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
2af71e2d-d85f-434b-b3de-b598fd98aef5	product-images	fish/pelaling-yellowstripe-scad.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 14:55:02.975312+00	2026-07-29 14:55:02.975312+00	2026-07-29 14:55:02.975312+00	{"eTag": "\\"20d515845eb3bcf3e8da43222d5ed665\\"", "size": 194342, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T14:55:03.000Z", "contentLength": 194342, "httpStatusCode": 200}	b699f51d-fb62-444a-bdd5-9345f852e605	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
45f0b0dd-7555-4ff7-a55d-55666fbfb760	branding	branding/freshgo-logo.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 16:30:36.042301+00	2026-08-01 16:30:36.042301+00	2026-08-01 16:30:36.042301+00	{"eTag": "\\"048c2853daa356753ca42cdd1c0bb83d\\"", "size": 33148, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T16:30:37.000Z", "contentLength": 33148, "httpStatusCode": 200}	551c0357-8754-43d3-aee9-c7c5a7254af5	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
fe0b9471-fe20-4f26-9641-7cae83f6629d	product-images	fish/sardin-indian-oil-sardine.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:28:13.341746+00	2026-07-29 15:28:13.341746+00	2026-07-29 15:28:13.341746+00	{"eTag": "\\"c1295d29aef659ce7bd44dfb824f0b29\\"", "size": 306166, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:28:14.000Z", "contentLength": 306166, "httpStatusCode": 200}	b3cd92f5-0a25-4b8b-9f7b-b1586dcfdc28	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
b60b58ce-11bf-4cfa-9b0e-5da54e55794b	product-images	fish/talapia-merah-red-tilapia.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:30:03.956932+00	2026-07-29 15:30:03.956932+00	2026-07-29 15:30:03.956932+00	{"eTag": "\\"72bc6889646ff5743102d9b134ae24d4\\"", "size": 277134, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:30:04.000Z", "contentLength": 277134, "httpStatusCode": 200}	873539fc-1cee-460c-96d1-7947cea24046	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
fbe97610-2cbb-49b1-808c-f1fde7c377a9	product-images	fish/tongkol-hitam-frigate-tuna.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:33:13.935716+00	2026-07-29 15:33:13.935716+00	2026-07-29 15:33:13.935716+00	{"eTag": "\\"95c33e9a1cc1065e19ba4fcaf2dc6f22\\"", "size": 282512, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:33:14.000Z", "contentLength": 282512, "httpStatusCode": 200}	5d562470-c44b-41d0-9fa9-16f7bc1d8d87	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
40b7bd4f-5937-4a8b-bed1-6560e519cbd5	product-images	fish/keli-catfish.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:34:56.914272+00	2026-07-29 15:34:56.914272+00	2026-07-29 15:34:56.914272+00	{"eTag": "\\"d6b5d94961e160c2799c8ea3a62c5593\\"", "size": 278712, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:34:57.000Z", "contentLength": 278712, "httpStatusCode": 200}	645d42c0-a665-4d61-896d-ff68c02bc6c7	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
d0f55344-a5f7-457d-ba22-ebe94ab76670	product-images	fish/tongkol-putih-bullet-tuna.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:36:22.328656+00	2026-07-29 15:36:22.328656+00	2026-07-29 15:36:22.328656+00	{"eTag": "\\"68afee45e892c7ac2452fc779c71c34e\\"", "size": 204268, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:36:23.000Z", "contentLength": 204268, "httpStatusCode": 200}	07ff2ce9-8f1f-4aea-a9c1-30df81d634b2	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
b20a57dc-bed1-4e8a-871a-6f78a9265670	product-images	fish/jenahak-potong-red-snapper-cut-2.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:41:15.511899+00	2026-07-29 15:41:15.511899+00	2026-07-29 15:41:15.511899+00	{"eTag": "\\"598bbd750fc0dbba34e6035e44f01943\\"", "size": 300948, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:41:16.000Z", "contentLength": 300948, "httpStatusCode": 200}	57be4380-e72f-49d7-a144-964c9dcbb11f	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
562a2cbb-9fb8-48b1-8042-bed5694e40c6	product-images	fish/tenggiri-potong-under-3mb.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:45:10.594746+00	2026-07-29 15:45:10.594746+00	2026-07-29 15:45:10.594746+00	{"eTag": "\\"ea9c9a7b3444fac308ef522aa6806b55\\"", "size": 369854, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:45:11.000Z", "contentLength": 369854, "httpStatusCode": 200}	3f5bfeda-b65e-4962-9f76-ee5bd44aa340	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
c4d85ca8-8e7e-443a-aaae-e57d229be467	product-images	fish/bawal-emas-golden-pomfret-under-3mb.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 07:15:26.496664+00	2026-08-01 07:15:26.496664+00	2026-08-01 07:15:26.496664+00	{"eTag": "\\"7481e4731edacd609b05c819f2333a50\\"", "size": 347058, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T07:15:27.000Z", "contentLength": 347058, "httpStatusCode": 200}	9f21f6d6-3a0c-4386-91d7-574160550054	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
19e640a9-404b-47d5-9be9-6879dd3f9ab6	branding	branding/freshgo-logo-image.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 22:39:31.661536+00	2026-08-01 22:39:31.661536+00	2026-08-01 22:39:31.661536+00	{"eTag": "\\"3d76df3f0910337df1b2db67a6916b44\\"", "size": 17694, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T22:39:32.000Z", "contentLength": 17694, "httpStatusCode": 200}	a7f761b7-02ad-429c-b7d1-dfbb2c1bf685	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
6fee927d-84ba-4e7e-b4c6-aff067ea16cc	product-images	fish/tenggiri-spanish-mackerel.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 15:45:18.716227+00	2026-07-29 15:45:18.716227+00	2026-07-29 15:45:18.716227+00	{"eTag": "\\"cd6cc902356e458f180fb6d867dd8908\\"", "size": 200958, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T15:45:19.000Z", "contentLength": 200958, "httpStatusCode": 200}	a907d553-22aa-4f5c-82b5-77897315c054	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
5730fa87-64bb-4eb8-9d45-a4d60fdea2fb	product-images	combos/mabong-a-indian-mackerel.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 10:18:18.300436+00	2026-08-01 10:18:18.300436+00	2026-08-01 10:18:18.300436+00	{"eTag": "\\"84c50e89c8e40019ddf87fed5a1bb5e7\\"", "size": 190512, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T10:18:19.000Z", "contentLength": 190512, "httpStatusCode": 200}	5ed9a1bb-2737-493c-a8c2-b97b97655813	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
fc394aaa-0d77-4349-9b13-7faed5ac6d53	product-images	fish/merah-potong-red-grouper-cut-2.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:06:50.061557+00	2026-07-29 16:06:50.061557+00	2026-07-29 16:06:50.061557+00	{"eTag": "\\"4e95a35a737120f49adb8c91a0f1af65\\"", "size": 274220, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:06:51.000Z", "contentLength": 274220, "httpStatusCode": 200}	95be5990-a493-4375-8cfa-84b4e3ccac1e	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
5dab975d-84ff-447c-ae61-012fd5ae268e	product-images	prawns/udang-a.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:14:17.172877+00	2026-07-29 16:14:17.172877+00	2026-07-29 16:14:17.172877+00	{"eTag": "\\"957c0f79ea3c0b8891510b0606040ff0\\"", "size": 309980, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:14:18.000Z", "contentLength": 309980, "httpStatusCode": 200}	14ced29d-d7d4-4a15-a003-987f42e55886	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
39e69ad8-f4b3-4754-9a90-c1ec66180d48	product-images	prawns/udang-a-pinggan.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:16:03.902587+00	2026-07-29 16:16:03.902587+00	2026-07-29 16:16:03.902587+00	{"eTag": "\\"3e05e7b08a9d0547eba99b268934f22d\\"", "size": 86292, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:16:04.000Z", "contentLength": 86292, "httpStatusCode": 200}	ad8326f8-ed2b-417b-b1d4-febaf3ed32f9	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
7a2369fa-9a7b-4718-add9-1d89902c9fad	product-images	squid/sotong-a.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:21:14.208415+00	2026-07-29 16:21:14.208415+00	2026-07-29 16:21:14.208415+00	{"eTag": "\\"d7abc932da7f36135101e76922760e84\\"", "size": 307906, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:21:15.000Z", "contentLength": 307906, "httpStatusCode": 200}	cd78a7b4-c44c-4f95-ab72-2aa9fcccb9dd	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
a905b744-970b-479c-9133-61fe648f530f	product-images	squid/sotong-kembang.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:26:40.864689+00	2026-07-29 16:26:40.864689+00	2026-07-29 16:26:40.864689+00	{"eTag": "\\"32984adcd4417325395c95bb61891a23\\"", "size": 241126, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:26:41.000Z", "contentLength": 241126, "httpStatusCode": 200}	542467e4-dcec-4c88-997c-347a7eea8338	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
c950ea39-42e9-4021-be46-8375544bf0a2	product-images	chicken/ayam-potong.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:32:23.484989+00	2026-07-29 16:32:23.484989+00	2026-07-29 16:32:23.484989+00	{"eTag": "\\"e5799b40decf725477270b58ee38ecfa\\"", "size": 214598, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:32:24.000Z", "contentLength": 214598, "httpStatusCode": 200}	cea481cd-f695-4097-a38c-23e2b4a7aa49	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
6e61854c-45c2-44ad-ab77-2dd7251873ca	product-images	chicken/ayam-potong-2.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:33:35.28868+00	2026-07-29 16:33:35.28868+00	2026-07-29 16:33:35.28868+00	{"eTag": "\\"4c4c5ffc493d0e1fcb35a2e87ff7ad01\\"", "size": 281182, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:33:36.000Z", "contentLength": 281182, "httpStatusCode": 200}	6975c057-e156-44df-bbfc-ce21eacc6570	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
28271d0f-6e7b-415f-a77a-f0b2899072b2	product-images	chicken/ayam-segar-1.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:43:27.203408+00	2026-07-29 16:43:27.203408+00	2026-07-29 16:43:27.203408+00	{"eTag": "\\"efbdebf1ce9b2349290debaccef916a5\\"", "size": 123200, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:43:28.000Z", "contentLength": 123200, "httpStatusCode": 200}	63fd1779-6d4f-4029-b998-19ac6a89e318	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
aacba6b3-4313-4352-9afd-ee883af616ef	product-images	chicken/ayam-segar-2.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:43:30.834274+00	2026-07-29 16:43:30.834274+00	2026-07-29 16:43:30.834274+00	{"eTag": "\\"4c7b63bdf01ca1450273e970e8395e82\\"", "size": 122892, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:43:31.000Z", "contentLength": 122892, "httpStatusCode": 200}	9cb5c3a9-019d-4d5d-bae3-3ddef580a3cd	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
95f341e5-0aa9-450f-8fb1-57c0f2987727	product-images	combos/ayam-segar-1.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 01:10:29.204698+00	2026-08-01 01:10:29.204698+00	2026-08-01 01:10:29.204698+00	{"eTag": "\\"efbdebf1ce9b2349290debaccef916a5\\"", "size": 123200, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T01:10:30.000Z", "contentLength": 123200, "httpStatusCode": 200}	0fd6c0ae-e20a-4fca-80f5-f808871311d8	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
187ab533-f6c3-4020-9d46-513aecd848a5	product-images	fish/merah-b-red-grouper-b.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-07-29 16:47:09.962582+00	2026-07-29 16:47:49.519089+00	2026-07-29 16:47:09.962582+00	{"eTag": "\\"88dd61bd3d991148fec356feacab88fe\\"", "size": 284012, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-07-29T16:47:50.000Z", "contentLength": 284012, "httpStatusCode": 200}	58842b0b-8aa5-423e-9306-49dd519b6498	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
d7d91163-4956-4ada-800d-62b0c0cd715d	product-images	combos/ayam-segar-2.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 01:25:38.974568+00	2026-08-01 01:25:38.974568+00	2026-08-01 01:25:38.974568+00	{"eTag": "\\"4c7b63bdf01ca1450273e970e8395e82\\"", "size": 122892, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T01:25:39.000Z", "contentLength": 122892, "httpStatusCode": 200}	7680513d-d531-41ba-8255-c8a5a0f35da3	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
6125334e-5efc-4d54-a438-75dc54db5239	product-images	combos/merah-b-red-grouper-b.webp	b98b5fc8-3940-49dc-95b2-acc4e2420337	2026-08-01 01:27:15.908536+00	2026-08-01 01:27:15.908536+00	2026-08-01 01:27:15.908536+00	{"eTag": "\\"88dd61bd3d991148fec356feacab88fe\\"", "size": 284012, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-08-01T01:27:16.000Z", "contentLength": 284012, "httpStatusCode": 200}	a641baaa-9ca0-4ce4-a405-2d9822a519f9	b98b5fc8-3940-49dc-95b2-acc4e2420337	{}
\.


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."s3_multipart_uploads" ("id", "in_progress_size", "upload_signature", "bucket_id", "key", "version", "owner_id", "created_at", "user_metadata", "metadata") FROM stdin;
\.


--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."s3_multipart_uploads_parts" ("id", "upload_id", "size", "part_number", "bucket_id", "key", "etag", "owner_id", "version", "created_at") FROM stdin;
\.


--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY "storage"."vector_indexes" ("id", "name", "bucket_id", "data_type", "dimension", "distance_metric", "metadata_configuration", "created_at", "updated_at") FROM stdin;
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 574, true);


--
-- Name: Orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."Orders_id_seq"', 53, true);


--
-- Name: delivery_batch_manifest_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."delivery_batch_manifest_id_seq"', 1, false);


--
-- Name: delivery_points_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."delivery_points_id_seq"', 17, true);


--
-- Name: historical_business_daily_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."historical_business_daily_id_seq"', 64, true);


--
-- Name: selling_price_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."selling_price_history_id_seq"', 30, true);


--
-- Name: supplier_price_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."supplier_price_history_id_seq"', 32, true);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('"public"."suppliers_id_seq"', 1, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict wutzR88XgcUssDAsnZFFXuTpeidIBIsSro38nkHKin5XG0EEutUlc9PrQh3OBmc

RESET ALL;
