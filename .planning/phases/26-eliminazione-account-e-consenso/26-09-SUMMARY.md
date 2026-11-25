---
phase: 26-eliminazione-account-e-consenso
plan: 09
subsystem: auth, eventsub
tags: [account-deletion, twitch-helix, app-token, privacy]
requires: ["26-08"]
provides:
  - "src/eventsub/helix/twitch-app-token.cache.ts: TwitchAppCredentials; TwitchAppTokenCache(credentials | null, clock, unavailableMessage = NOT_MANAGED_MESSAGE) senza decoratori Nest; twitchAppTokenCacheProvider (inject [EVENTSUB_CONFIG, Clock], credenziali solo in modalità gestita)"
  - "src/auth/twitch/twitch-login-name.ts: TWITCH_LOGIN_MAX_RAW_LENGTH = 64, normalizedTwitchLoginOf(raw)"
  - "src/auth/twitch/twitch-user-directory.ts: TwitchUserLookupError (messaggio fisso TWITCH_USER_LOOKUP_FAILED_MESSAGE), porta astratta TwitchUserDirectory.userIdOfLogin"
  - "src/auth/twitch/http-twitch-user-directory.ts: HELIX_USERS_URL, USER_LOOKUP_NOT_CONFIGURED_MESSAGE, HttpTwitchUserDirectory(clientId | null, tokens), twitchUserDirectoryProvider (provide TwitchUserDirectory, inject [AUTH_CONFIG, Clock])"
  - "test/auth/fake-twitch-user-directory.ts: FakeTwitchUserDirectory (idsByLogin, unreachable, lookedUpLogins, reset)"
affects: [26-10]
tech-stack:
  added: []
  patterns:
    - "cache del token app parametrica sulle credenziali, istanze costruite da factory provider"
    - "porta della directory normalizza da sé il nome: la forma si controlla prima di qualunque chiamata a Twitch"
key-files:
  created:
    - src/auth/twitch/twitch-login-name.ts
    - src/auth/twitch/twitch-login-name.spec.ts
    - src/auth/twitch/twitch-user-directory.ts
    - src/auth/twitch/http-twitch-user-directory.ts
    - src/auth/twitch/http-twitch-user-directory.spec.ts
    - test/auth/fake-twitch-user-directory.ts
  modified:
    - src/eventsub/helix/twitch-app-token.cache.ts
    - src/eventsub/helix/twitch-app-token.cache.spec.ts
    - src/eventsub/helix/http-twitch-helix.client.spec.ts
    - src/eventsub/eventsub.module.ts
decisions:
  - "La forma del nome si controlla con `^[A-Za-z0-9_]{1,25}$` PRIMA del minuscolo e poi si abbassa: equivale alla forma minuscola del piano ma esclude i caratteri non ASCII che `toLowerCase` trasforma in ASCII (es. il segno Kelvin U+212A → `k`)"
  - "Il tetto di 64 caratteri vale sul testo grezzo, prima del trim"
  - "`HttpTwitchUserDirectory.userIdOfLogin` normalizza da sé il nome ricevuto (idempotente): il piano 10 può passare il testo dell'oste così com'è o già normalizzato"
  - "Status 400 di Helix → `null` (nome non accettato da Twitch = utente inesistente), corpo scartato; ogni altro non-2xx dopo l'eventuale ritentativo sul 401 → `TwitchUserLookupError`"
  - "Risposta 200 malformata (`data` non array o primo elemento senza un id numerico di `TWITCH_USER_ID_PATTERN`) → `TwitchUserLookupError` (Twitch non affidabile, non «utente inesistente»)"
  - "Messaggio di `TwitchUserLookupError`: `Twitch user lookup failed: <messaggio di TwitchHelixError>` (solo operazione `Helix get users` e status, o nome dell'errore di rete); qualunque altro errore → messaggio fisso senza dettagli; nessun `cause` agganciato"
  - "Credenziali assenti: la cache della directory rifiuta con `USER_LOOKUP_NOT_CONFIGURED_MESSAGE` (terzo argomento del costruttore), non col messaggio di EventSub"
metrics:
  duration: "30 min"
  completed: 2026-11-25
  tasks: 3
  files: 10
---

# Phase 26 Plan 09: token app Twitch parametrico e TwitchUserDirectory — Summary

La cache del token app Twitch si costruisce da una coppia di credenziali qualunque (`TwitchAppCredentials | null`): EventSub ne riceve un'istanza dalla factory `twitchAppTokenCacheProvider` solo in modalità gestita (comportamento invariato), la nuova porta `TwitchUserDirectory` ne costruisce una propria dalle credenziali del login (`AUTH_CONFIG.twitch`) e risolve un nome utente Twitch nel suo ID via `GET https://api.twitch.tv/helix/users?login=…`, con `null` per nome inesistente o fuori forma e `TwitchUserLookupError` per Twitch non raggiungibile, senza mai scrivere il nome in un messaggio o in un log (D-15, D-20, D-25).

## Task

| Task | Commit | Cosa |
|------|--------|------|
| 1 RED | `aff43f6b` | `test(auth): expect a Twitch app token cache built from credentials` |
| 1 GREEN | `d020635b` | `refactor(auth): build the Twitch app token cache from credentials` |
| 2 RED | `22b8596b` | `test(auth): expect the Twitch username lookup` |
| 2 GREEN | `e37db8a9` | `feat(auth): look up a Twitch id from a username` |
| 3 | (questo commit) | bookkeeping |

