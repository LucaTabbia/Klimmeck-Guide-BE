---
status: partial
phase: 02-auth-identity-foundation
source: [02-VERIFICATION.md]
started: 2026-10-06T00:00:00Z
updated: 2026-10-06T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Login Twitch reale end-to-end con le chiavi vere

expected: Con `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` / `TWITCH_REDIRECT_URI` valorizzati e il redirect URL registrato nella console Twitch (BACKEND-NOTES §8), `GET /auth/twitch/start?challenge=<S256>` porta a `id.twitch.tv`, Twitch accetta `scope=` vuoto (Assumption A1 della research), il callback fa 302 verso `klimmeck://auth?ticket=…` e `exchangeLoginTicket` restituisce un `AuthSession` valido per l'utente Twitch che ha fatto login.
why_pending: Le chiavi Twitch non sono ancora disponibili. La fase è verificata con un client Twitch finto iniettabile, per decisione esplicita dell'utente.
result: [pending]

### 2. Esecuzione reale della pipeline GitHub Actions

expected: Dopo il push di `feat/02-auth-identity-foundation`, tutti gli step di `.github/workflows/ci.yml` sono verdi, inclusi i nuovi `Build` e `Schema up to date` (`git diff --exit-code src/schema.gql`).
why_pending: Il branch non è stato pushato; la pipeline non è eseguibile in locale.
result: passed — 2026-10-06: run 37533782574 verde (Lint, Build, Unit, Integration, Schema up to date) in 2m59s dopo due correzioni emerse solo su CI: `REDISMS_DISABLE_POSTINSTALL=true` (il postinstall di redis-memory-server compilava Redis dai sorgenti e falliva sul runner) e `types: ["multer"]` in tsconfig (era `Multer`, risolto solo su filesystem case-insensitive). Cache dei binari Mongo salvata (`mongoms-Linux-8.0.4`); l'hit si osserverà alla prossima esecuzione sullo stesso branch.

### 3. Controllo dei duplicati su `users.twitchId` nei dati reali

expected: Sui dati di dev/staging/prod non esistono `twitchId` duplicati prima del primo avvio con l'indice unico (aggregazione di controllo in BACKEND-NOTES §10); al boot `TwitchIdIndexVerifier` non segnala duplicati.
why_pending: Richiede accesso al database reale.
result: [pending]

### 4. Decisione su D-26 (finestra di grazia del refresh)

expected: L'utente sceglie come deve comportarsi il refresh quando lo stesso refresh token arriva due volte in poco tempo.
context: La variante attuale (grazia di 30 secondi sul token immediatamente precedente, adottata in modalità auto) è implementata e testata, ma la code review ha messo a fuoco un caso limite documentato in BACKEND-NOTES §2 e §9 (j): se una richiesta di refresh resta bloccata lato server e il client ritenta, le due rotazioni possono essere applicate in ordine inverso; il client resta con un refresh token ritirato e al refresh successivo la sessione viene revocata (`SESSION_REVOKED`, l'utente deve rifare login). È fail-closed: nessun accesso indebito, solo un logout forzato. Riguarda solo il backend: il FE tratta già `SESSION_EXPIRED` e `SESSION_REVOKED` come terminali.
options:
  - A (raccomandata) — grazia con ri-emissione idempotente: dentro la finestra il token precedente restituisce lo STESSO token corrente (derivato in modo deterministico lato server), così non può esistere un token orfano; elimina il caso limite mantenendo la tolleranza alle risposte perse. Richiede una piccola modifica al modo in cui il BE genera i refresh token.
  - B — reuse detection stretta, senza grazia: qualunque riuso di un token ruotato revoca la sessione. È la variante più semplice e più severa; una risposta di refresh persa in rete significa rifare login.
  - C — lasciare com'è: grazia di 30 secondi con il caso limite accettato e documentato.
why_pending: Scelta di prodotto/sicurezza con compromessi reali; le varianti A e B richiedono un piccolo plan di gap-closure sul backend.
decision: 2026-10-06 — l'utente ha scelto l'opzione A (02-CONTEXT.md D-35); implementata dal plan di gap-closure 02-10 e dalle correzioni di 02-REVIEW-3 (finestra estesa a qualunque token ritirato da meno di 30 s).
result: passed — 2026-10-06: ri-emissione idempotente in produzione nel codice; suite 212 unit + 158 integration verde; nessuna sequenza di richieste trovata che blocchi un client onesto (02-REVIEW-FIX-3.md). Limite residuo documentato: un duplicato di rete che arriva oltre 30 s dopo il ritiro del suo token revoca la sessione (indistinguibile da un furto).

## Summary

total: 4
passed: 2
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
