---
phase: 18-quest-heal-per-taglia
plan: 06
subsystem: graphql
tags: [game-rules, errors, graphql, production, tdd]
requires: ["18-05"]
provides:
  - "GameRuleErrorCode.ITEM_NOT_USABLE, POTION_RECOVERING, ITEM_NO_EFFECT con le factory itemNotUsable(), potionRecovering(until), itemNoEffect()"
  - "GameRuleExtensions { code, recoveryUntil? }: la data di fine ricarica solo nelle extensions dell'eccezione"
  - "potionRecoveryOf(code, recoveryUntil): allowlist della chiave recoveryUntil nei due formatter (sviluppo e produzione, HTTP e WS)"
affects: [18-07, 18-08, 18-10, 18-11]
tech-stack:
  added: []
  patterns: ["allowlist di una chiave per codice nelle extensions, gemella di revokeReasonOf (Phase 17 D-13)"]
key-files:
  created: []
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/graphql/format-domain-error.ts
    - src/graphql/format-domain-error.spec.ts
    - src/graphql/production-errors.ts
    - src/graphql/production-errors.spec.ts
    - src/graphql/production-surface.int-spec.ts
    - test/graphql/production-probe.resolver.ts
decisions:
  - "La factory potionRecovering resta fuori dalla tabella `cases` della spec (le sue extensions hanno una chiave in più): il caso «covers every GameRuleErrorCode exactly once» la aggiunge a mano"
  - "Forma ISO verificata con la funzione privata isIsoInstant: stringa, Date.parse non NaN, toISOString identica"
  - "STATE.md registra `Plan: 6 of 11` (formato del brief), non `Plan: 06 of 11` del verify del piano"
metrics:
  duration: "~15 min"
  completed: 2026-11-10
  tasks: 3
  files: 9
---

# Phase 18 Plan 06: codici di rifiuto di `useItem` e `extensions.recoveryUntil` — Summary

Tre codici stabili per i rifiuti di `useItem` (`ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT`) con factory e messaggi in italiano; `GameRuleException.potionRecovering(until)` porta la data di fine ricarica come istante ISO nelle sole `extensions` (il body Nest non cambia); `formatDomainError` e `sanitizeFormattedError` lasciano passare `recoveryUntil` solo col codice `POTION_RECOVERING` e solo in forma ISO esatta, su HTTP e WS, in produzione e fuori. La `reason` di `SESSION_REVOKED` (Phase 17) è intatta.

## Forma del codice

- `src/gameRules/game-rule-error-code.enum.ts`: dopo `PET_NOT_OWNED` i valori `ITEM_NOT_USABLE`, `POTION_RECOVERING`, `ITEM_NO_EFFECT` (stringa uguale al nome).
- `src/gameRules/game-rule.exception.ts`:
  - `export interface GameRuleExtensions { code: GameRuleErrorCode; recoveryUntil?: string }`; `readonly extensions: GameRuleExtensions`
  - costruttore privato `(code, message, extra: { recoveryUntil?: string } = {})` → `this.extensions = { code, ...extra }`; body di `super` invariato
  - `static itemNotUsable()` → 'Questo oggetto non si può usare'
  - `static potionRecovering(until: Date)` → "Il tuo corpo non reggerebbe un'altra pozione: aspetta che la prima si sia posata", `extensions.recoveryUntil = until.toISOString()`
  - `static itemNoEffect()` → 'Questa pozione non ti farebbe nulla adesso'
- `src/graphql/format-domain-error.ts`: import `GameRuleErrorCode`; `CodedHttpException['extensions'].recoveryUntil?: unknown`; `DomainExtensions.recoveryUntil?: string`; `extensionsOf` = `{ code, ...revokeReasonOf(code, reason), ...potionRecoveryOf(code, recoveryUntil) }`; `export function potionRecoveryOf(code: unknown, recoveryUntil: unknown): { recoveryUntil?: string }` con la funzione privata `isIsoInstant`.
- `src/graphql/production-errors.ts`: ramo non interno di `sanitizeFormattedError` con `...potionRecoveryOf(code, formatted.extensions?.recoveryUntil)` accanto a `revokeReasonOf`; commento di testa aggiornato; `sanitizeExecutionErrors` invariata (passa da `sanitizeFormattedError`).
- `test/graphql/production-probe.resolver.ts`: `export const PROBE_RECOVERY_UNTIL = new Date('2026-11-10T12:30:00.000Z')` e query pubblica `probePotionRecovering` che lancia `GameRuleException.potionRecovering(PROBE_RECOVERY_UNTIL)`.

## TDD

| Task | RED (commit) | Fallimenti osservati | GREEN (commit) |
|------|--------------|----------------------|----------------|
| 1 | `b4ff8037` test(game-rules): pin the potion refusal codes | 5 falliti su 41: le due righe nuove della tabella (`itemNotUsable`, `itemNoEffect` non sono funzioni), copertura dell'enum, nomi dei tre codici, `potionRecovering` assente. tsc rosso per la sola spec (factory e valori dell'enum mancanti) | `c94b20d8` feat(game-rules): add the potion refusal codes and the recovery instant |
| 2 | `2e88c0c8` test(graphql): pin the recovery instant through the error formatters | unit 4 falliti su 86 (i due «keeps» di `formatDomainError`, il «keeps» di produzione, il caso graphql-ws): le extensions erano `{ code: 'POTION_RECOVERING' }` senza la data; integration 2 falliti su 18 (produzione e fuori produzione, stessa causa) | `0c74a21d` feat(graphql): keep the recovery instant through the error formatters |

Verdi al primo colpo (attesi, sono prove di assenza): in `format-domain-error.spec.ts` «drops a recovery instant carried by another code» e le cinque righe dell'`it.each` dei valori non ISO; in `production-errors.spec.ts` i tre casi «drops …» (codice diverso, valore non ISO, errore interno). Prima del GREEN nessuna chiave in più passava già, quindi l'assenza era vera anche senza codice nuovo; restano verdi dopo il GREEN e pinnano l'allowlist.

## Gate

- `npx jest src/graphql src/gameRules --selectProjects unit`: 127 test verdi.
- `npx jest src/graphql --selectProjects integration --runInBand`: 1 suite / 18 test verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0.
- Prettier `--write` + eslint su ognuno dei nove file: puliti.
- Conteggi: `D-17)` 2 / 4 / 5 / 2 (exception spec, format spec, production spec, surface int-spec); `D-13)` 6 / 7 intatti; nessuno spread di extensions originali nei due formatter.
- `src/schema.gql` invariato in questo piano (nessun cambio di SDL); additivi vs `origin/develop` invariati rispetto al 18-05.

## Deviations from Plan

None - plan executed exactly as written. Unica nota di bookkeeping: STATE.md usa `Plan: 6 of 11` senza zero iniziale (formato del brief dell'orchestratore); il verify del Task 3 che cerca `Plan: 06 of 11` non passa per questo, innocuo come nei piani precedenti.

## Threat Flags

Nessuna superficie nuova fuori dal threat model: la sonda `probePotionRecovering` vive in `test/` (T-18-26 accept).

## Self-Check: PASSED

- Commit `b4ff8037`, `c94b20d8`, `2e88c0c8`, `0c74a21d` presenti in `git log`.
- Nove file modificati presenti.