## Fallimenti RED

- Task 1: 17/17 della spec della cache e 41 casi della spec del client Helix rossi. La cache di oggi riceveva le credenziali al posto della config (`mode` assente → rifiuto «non gestito» in ogni caso); `twitchAppTokenCacheProvider` non esisteva (`Cannot read properties of undefined (reading 'useFactory')`).
- Task 2: le due suite non partono, `Could not locate module src/auth/twitch/twitch-login-name` (e `http-twitch-user-directory`): moduli inesistenti.

## Casi esistenti riscritti (spec della cache)

- `buildCache` costruisce con `new TwitchAppTokenCache(credentials, clock)` (credenziali di default uguali a quelle della config EventSub di test): cache fresca, margine, richieste concorrenti, invalidazione, `expires_in` mancante o zero, errore senza segreto, risposta senza token restano identici nel significato.
- `requests a client credentials token with the EventSub credentials`: ora costruisce la cache con la factory dalla config gestita (stesso URL, stesso corpo).
- `refuses to request a token in %s mode` (local, disabled) → `refuses a token for a %s EventSub config with the not-managed message (D-20)`, via factory, con `NOT_MANAGED_MESSAGE` e nessuna `fetch`: il rifiuto di oggi resta coperto.
- Nuovi: `refuses a token without credentials (D-20)`, `refuses a token without credentials with the message it was built with (D-20)`, `fetches a token with the credentials it was built with (D-20)`, `builds the EventSub cache only from a managed config (D-20)`.
- `http-twitch-helix.client.spec.ts`: `buildClient` costruisce la cache con `twitchAppTokenCacheProvider.useFactory(config, clock)` (stessa `EventSubConfig`); nessun caso toccato, il caso `rejects in a non managed environment without any request` continua a provare il rifiuto con config `local`.

## EventSub invariato

`npx jest src/eventsub --selectProjects unit`: 13 suite, 254 test verdi. `npx jest src/eventsub test/eventsub --selectProjects integration --runInBand`: 5 suite, 38 test verdi (il modulo EventSub risolve la cache dalla factory con `EVENTSUB_CONFIG` e `Clock`). `npx tsc --noEmit -p tsconfig.json` esce 0.

Acceptance: `EVENTSUB_CONFIG` compare due volte in `twitch-app-token.cache.ts`, nell'import e nell'`inject` della factory (lettura a mano); `@Inject(EVENTSUB_CONFIG)` 0; `twitchAppTokenCacheProvider` in `eventsub.module.ts` 2 (import e provider).

## Directory

`npx jest src/auth/twitch/twitch-login-name.spec.ts src/auth/twitch/http-twitch-user-directory.spec.ts --selectProjects unit`: 2 suite, 25 test verdi. Acceptance: `export function normalizedTwitchLoginOf` 1, `new TwitchAppTokenCache(` 1, `logger.(log|warn|error)` 0, `process.env.` aggiunti sotto `src` dal `PHASE_BASE` 0.

Trattamento del 400: Helix risponde 400 a un `login` malformato; dato che la forma è già controllata prima della chiamata, un 400 residuo si legge come «nessun utente con quel nome» (`null`, poi `TWITCH_USER_NOT_FOUND` nel piano 10), non come Twitch non raggiungibile.

Casi aggiunti oltre al piano: normalizzazione dentro l'adattatore (`' @Some_User '` → URL con `some_user`), nome fuori forma o oltre 64 caratteri → `null` senza nessuna `fetch`, risposta malformata → `TwitchUserLookupError`, factory dalle credenziali del login (`client_id`/`client_secret` e `Client-Id` di `AUTH_CONFIG.twitch`), factory con `twitch: null` → `TwitchUserLookupError` senza rete. Il caso D-25 verifica i messaggi per 500, 403, errore di rete col nome nel messaggio e JSON non valido; ogni `lookupErrorOf` controlla anche che token e client secret non compaiano.

## Deviations from Plan

- Il titolo del caso a tabella del normalizzatore è `refuses what cannot be a Twitch username: %s (D-15)` (un caso per input invece di uno solo); in più `caps the raw text at 64 characters before trimming (D-15)` e il segno Kelvin fra gli input rifiutati.
- Nella spec della cache il caso del rifiuto locale è il `it.each` esistente rititolato (local e disabled) invece di un caso separato, per non duplicarlo.
- Costruttore della cache con terzo argomento `unavailableMessage` usato dalla directory (`USER_LOOKUP_NOT_CONFIGURED_MESSAGE`): previsto dall'interfaccia del piano, coperto da un caso in più.
- Warning eslint `no-base-to-string` su `String(url)` nelle due spec Helix di EventSub: preesistenti (righe già presenti prima del piano), non toccate.

Nessun provider è entrato in un modulo: `twitchUserDirectoryProvider` lo registrerà il piano 10 (servono `AUTH_CONFIG`, esportato da `AuthModule`, e un `Clock` nel modulo che lo ospita).

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit `aff43f6b`, `d020635b`, `22b8596b`, `e37db8a9` presenti nella storia del branch.
