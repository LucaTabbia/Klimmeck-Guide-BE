# Phase 17: Autorizzazione e sessioni - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 17-autorizzazione-e-sessioni (companion della FE Phase 12 Hardening; discuss condotto dal repo FE, log completo in `../Klimmeck-Guide/.planning/phases/12-hardening/12-DISCUSSION-LOG.md`)
**Areas discussed:** Chiusura di HARDEN-02 lato BE · Politica multi-device · Matrice, revoca, ruolo stantio, motivo sul filo

---

## Come chiudere HARDEN-02 lato BE

| Option | Description | Selected |
|--------|-------------|----------|
| Quick task BE table-driven | Un solo int-spec sugli handler innkeeper enumerati, branch `fix/` | |
| Mini-fase BE 17 | Fase GSD completa: matrice handler × ruolo con ownership, handoff | ✓ |
| Solo verifica, niente codice BE | | |

## Politica multi-device (domande FE con effetto BE)

| Option | Description | Selected |
|--------|-------------|----------|
| Entrambi validi | Sessioni indipendenti come oggi | |
| L'ultimo login caccia l'altro | Il BE revoca le altre sessioni al login | ✓ |
| Un solo device con avviso | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Solo quel device | Logout chiude la sola sessione corrente | ✓ |
| Esci da tutti i dispositivi (voce in più) | | |
| Il logout chiude tutto | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Neutro come oggi | | |
| Specifico quando il BE lo dice | Motivo della revoca sul filo | ✓ |

## Matrice di autorizzazione

| Option | Description | Selected |
|--------|-------------|----------|
| Innkeeper + ownership, table-driven | Liste enumerate del boot reale, FORBIDDEN per guard/adventurer e sul personaggio altrui | ✓ |
| Solo gli 11 innkeeper | | |
| Tutto lo schema classificato | | |

## Come il device vecchio apprende la revoca

| Option | Description | Selected |
|--------|-------------|----------|
| WS chiuso subito, JWT fino a scadenza | Close code dedicato, refresh rifiutato col motivo, nessuna lookup per richiesta | ✓ |
| Fuori all'istante | Verifica della sessione a ogni richiesta | |
| Solo al prossimo refresh | | |

## Ruolo stantio (T-10-19)

| Option | Description | Selected |
|--------|-------------|----------|
| Cambio ruolo revoca le sessioni | Motivo `roleChanged`, change stream su `users` | ✓ |
| Ruolo letto a ogni richiesta innkeeper | | |
| Lasciare com'è | | |

## Motivo della revoca sul filo

| Option | Description | Selected |
|--------|-------------|----------|
| SESSION_REVOKED + reason | `extensions.reason` enum, stessa stringa nel close WS | ✓ |
| Codici distinti | | |

## Claude's Discretion

Registro socket vs evento interno; valore del close code; nomi di enum e campo; modulo condiviso delle liste; fixture per handler; cache alla `connection_init`.

## Deferred Ideas

«Esci da tutti i dispositivi»; lookup per richiesta; mutation admin dei ruoli; classificazione dell'intero SDL.
