---
phase: 06-eventsub-punti-canale-streamer-live
reviewed: 2026-10-20
depth: standard
files_reviewed: 53
status: issues_found
findings:
  critical: 0
  warning: 1
  info: 5
  total: 6
---

# Phase 6: Code Review Report

**Reviewed:** 2026-10-20
**Depth:** standard (con tracciamento cross-file sui percorsi webhook, credito, reconcile)
**Scope:** `git diff origin/develop...HEAD -- src test .env.example package.json`
**Status:** issues_found (nessun Critical, 1 Warning di impatto basso, 5 Info)

## Summary

| Severita | Conteggio |
| -------- | --------- |
| Critical | 0 |
| Warning  | 1 |
| Info     | 5 |

Il codice della fase e solido. Il percorso di sicurezza (firma HMAC prima di ogni ramo, `rawBody` assente = 403, confronto timing-safe, finestra di replay) e corretto. Il credito dei punti e atomico e idempotente (insert del ledger + `creditUserPoints` nella stessa transazione, nessun side effect nel callback, duplicati mappati su `messageId` ed `eventId`). Il lifecycle Helix (single-flight, 401 una sola volta, 404 idempotente, tetto di pagine, modalita local/disabled senza rete) e coerente con le decisioni D-01..D-20. Non ho trovato segreti, firme, body o token nei log o nei messaggi d'errore. Le voci sotto sono rifiniture, non difetti bloccanti. Gli elementi sanzionati dal brief (C1, C3, C5, C6, C7, `import type`, `REDEMPTION_TYPE: string`, ecc.) non sono stati segnalati.

## Warnings

### WR-01: Un reconcile richiesto durante un run che poi fallisce viene perso fino al timer orario

**File:** `src/eventsub/subscriptions/eventsub-subscription.manager.ts:60-96`
**Issue:** Quando `reconcile()` arriva mentre un run e in corso, imposta `rerunRequested = true` e restituisce la stessa promise. `runUntilSettled` rilancia solo se il run corrente termina normalmente. Se `runOnce` lancia (per esempio `listEventSubSubscriptions` fallisce con 5xx o timeout), l'eccezione esce dal `do/while`, il flag viene ignorato e nessun rerun parte. Il caso concreto e una `revocation` (che chiama `reconcileSafely()` subito) che arriva mentre il reconcile di boot o orario sta fallendo. La revocation resta non riparata fino al giro orario successivo (`RECONCILE_INTERVAL_MS`).
**Perche conta:** la riconciliazione immediata a ogni revocation e un requisito esplicito di D-14. Una subscription revocata (es. `authorization_revoked`, `notification_failures_exceeded`) puo restare spenta fino a 60 minuti, con le redemption perse nel frattempo. Finestra stretta e a basso impatto, per questo Warning e non Critical.
**Fix:** rilanciare un solo tentativo anche dopo un fallimento, mantenendo la propagazione dell'errore:
```ts
private async runUntilSettled(config: ManagedEventSubConfig): Promise<void> {
    let failure: unknown;
    do {
        this.rerunRequested = false;
        try {
            await this.runOnce(config);
            failure = undefined;
        } catch (error) {
            failure = error;
        }
    } while (this.rerunRequested);
    if (failure !== undefined) throw failure;
}
```
(oppure, piu semplice: se `runOnce` lancia e `rerunRequested` e vero, fare un ultimo `runOnce` prima di rilanciare). Aggiungere un test nello spec del manager: reconcile fallito + seconda chiamata durante il volo => due `list`.

## Info

### IN-01: Stringhe del body firmato e richieste non autenticate finiscono nei log senza tetto

**File:** `src/eventsub/eventsub-webhook.service.ts:113-116,159,179,184`, `src/eventsub/eventsub-payload.ts:46-50,62-68`
**Issue:** `subscription.type`, `subscription.status` e `subscription.id` sono accettati da `nonEmptyString` senza limite di lunghezza e poi interpolati in log WARN/ERROR (fino a 100 KB di body). Sono valori nel body firmato da Twitch, quindi affidabili finche il secret non e compromesso. In piu l'endpoint e `@Public()` e logga un WARN per ogni richiesta con header mancanti o firma errata: un client anonimo puo gonfiare i log (nessun rate limit per questa rotta).
**Fix:** applicare un tetto (es. 100 caratteri, come `MAX_EVENTSUB_HEADER_LENGTH`) in `parseNotification`/`parseRevocation` per i campi che arrivano nei log, oppure troncarli al momento del log. Per i rigetti non autenticati valutare il livello `debug` o un throttle (rimandabile, non necessario per la fase).

### IN-02: `describeMongoError` usato per errori non Mongo

**File:** `src/eventsub/eventsub-webhook.service.ts:99,221,261,281`, `src/mongo/mongo-errors.ts:21`
**Issue:** la funzione viene usata anche per errori di push e per errori generici del routing, ma il nome dichiara un dominio Mongo. Il comportamento e corretto (solo `name` e `code`, mai il message).
**Fix:** rinominare in `describeError` (o aggiungere un alias) nello stesso commit, come da Boy Scout Rule; nessun cambio funzionale.

### IN-03: Risposta 401 non consumata e `invalidate()` puo scartare un token appena rinnovato

**File:** `src/eventsub/helix/http-twitch-helix.client.ts:114-123`, `src/eventsub/helix/twitch-app-token.cache.ts:59-61`
**Issue:** (a) al 401 la prima `Response` viene abbandonata senza leggere/cancellare il body: con undici la connessione resta occupata fino al GC. (b) `invalidate()` azzera `cached` senza confrontare il token: se due richieste prendono 401 quasi insieme, la seconda puo invalidare il token appena ottenuto dalla prima, causando una richiesta token in piu (il single-flight evita comunque tempeste). Nessun errore di correttezza.
**Fix:** `await response.body?.cancel()` prima del retry; opzionale: `invalidate(staleToken)` che azzera solo se `cached.accessToken === staleToken`.

