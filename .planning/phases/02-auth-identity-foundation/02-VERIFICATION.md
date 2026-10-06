---
phase: 02-auth-identity-foundation
verified: 2026-10-06T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Login Twitch reale end-to-end con le chiavi vere (BACKEND-NOTES §8)"
    expected: "GET /auth/twitch/start -> 302 verso id.twitch.tv con scope= vuoto accettato; callback -> klimmeck://auth?ticket=...; exchangeLoginTicket restituisce AuthSession; /oauth2/validate restituisce user_id"
    why_human: "Le chiavi TWITCH_CLIENT_ID/SECRET non esistono ancora; la fase e verificata con client Twitch fake iniettabile (decisione utente). Va confermato anche che Twitch accetti scope vuoto (Assumption A1)."
  - test: "Pipeline GitHub Actions reale (build + gate schema)"
    expected: "Il workflow ci.yml passa su GitHub (build, test, git diff --exit-code src/schema.gql)"
    why_human: "Il branch non e stato pushato; la pipeline non e eseguibile localmente."
  - test: "Controllo duplicati twitchId su dati reali prima del deploy dell'indice unico (BACKEND-NOTES §10, D-32)"
    expected: "Nessun twitchId duplicato nella collection users reale; il verifier al boot non fallisce"
    why_human: "Richiede accesso al database reale/di produzione."
  - test: "Conferma utente della decisione D-26 (grace window di refresh 30 s)"
    expected: "L'utente approva 30 s oppure indica un altro valore"
    why_human: "Decisione di prodotto in attesa di conferma esplicita."
---

# Phase 2: Auth & Identity Foundation — Report di verifica

**Obiettivo della fase:** Il backend ha un seam di autenticazione a JWT di sessione che protegge ogni operazione GraphQL (HTTP + WS) e REST, con dev bypass fail-closed compatibile con lo stub FE e un handoff documentato.
**Verificato:** 2026-10-06
**Stato:** human_needed (nessun gap automatico; restano 4 verifiche manuali concordate)
**Re-verifica:** No, verifica iniziale

## Esiti automatici (eseguiti in questa verifica)

| Controllo | Esito |
| --- | --- |
| `npm test` (unit + integration in band) | unit: 20 suite / 172 test passati; integration: 17 suite / 125 test passati; totale 297/297, 0 falliti |
| `npx tsc --noEmit -p tsconfig.build.json` | OK, nessun errore |
| `npm run build` | OK |
| `git diff --exit-code src/schema.gql` dopo i test | pulito (schema committato allineato) |
| eslint sui soli file `.ts` della fase (`4e84931..HEAD`) | nessun errore/warning |
| Working tree | solo `.planning/config.json` modificato (non toccato dalla fase ne da questa verifica) |

## Verita osservabili (Success Criteria ROADMAP)

| # | Verita | Stato | Evidenza |
| - | ------ | ----- | -------- |
| 1 | Login mediato dal BE (code Twitch scambiato lato server, validate una tantum) -> al riscatto del ticket monouso JWT `{userId, twitchId, role}` + refresh rotante; User risolto/creato per `twitchId` | VERIFIED (con fake Twitch) | `src/auth/twitch/*`, `login-ticket.service`, `auth-session.service`, `users.service` upsert + indice unico `twitchId`; `twitch-auth.controller.int-spec`, `auth.resolver.int-spec`, `app.int-spec` (login completo). Token Twitch revocato subito e mai persistito (`revokeQuietly` in `twitch-login.service.ts`; nessun campo token Twitch in `session.model.ts`/`user.model.ts`). Refresh salvato solo come `sha256Hex` (`session.service.ts`). Il flusso reale con Twitch e un item manuale. |
| 2 | Mutation senza JWT -> errore auth; `@Public()` passa senza JWT; `APP_GUARD` globale copre HTTP e REST Cloudinary | VERIFIED | `auth.module.ts:55` registra `APP_GUARD` -> `AuthGuard` (deny-by-default, transport-aware). `@Public()` solo su 5 handler, esattamente la lista asserita in `test/app.int-spec.ts` (`AppController.getHello`, `AuthResolver.exchangeLoginTicket`, `AuthResolver.refreshSession`, `TwitchAuthController.callback`, `TwitchAuthController.start`), nessuna classe pubblica. `POST /cloudinary/getUrls` senza bearer -> 401 JSON (test). Introspezione pubblica = limite noto D-30 (Phase 10). |
| 3 | WS: JWT assente/invalido in `connection_init` rifiutato in `onConnect`; valido connette e l'identita arriva ai resolver (integration, non context mockato) | VERIFIED | `ws-connection-authenticator.ts`: `onConnect` ritorna `false` (4403) e non lancia mai; timer di scadenza chiude con 4401 (`ws-close-codes.ts`), `unref()` e cleanup in `onClose`; guard rilegge l'identita da `extra` con difesa sulla race di scadenza. Integration su socket reali in plan 02-08. `installSubscriptionHandlers` assente da `src` e `test`. |
| 4 | `DEV_AUTH_ENABLED=true` accetta lo stub FE da `DEV_AUTH_ACCESS_TOKEN`; impossibile con `NODE_ENV=production` | VERIFIED | Fail-closed a due livelli: rifiuto al boot (`auth-config.ts:115`, test in `auth-config.spec`/`env.validation.spec`) e ignorato a runtime (`dev-auth.strategy.ts`: `process.env.NODE_ENV === 'production'` -> `null`, confronto `safeEqual`). Test su HTTP, REST e WS (`dev-auth.strategy.int-spec`, `app.int-spec`, WS int-spec). |
| 5 | Handoff `BACKEND-NOTES` con login, header, `connection_init`, comportamento post-refresh, scope Twitch; chiude Open Questions #1/#2 FE Phase 11 | VERIFIED | `BACKEND-NOTES.md` (396 righe): §1 login, §2 AuthSession, §3 HTTP/REST, §4 WS/`connection_init`, §5 codici errore, §6 refresh/logout, §7 righe `.env` dev bypass, §8 chiavi Twitch, §9 limiti noti, §10 deploy note, §11 avviso di ripianificazione FE Phase 11 e chiusura OQ #1/#2. Scope Twitch: nessuno. |

