---
status: partial
phase: 06-eventsub-punti-canale-streamer-live
source: [06-VERIFICATION.md]
started: 2026-10-19T19:40:00Z
updated: 2026-10-20T18:10:00Z
---

## Current Test

[testing complete — test 1 passed 2026-10-20; tests 2-3 skipped, deferred to pre-production]

`status: partial` per il template GSD (`partial` se restano test skipped non risolti): i test 2-3 sono obbligatori prima della produzione e devono restare visibili nei controlli di avanzamento.

## Tests

### 1. Twitch CLI contro il BE locale (mode local)
prerequisiti: Twitch CLI 1.1.24; `.env` con `TWITCH_EVENTSUB_SECRET`, `TWITCH_BROADCASTER_ID` e `TWITCH_EVENTSUB_CALLBACK_URL=http://localhost:3000/webhooks/twitch/eventsub` (senza la terza il boot locale viene rifiutato con `EventSub configuration is incomplete: missing TWITCH_EVENTSUB_CALLBACK_URL ...`); Mongo in replica set e Redis come per ogni avvio locale; `npm run start:dev` con il log di boot `EventSub local mode: callback http://localhost:3000/webhooks/twitch/eventsub is not https. ...`; un utente che ha già fatto login nell'app, di cui si conosce il `twitchId`.
comandi (BACKEND-NOTES §6, `CB=http://localhost:3000/webhooks/twitch/eventsub`, `<secret>` = valore di `TWITCH_EVENTSUB_SECRET`):
- a. `twitch event verify-subscription channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -b <broadcaster id> -D`
- b. `twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -f <twitchId> -C 250 -I dup-1 -D`
- c. lo stesso comando di b, ripetuto con `-I dup-1`
- d. `twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -f <twitchId> --timestamp 2026-01-01T00:00:00.000000000Z -D`
- e. `twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s wrong-secret-123 -t <broadcaster id> -D`
- f. `twitch event trigger stream.online -F $CB -s <secret> -t <broadcaster id> -D`
- g. `twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -r authorization_revoked -D`
expected:
- a. tre ✔ (Valid response, Valid content-type header, Valid status code)
- b. 204; `twitchPoints` dell'utente +250 (`db.users.findOne({ twitchId: '<twitchId>' }, { twitchPoints: 1 })` o FE via `userUpdated`); un documento `outcome: 'credited'`, `amount: 250` in `db.eventsub_messages.find({ twitchUserId: '<twitchId>' })`; LOG `EventSub redemption <messageId> credited 250 points to twitch user <twitchId>`
- c. 204; `twitchPoints` invariato (+250 una sola volta in totale); nessun nuovo documento
- d. 403; WARN `EventSub request rejected: invalid signature or outside the replay window`; saldo invariato
- e. 403; stesso WARN; nessun documento
- f. 204; LOG `EventSub stream.online <messageId> (live) recorded: streamer-live push dispatched`; un documento `outcome: 'broadcast'`
- g. 204; ERROR `EventSub subscription channel.channel_points_custom_reward_redemption.add revoked by Twitch (status authorization_revoked, id <id>): the streamer must log in again with TWITCH_LOGIN_SCOPES=channel:read:redemptions`
result: passed
eseguito: 2026-10-20 (19:59 ora locale) dall'orchestratore, su autorizzazione dell'utente ("Puoi eseguire tu i test e usa pure il mio account per assegnare i punti"), con Twitch CLI 1.1.24 contro il BE locale in modalità `local` (`TWITCH_EVENTSUB_CALLBACK_URL=http://localhost:3000/webhooks/twitch/eventsub`, `TWITCH_EVENTSUB_SECRET` di 43 caratteri, `TWITCH_BROADCASTER_ID` numerico a 9 cifre, `TWITCH_LOGIN_SCOPES=channel:read:redemptions`; il webhook rispondeva 403 ai POST non firmati). Utente target `twitchId 113928494` (User `6ac61251c703dc50b8544865`, ruolo innkeeper), `twitchPoints` 0 prima della prova. DB `klimmeck_guide` letto con mongoose prima/dopo.
evidenza: HTTP + DB. **Le righe di log del BE sono rimaste nel terminale dell'utente e NON sono state lette dall'orchestratore**: i LOG/WARN/ERROR attesi sopra non sono verificati.
- a. tre ✔: challenge `39196fd5-c204-7cf1-6897-15d5d4742bf5` restituito nel body, `text/plain; charset=utf-8`, status 200.
- b. `-f 113928494 -C 250 -I dup-1` → 204 (body vuoto); `twitchPoints` 0 → 250; documento `eventsub_messages` `{ messageId: 'dup-1', type: redemption.add, eventId: '1be4c452-a358-81a8-7f10-c5308fc82cf3', twitchUserId: '113928494', amount: 250, outcome: 'credited', receivedAt: 17:59:53.680Z }`.
- c. stesso comando con `-I dup-1` → 204; `twitchPoints` resta 250, nessun nuovo documento (dedup per `messageId`).
- d. come b senza `-I`, `--timestamp 2026-01-01T00:00:00.000000000Z` → 403 body vuoto; saldo invariato, nessun documento (finestra di replay).
- e. `-s wrong-secret-123` → 403 body vuoto; saldo invariato, nessun documento.
- f. `stream.online` → 204; documento `{ messageId: '00373736-cfef-c1ea-1aa2-c376bbb7854d', type: 'stream.online', eventId: '28365649', twitchUserId: null, amount: null, outcome: 'broadcast', receivedAt: 17:59:55.370Z }`; **il push `streamerLive` è arrivato al device Android reale dell'utente** via topic `streamer-live` (log FE `FLTFireMsgReceiver: broadcast received` alle 19:59:56 locali, 1 s dopo l'evento): broadcast reale verificato end-to-end lato FCM.
- g. `-r authorization_revoked` → 204 (body vuoto); nessuna chiamata Helix attesa in modalità local. La riga ERROR con il rimedio `TWITCH_LOGIN_SCOPES=channel:read:redemptions` **non è stata verificata** nel log.
- stato finale: `twitchPoints=250`, `eventsub_messages=2` (solo b ed f hanno lasciato traccia).