### IN-04: Il log di riepilogo riporta come "removed" anche le cancellazioni fallite

**File:** `src/eventsub/subscriptions/eventsub-subscription.manager.ts:105-120`
**Issue:** `removeSubscription` inghiotte l'errore (loggato a ERROR) ma il riepilogo `removed [...]` elenca tutto `plan.remove`. Chi legge solo il riepilogo vede una cancellazione riuscita.
**Fix:** far restituire a `removeSubscription` un booleano e popolare una lista `removed` solo con le riuscite, come gia fatto per `created`.

### IN-05: `sendTwitchRequest` perde la causa dell'errore di rete

**File:** `src/eventsub/helix/twitch-http.ts:11-16`
**Issue:** il `catch` scarta l'errore e produce sempre "request failed": timeout (`AbortSignal.timeout`), DNS e TLS non sono distinguibili nei log. La scelta di non esporre il message e giusta (D-13), ma il `name` dell'errore e innocuo.
**Fix:** includere solo `error.name` (es. `Helix list subscriptions request failed (TimeoutError)`), coerente con `describeHelixError`.

## Verified OK

- **Firma e ordine dei controlli:** header letti con tetto di 200 caratteri; la firma e verificata prima di challenge, revocation, notification e routing; `rawBody` assente o secret vuoto => `false` => 403 (`eventsub-signature.ts:21`); HMAC su `id ‖ timestamp ‖ rawBody` come byte; confronto `timingSafeEqual` solo a lunghezze uguali; finestra replay 10 min e tolleranza futuro 60 s con segno corretto; `Date.parse` accetta frazioni ai nanosecondi (verificato: `...123456789Z` => ms corretti) e rifiuta NaN.
- **Routing sul body firmato:** `subscription.type` letto dal body, non da header; tipo di messaggio sconosciuto => 204 + WARN; tipo di subscription non supportato => 204; payload invalido => 204 + ERROR (nessun retry inutile).
- **Validazione input e Mongo:** `user_id` e `broadcaster_user_id` validati con `^\d{1,20}$`; `cost` intero sicuro positivo; `findOne({ twitchId })` riceve solo stringhe validate; nessuna interpolazione del body in filtri; `creditUserPoints` e l'unico scrittore di `twitchPoints` e ri-valida l'importo.
- **Transazione di credito:** insert del ledger + credito nella stessa `connection.transaction`; nessun side effect nel callback (rieseguibile su WriteConflict); duplicati mappati su `messageId` ed `eventId` via `keyPattern`; utente cancellato fra lookup e credito => `unknownViewer` con transazione abortita; errori DB => `RETRY_LATER` (500 generico) con log `name, code` senza stack.
- **Modello e indici:** unico `messageId`, unico parziale `{type,eventId}`, TTL 604800 s su `receivedAt`; verifier non bloccante al boot con log senza dettagli sensibili.
- **Broadcast:** `void broadcast(...).catch(logPushFailure)` solo dopo l'insert, mai in transazione, mai atteso (sanzionato C1); i duplicati di `stream.online` non rimandano il push.
- **Controller:** sottile; `@Public()` solo su `receive`; `@Res()` con 200 `text/plain` per il challenge, 204/403/500 senza body; `switch` esaustivo; `rawBody: true` in `main.ts`, `auth-test-app.ts` e `app.int-spec.ts`; la whitelist dei public handler enumera `EventSubController.receive`.
- **Config:** tutto-o-niente sulle tre variabili; `production` fail-closed (disabled rifiutato, `http://localhost` rifiutato, https solo porta 443 senza credenziali o fragment); messaggi d'errore fissi che nominano variabile e regola, mai il valore; `TWITCH_CLIENT_ID/SECRET` richiesti solo in `managed`; `TWITCH_LOGIN_SCOPES` validato con pattern stretto e URL-encoded da `URLSearchParams` (`:` => `%3A`, spazio => `+`); `.env.example` senza valori.
- **Helix e token:** single-flight del token con `finally`; retry su 401 una sola volta; 404 su delete idempotente; paginazione con tetto di 20 pagine e errore esplicito; body Helix trattato come non fidato (forma variabile, `condition` stringa JSON); timeout con `AbortSignal` su ogni chiamata; `TwitchHelixError` senza token/secret/body; modalita `local`/`disabled` non chiamano mai Helix (`NOT_MANAGED_MESSAGE`).
- **Reconcile:** `planReconciliation` pura e ben coperta (righe 1-8: pending keep, varianti rimosse per versione/condizione, ignore del non posseduto, keeper piu vecchio); single-flight con rerun; timer `unref()` e `clearInterval` in `onModuleDestroy`; il bootstrap non e atteso.
- **Test e regole di progetto:** nessun test chiama Twitch reale (solo `spyOn(fetch)` con implementazione finta e `FakeTwitchHelixClient`); fixture firmate con override `Object.hasOwn`/`omitEvent`; spec in `src/**` con import da `test/`; nessun `.only`/`.skip`; SoC rispettata (controller -> service -> credit/recorder/manager); nessun secret in repo.
- **Cross-file:** `EventSubModule` e foglia (User registrato localmente, EconomyModule per `WalletService`); nessuna dipendenza circolare rilevata fra `eventsub`, `config`, `economy`, `push`.

---

_Reviewed: 2026-10-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
