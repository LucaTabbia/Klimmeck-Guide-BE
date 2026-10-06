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
result: [pending]

### 3. Controllo dei duplicati su `users.twitchId` nei dati reali

expected: Sui dati di dev/staging/prod non esistono `twitchId` duplicati prima del primo avvio con l'indice unico (aggregazione di controllo in BACKEND-NOTES §10); al boot `TwitchIdIndexVerifier` non segnala duplicati.
why_pending: Richiede accesso al database reale.
result: [pending]

### 4. Conferma della decisione D-26 (finestra di grazia del refresh)

expected: L'utente conferma la finestra di grazia di 30 secondi sul refresh token precedente, oppure chiede la variante stretta (riuso immediato = revoca). Nota emersa in esecuzione: dentro la finestra una seconda rotazione con il vecchio token rende inutilizzabile il token emesso dalla prima; un client che avesse già ricevuto quel token riceverebbe `SESSION_EXPIRED` al refresh successivo.
why_pending: Scelta raccomandata dalla research e adottata in modalità auto; richiede conferma esplicita.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
