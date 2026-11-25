---
phase: 26-eliminazione-account-e-consenso
plan: 14
subsystem: docs
tags: [handoff, account-deletion, legal-consent, requirements]
requires: ["26-13"]
provides:
  - ".planning/phases/26-eliminazione-account-e-consenso/BACKEND-NOTES.md: contratto finale per la FE Phase 25 e compiti dell'orchestratore"
  - "BE-DEL-01..09 e BE-CONSENT-01..02 chiusi in REQUIREMENTS.md (caselle e tracciabilità)"
  - "26-VALIDATION.md firmata (status complete, nyquist_compliant true)"
affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/26-eliminazione-account-e-consenso/BACKEND-NOTES.md
  modified:
    - .planning/phases/26-eliminazione-account-e-consenso/26-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Il handoff descrive il codice di oggi, non i piani: dove i piani e il codice differiscono (nessun BAD_USER_INPUT per un nome lungo, chiave args assente invece di {}, PortraitStore via useFactory, startedAt fuori dallo SDL) vale il codice"
  - "Risposte date sia alle cinque voci del handoff della FE sia a N1–N6 della ricerca BE, con le differenze dichiarate"
metrics:
  duration: "~35 min"
  completed: 2026-11-25
  tasks: 2
  files: 6
---

# Phase 26 Plan 14: handoff e chiusura Summary

`BACKEND-NOTES.md` consegna alla FE Phase 25 il contratto letto dal codice e dallo SDL (due mutation, sette codici più il redirect, revoca `accountDeleted` con finestra di 15 minuti e ripieghi, `termsVersion`, quest cominciata annullata, inventario di ciò che si cancella e resta, effetti dopo il commit) e all'orchestratore boot reale, UAT e decisioni vetabili; undici requisiti chiusi a gate verde, VALIDATION firmata, ROADMAP e STATE a 14/14.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 3141415c | docs(phase-26): hand off the account deletion and consent contract |
| 2 | 247bb6cf | docs(phase-26): close the account deletion and consent requirements |
| 2 | (questo commit) | docs(phase-26): record plan 14 progress |

## Sezioni del handoff

Intestazione (fase, ramo, base `9a084248`, righe `Gate 26-13` coi numeri), §0 TL;DR (sette righe), §1 Diff SDL (blocco `type DeletedAccount` e righe di `type Mutation` copiati da `src/schema.gql`, le cinque righe del diff, nessuna tolta), §2 semantica (a) via propria, (b) via dell'oste, (c) revoca con tabella per canale e ripieghi, (d) consenso con l'ordine dei rifiuti e la regola della data, (e) quest cominciata annullata con l'eccezione dell'aid, (f) tabella collection → azione e ciò che resta, (g) passi dopo il commit e outbox; §3 tabella dei codici; §4 esempi; §5 compatibilità e risposte; §6 comportamenti provati per requisito; §7 compiti, UAT in otto passi, decisioni vetabili, punti aperti, deviazioni.

## Esempi scritti (§4)

4.1 `deleteMyAccount` e risposta; 4.2 `INNKEEPER_ACCOUNT_PROTECTED` (e la variante `UNAUTHENTICATED`); 4.3 `deleteAccountByTwitchLogin` con variabili e risposta; 4.4 `TWITCH_USER_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `TWITCH_UNAVAILABLE`; 4.5 refresh `SESSION_REVOKED` + `accountDeleted` e variante `SESSION_EXPIRED`; 4.6 close 4409; 4.7 start con e senza `termsVersion`; 4.8 push `questCancelled` data-only e frammento di `characterUpdated` (con il frammento `... on LootItem` sull'unione della borsa).

## Risposte alle cinque voci della FE

| Voce del handoff FE | Risposta |
|---------------------|----------|
| 1 Cancellazione propria | `deleteMyAccount: Boolean!`, §2a, §4.1–4.2 |
| 2 Cancellazione dell'oste | `deleteAccountByTwitchLogin`, quattro codici, §2b, §3, §4.3–4.4 |
| 3 Motivo di revoca | fattibile: `accountDeleted` su refresh e 4409 per 15 minuti, poi `SESSION_EXPIRED`, §2c |
| 4 Consenso | `termsVersion` all'avvio del login, `terms_not_accepted`, bypass esente, §2d |
| 5 Segnaposto anonimo | superato dalla D-13: nessuna registrazione anonima, nessun cambio di SDL, §2e |

In più il riscontro con N1–N6 della ricerca BE (differenza dichiarata su N2: nessun `BAD_USER_INPUT`).

## Controlli

- Verify automatico del Task 1 verde (otto sezioni, SDL, codici, nessun URI Mongo, nessun trailer).
- Acceptance: `BE-DEL-0[1-9]` 16 righe, `BE-CONSENT-0[12]` 4, decisioni `D-…` 61, «15 minuti» 9, `SESSION_EXPIRED` 7, `<twitchLogin>` 2, ObjectId di 24 cifre esadecimali 0.
- Operatori Mongo: lettura a mano e grep del dollaro; gli unici fuori dai code span inline sono le variabili GraphQL dentro i blocchi di codice degli esempi (`$twitchLogin`, `$refreshToken`, `$id`); `$min` e i nomi dei filtri solo in code span.
- Segreti: nessun URI, host, nome di database, id reale né nome utente reale; soli segnaposto.
- Ogni riga aggiunta dello SDL ha semantica (§2a, §2b) ed esempio (§4.1, §4.3); ogni codice di §3 ha un esempio o il rimando alla forma di oggi (`FORBIDDEN`, `UNAUTHENTICATED` da bearer assente).
- Task 2: `requirements mark-complete` ha aggiornato caselle e tracciabilità (11 e 11); nessuna riga `26-NN-0[1-3]` resta `⬜ pending`; `**Approval:** approved 2026-11-25`.

## Requisiti chiusi

BE-DEL-01, BE-DEL-02, BE-DEL-03, BE-DEL-04, BE-DEL-05, BE-DEL-06, BE-DEL-07, BE-DEL-08, BE-DEL-09, BE-CONSENT-01, BE-CONSENT-02 (dopo il gate verde di `26-13-SUMMARY.md`).

## Deviations from Plan

- **Riga del Progress Table e casella del piano nel commit del bookkeeping**, non in quello della chiusura dei requisiti (come vogliono le regole dell'esecutore): il primo commit porta il testo `**Stato (2026-11-25)**` della ROADMAP e i testi di STATE, il secondo `14/14`, la casella e `Plan: 14 of 14`.
- **Sezioni in più nel handoff:** riscontro con N1–N6 della ricerca BE oltre alle cinque voci della FE; «Punti aperti» in §7.
- **Frontmatter di STATE:** `stopped_at` e `last_activity` portati al piano 14 (erano fermi al piano 01); i contatori di `progress` non toccati.

## Ciò che resta all'orchestratore

`npm run test:cov`, verifica e audit, PR verso `develop`, build e riavvio dal ramo (indici nuovi, dati di sviluppo orfani D-24, utenti senza consenso D-11, registrazioni legacy in stringa), permesso IAM dei topic FCM, credenziali Twitch del login, brief della FE con §0–§5, UAT su device (§7), `phase complete` dopo review, boot e PR.

## Known Stubs

Nessuno (solo documenti).

## Self-Check: PASSED

- `BACKEND-NOTES.md` presente; commit 3141415c e 247bb6cf presenti nella storia del ramo.