### 2. E2E con Twitch reale (mode managed)
prerequisiti: tunnel HTTPS sulla porta 443 verso `localhost:3000` con `cloudflared tunnel --url http://localhost:3000` (`brew install cloudflared`), oppure ngrok, oppure staging HTTPS; `TWITCH_EVENTSUB_CALLBACK_URL=https://<host>/webhooks/twitch/eventsub`; `TWITCH_CLIENT_ID/SECRET` di un'app Twitch usata solo da questo ambiente (C3); login dello streamer nell'app con `TWITCH_LOGIN_SCOPES=channel:read:redemptions`, poi la variabile si può svuotare; custom reward con "Salta la coda delle richieste".
expected: log di boot `EventSub enabled for broadcaster <id> with callback https://<host>/webhooks/twitch/eventsub: ...` e `EventSub subscriptions reconciled: kept [...], removed [...], created [...]` con `channel.channel_points_custom_reward_redemption.add` e `stream.online` (prima `webhook_callback_verification_pending`, LOG `EventSub callback verification answered`); al ciclo successivo (riavvio o timer orario) entrambe in `kept [...]` con stato `enabled`; una redemption reale di una custom reward accredita `reward.cost` sul `twitchPoints` del viewer e il FE lo vede via `userUpdated`; una live reale invia il push `streamerLive` sul topic `streamer-live`.
result: skipped
reason: nessun tunnel HTTPS (ngrok/cloudflared) in sessione; obbligatorio prima della produzione (BACKEND-NOTES §3).

### 3. C4 — la revoke del token dello streamer non scioglie l'autorizzazione EventSub
passi: in mode managed (test 2), login dello streamer con `TWITCH_LOGIN_SCOPES=channel:read:redemptions` (il BE revoca subito il token con `revokeQuietly`, Phase 2 D-05); poi riavvio del BE o attesa del reconcile; controllo del log del reconcile.
expected: la create di `channel.channel_points_custom_reward_redemption.add` risponde 202: la subscription compare in `created [...]` (poi `enabled` in `kept [...]`) e **non** compare l'ERROR `EventSub subscription channel.channel_points_custom_reward_redemption.add rejected with status 403: the streamer must log in again with TWITCH_LOGIN_SCOPES=channel:read:redemptions`.
se 403: annotare qui l'issue e aprire una voce in `## Gaps`; il fallback passa da gap-closure (`/gsd-plan-phase 6 --gaps`) con TDD su `TwitchLoginService`: in `completeLogin` niente `revokeQuietly` quando `validate().scopes` include `channel:read:redemptions`. Nessun codice in questo piano.
result: skipped
reason: dipende dal test 2 (mode managed con tunnel HTTPS); il fallback `revokeQuietly` condizionale resta documentato in BACKEND-NOTES §7.

## Summary

total: 3
passed: 1
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

Nessun gap: i test 2-3 sono differiti per ambiente, non falliti.

### Deferred to pre-production

- Test 2 — E2E con Twitch reale (mode managed, tunnel HTTPS o staging): reconcile delle due subscription fino a `enabled`, redemption reale accreditata, push `streamerLive` da una live reale.
- Test 3 — C4: dopo il login dello streamer con `TWITCH_LOGIN_SCOPES=channel:read:redemptions` la create della redemption non deve rispondere 403; se lo fa, gap-closure con TDD su `TwitchLoginService` (BACKEND-NOTES §7).