**Score:** 5/5 verita verificate

## Artefatti e wiring

| Artefatto | Stato | Dettagli |
| --- | --- | --- |
| `src/auth/**` (guard, resolver, session, token, twitch, ws, dev) | VERIFIED | Esistono, sostanziali, importati e usati; `AuthModule` con `APP_GUARD` in `app.module.ts` |
| `src/graphql/graphql-options.factory.ts` (`forRootAsync`) | VERIFIED | Condivisa, cabla l'autenticatore graphql-ws |
| `src/config/auth-config.ts`, `env.validation.ts` | VERIFIED | Boot con solo `JWT_SECRET` e Twitch non configurato (test boot reale in `app.int-spec`) |
| `.env.example` / `.gitignore` | VERIFIED | `.env.example` tracciato; `.env` ignorato (`.gitignore:39`). Nessun secret hardcoded trovato in `src` ne `.env.example` (`.env` non letto) |
| `src/schema.gql` | VERIFIED | Diff vs base solo additivo: `AuthSession`, `exchangeLoginTicket`, `refreshSession`, `logout`, `me`; nessuna operazione esistente rinominata o modificata |
| `.github/workflows/ci.yml` | VERIFIED (statico) | Build + gate schema presenti; esecuzione reale = item manuale |

## Copertura requisiti

| Requisito | Stato | Evidenza |
| --- | --- | --- |
| BE-AUTH-01 | SATISFIED (fake Twitch; reale = manuale) | SC1 |
| BE-AUTH-02 | SATISFIED | SC2 |
| BE-AUTH-03 | SATISFIED | SC3 |
| BE-AUTH-04 | SATISFIED | SC5, BACKEND-NOTES |
| BE-AUTH-05 | SATISFIED | SC4 |
| BE-AUTH-06 | SATISFIED | `@CurrentUser()` usato in `me`/`logout` (nessun `userId`/`twitchId` come argomento nelle nuove operazioni); Cloudinary REST coperto dallo stesso guard (401 testato). Le operazioni pre-esistenti con argomenti identita restano per scelta a Phase 3 (BE-AUTHZ-01..03). |

Tutti i 6 ID dichiarati nei PLAN compaiono in REQUIREMENTS.md (mappati a Phase 2); nessun requisito orfano. Nota: le checkbox di REQUIREMENTS.md/ROADMAP.md (traceability "Pending") sono da aggiornare in chiusura fase dall'orchestratore.

## Rispetto delle decisioni di CONTEXT

D-01 (login BE-mediato, no PKCE Twitch, emendamento SC1), D-12 (whitelist enumerata), D-24 (handoff), D-30 (introspezione pubblica fino a Phase 10), D-32 (indice unico + verifier al boot) risultano onorate. Nessuno scope Phase 3 trapelato: nessun `@Roles`, audit log o ownership nel codice non-test. D-26 attende conferma utente (item manuale).

## Convenzioni git

Branch `feat/02-auth-identity-foundation`, 51 commit con scope `phase-2` e nessun trailer `Co-Authored-By` nel range `4e84931..HEAD`; il branch non risulta pushato (nessun remote tracking).

## Anti-pattern

Nessun blocker. Nessun stub, TODO o placeholder rilevante nei file della fase; lint pulito.

## Verifica umana richiesta

1. **Login Twitch reale** (chiavi in arrivo): flusso completo e conferma che `scope=` vuoto sia accettato (BACKEND-NOTES §8).
2. **Pipeline GitHub Actions reale**: dopo il push del branch.
3. **Duplicati `twitchId` su dati reali**: prima del deploy dell'indice unico (§10).
4. **Conferma D-26**: grace window di refresh a 30 s.

## Riepilogo gap

Nessun gap. La fase raggiunge l'obiettivo; lo stato e `human_needed` solo per le quattro verifiche esterne/decisionali sopra, concordate esplicitamente come manuali.

---

_Verificato: 2026-10-06_
_Verifier: Claude (gsd-verifier)_
