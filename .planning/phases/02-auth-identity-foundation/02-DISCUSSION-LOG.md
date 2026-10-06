# Phase 2: Auth & Identity Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-06
**Phase:** 02-auth-identity-foundation
**Mode:** `--auto` — nessuna domanda interattiva; per ogni area è stata selezionata l'opzione raccomandata. L'unico input diretto dell'utente è la direttiva sul bypass (vedi "Dev bypass").
**Areas discussed:** Flusso OAuth Twitch, Sessione e refresh, Guard e seam d'identità, Dev bypass, Rollout e handoff

---

## Flusso OAuth Twitch

| Option | Description | Selected |
|--------|-------------|----------|
| Authorization Code mediato dal BE + login ticket legato a challenge S256 | Il BE ospita start/callback, custodisce il `client_secret`, il FE riscatta un ticket monouso. Funziona qualunque siano le regole Twitch sui redirect URI. | ✓ |
| Implicit grant lato FE + `login(twitchAccessToken)` | Aderente alla lettera di BE-AUTH-01, nessun secret; richiede però che Twitch accetti un redirect con custom scheme (dubbio) e consegna il token nel fragment dell'URL. | |
| Authorization Code con PKCE lato app (plan FE di aprile) | **Non praticabile**: Twitch non supporta PKCE e richiede `client_secret`. | |

**User's choice:** [auto] Authorization Code mediato dal BE (recommended default)
**Notes:** Verificato il 2026-10-06 sulla documentazione Twitch: nessun supporto PKCE, `client_secret` obbligatorio per l'authorization code grant. Questo invalida la decisione D-15 del CONTEXT FE Phase 11 ("PKCE locked") e richiede un emendamento a BE-AUTH-01.

| Option | Description | Selected |
|--------|-------------|----------|
| Scartare i token Twitch dopo la risoluzione dell'identità | Nessun secret utente a riposo; scope vuoto. | ✓ |
| Persistere i token Twitch cifrati per il validate orario | Abilita la rilevazione della revoca lato Twitch, ma aggiunge cifratura at-rest e logica di refresh Twitch non verificabile senza chiavi. | |

**User's choice:** [auto] Scartare (recommended default); validate orario deferito a Phase 10.

---

## Sessione e refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Access JWT 15 min + refresh token opaco rotante (hash a DB, 30 giorni sliding) | Sessione revocabile lato server, refresh silente per il FE, reuse detection. | ✓ |
| JWT a lunga durata senza refresh | Più semplice, ma non revocabile e in contrasto con "TTL breve" di BE-AUTH-01. | |
| JWT breve senza refresh (re-login Twitch a scadenza) | Inaccettabile per UX: login Twitch ogni 15–60 minuti. | |

**User's choice:** [auto] Access JWT + refresh rotante (recommended default)
**Notes:** La research di milestone aveva deferito la strategia di refresh "all'handoff FE Phase 11". Poiché FE Phase 11 è il lavoro successivo, la decisione viene presa ora.

---

## Guard e seam d'identità

| Option | Description | Selected |
|--------|-------------|----------|
| Un solo resolver d'identità per HTTP + REST + WS, guard globale con whitelist `@Public()` | Un seam, due forme; whitelist enumerata. | ✓ |
| Guard separati per trasporto | Più codice duplicato, rischio di divergenza (Pitfall 2 e 6). | |

**User's choice:** [auto] Resolver unico (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| Chiudere il socket WS alla scadenza del JWT | Il FE riconnette in silenzio con token fresco; chiude Pitfall 1. | ✓ |
| Validare solo in `onConnect` | Auth "valida per sempre" sui socket long-lived. | |
| Ri-validare `exp` a ogni subscribe senza chiudere | Non copre le subscription già attive. | |

**User's choice:** [auto] Chiusura a scadenza (recommended default)

---

## Dev bypass

**Direttiva utente (testuale, 2026-10-06):** "Per quanto riguarda cosa come la login su Twitch (di cui non abbiamo ancora le chiavi) per adesso inizia l'implementazione, ma permetti di bypassare il tutto finché non si ha tutto il necessario."

| Option | Description | Selected |
|--------|-------------|----------|
| Flag esplicito `DEV_AUTH_ENABLED=true` + `NODE_ENV !== 'production'`, boot rifiutato in produzione | Fail-closed su due livelli (boot + resolver). | ✓ |
| Solo `NODE_ENV !== 'production'` | Fail-open se `NODE_ENV` non è impostato (Pitfall 4). | |
| "Token dev presente ⇒ abilitato" | Backdoor accidentale. | |

**User's choice:** [auto] Flag esplicito + boot rifiutato in produzione (recommended default)

| Option | Description | Selected |
|--------|-------------|----------|
| User stub reale a DB (upsert per `DEV_AUTH_TWITCH_ID`) | `me` e tutti i resolver lavorano su un documento vero. | ✓ |
| Identità stub solo in memoria | I resolver che leggono lo User falliscono. | |

**User's choice:** [auto] User stub reale (recommended default)

---

## Rollout e handoff

| Option | Description | Selected |
|--------|-------------|----------|
| Bypass + seam prima, guard globale dopo | Il bypass è la rampa di migrazione (Pitfall 5). | ✓ |
| Guard globale subito | Big-bang che rompe il FE in sviluppo. | |

**User's choice:** [auto] Bypass prima (recommended default)

---

## Claude's Discretion

- Scelta `@nestjs/jwt` + guard custom vs Passport.
- Rappresentazione di `state` e login ticket (stateless firmati vs documenti Mongo con TTL).
- Layout del modulo `src/auth/`, shape dei DTO, nome della collection sessioni.
- Meccanismo e codice di chiusura del socket WS a scadenza.
- Sorte del file vuoto `src/rest/auth.controller.ts`.
- Strumento di validazione della config al boot.

## Deferred Ideas

- Rilevazione revoca lato Twitch (validate orario, token Twitch cifrati at-rest) → Phase 10.
- Ownership / ruoli / filtro subscription / audit log → Phase 3.
- Rate limiting, CORS, introspection off → Phase 10.
- App Links / Universal Links al posto del custom scheme → hardening.
- Gestione multi-sessione lato utente → backlog.
- Assegnazione automatica del ruolo innkeeper → backlog.
