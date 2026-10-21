# Phase 6: EventSub: Punti Canale & Streamer Live - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-19
**Phase:** 06-eventsub-punti-canale-streamer-live
**Areas discussed:** Semantica del credito, Consenso e scope Twitch, Configurazione, Modello di elaborazione, Ciclo di vita delle subscription, Ledger di dedup, Streamer live
**Mode:** interattivo (l'orchestratore ha proposto le opzioni con un default raccomandato; l'utente ha scelto). Non richiesto: HMAC su `message_id + timestamp + raw_body`, challenge `text/plain`, finestra 10 min, dedup per `message_id`, `WalletService.creditUserPoints`, push fuori transazione, app access token (fissati da requisiti, research di milestone e Phase 4/5).

---

## Viewer senza account

| Option | Description | Selected |
|--------|-------------|----------|
| Crea lo User e accredita (raccomandata) | Upsert per `twitchId` e `$inc`: nessun punto perso | |
| Scarta con WARN | Nessun credito, log con twitchId e importo | |
| Ledger di crediti non riscossi | Collection applicata al primo login | |
| *Other* | — | ✓ |

**User's choice:** «Non fa niente, neanche warning» — nessun credito, nessun documento, nessun log sopra DEBUG.

---

## Importo accreditato

| Option | Description | Selected |
|--------|-------------|----------|
| `reward.cost`, 1:1 (raccomandata) | Costo in punti canale della reward riscattata | ✓ |
| Importo fisso da env | `TWITCH_REWARD_POINTS=N` per ogni redemption | |

---

## Reward che accreditano

| Option | Description | Selected |
|--------|-------------|----------|
| Una reward configurata (raccomandata) | `TWITCH_REWARD_ID`, filtro `reward_id` nella subscription | |
| Tutte le custom reward del canale | Qualunque redemption accredita il suo costo | ✓ |
| Lista di reward | `TWITCH_REWARD_IDS`, una subscription per reward | |

---

## Stato della redemption su Twitch

| Option | Description | Selected |
|--------|-------------|----------|
| No, non tocca Twitch (raccomandata) | Reward con "salta la coda"; refund = BE-FUT-05 | ✓ |
| FULFILLED dopo il credito | `Update Redemption Status`, scope `channel:manage:redemptions` | |

---

## Scope `channel:read:redemptions`

| Option | Description | Selected |
|--------|-------------|----------|
| Scope nel login di tutti (raccomandata al primo giro) | Scope fissa nell'URL di authorize per ogni utente | |
| Endpoint innkeeper «collega canale» | Flusso REST dedicato allo streamer | |
| Scope da env (ninja) | `TWITCH_LOGIN_SCOPES` configurabile | ✓ |

**User's choice:** «L'autorizzazione scade? Se sì: endpoint dedicato, altrimenti scope da env. Il canale è sempre e solo il mio, quindi l'autorizzazione la voglio sempre dare.» Verifica sulle fonti Twitch (docs EventSub manage-subscriptions, revoke-tokens, forum dev Twitch): l'autorizzazione non scade nel tempo, cade solo se lo streamer scollega l'app o cambia password; la revoke del token di Phase 2 non la tocca. → **Scope da env**, confermata al secondo giro.

---

## Configurazione EventSub

| Option | Description | Selected |
|--------|-------------|----------|
| Opzionali tutto-o-niente, WARN (raccomandata) | Come Twitch OAuth in Phase 2, anche in produzione | |
| Obbligatorie in produzione | Fail-closed come `FIREBASE_SERVICE_ACCOUNT` | ✓ |

**Notes:** in production diventano di fatto obbligatorie anche `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` e l'URL HTTPS pubblico: il deploy di questa fase richiede le chiavi Twitch.

---

## Modello di elaborazione

| Option | Description | Selected |
|--------|-------------|----------|
| Sincrona in transazione (raccomandata) | Dedup + credito nella stessa session; 500 su errore DB → riconsegna | ✓ |
| Accoda su Bull e rispondi 204 | Risposta istantanea, job perso = punti persi | |

---

## Riconciliazione delle subscription

| Option | Description | Selected |
|--------|-------------|----------|
| Boot + ogni ora in-process (raccomandata) | `reconcile()` al boot, timer 60 min, subito su `revocation` | ✓ |
| Job Bull ripetibile | Stesso reconcile schedulato su Redis | |
| Solo al boot + revocation | Nessun timer | |

---

## Ledger di dedup `eventsub_messages`

| Option | Description | Selected |
|--------|-------------|----------|
| 7 giorni (raccomandata) | Copre le riconsegne e una settimana di supporto | ✓ |
| 30 giorni | Un mese di storico | |
| Permanente | Ledger completo per BE-FUT-05 | |

---

## Push streamer live

| Option | Description | Selected |
|--------|-------------|----------|
| Solo `type: live` (raccomandata) | Rerun/playlist non svegliano i viewer | |
| Qualunque `stream.online` | Ogni evento di canale online manda il push | ✓ |

---

## Claude's Discretion

Nomi e struttura del modulo, forma del modello `EventSubMessage`, tolleranza di clock, costante vs env per l'intervallo del timer, meccanica del `text/plain` per il challenge, log DEBUG sugli scope al login, ordine dei plan, estensione del harness con `rawBody`.

## Deferred Ideas

Refund/FULFILLED (BE-FUT-05), riconciliazione via Get Custom Reward Redemption, `user.authorization.revoke`, coda Bull per l'ingestione, ledger permanente, rate limiting (Phase 10), filtro per reward, crediti a viewer senza account, `stream.offline`.
