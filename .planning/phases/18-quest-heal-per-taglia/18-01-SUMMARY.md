---
phase: 18-quest-heal-per-taglia
plan: 01
subsystem: quests/outcomes
tags: [heal, injuries, cure, pure-functions, tdd]
requires: []
provides:
  - "cureInjuries(injuries, canHeal) → { injuries, healed }"
  - "Cure, cureOf(raw) → Cure | null"
  - "lifePointsAfterCure(hp, max, share)"
affects: [18-03, 18-07]
tech-stack:
  added: []
  patterns: ["primitive pure con input readonly e nuovo array in uscita", "lettore sanificante del contenuto a DB"]
key-files:
  created:
    - src/quests/outcomes/injuries/cure-injuries.ts
    - src/quests/outcomes/injuries/cure-injuries.spec.ts
    - src/quests/outcomes/injuries/quest-cure.ts
    - src/quests/outcomes/injuries/quest-cure.spec.ts
  modified: []
decisions:
  - "STATE.md registra `Plan: 1 of 11` (formato del brief dell'orchestratore e del file), non `Plan: 01 of 11` del verify del piano"
metrics:
  duration: "~10 min"
  completed: 2026-11-10
  tasks: 3
  files: 4
---

# Phase 18 Plan 01: primitive pure della cura — Summary

Tre funzioni pure in `src/quests/outcomes/injuries/`: `cureInjuries` toglie le ferite elencate in `canHeal` (ordine del personaggio, senza duplicati, voci ignote ignorate), `cureOf` legge `prizes.cure` sanificandolo (quota fuori da [0, 1] o non numerica = 0, mai 1) e `lifePointsAfterCure` applica il tetto della vita tramite `lifePointsWithin`.

## Firme create

```typescript
// src/quests/outcomes/injuries/cure-injuries.ts
export function cureInjuries(
    injuries: readonly InjuryType[],
    canHeal: readonly unknown[],
): { injuries: InjuryType[]; healed: InjuryType[] };

// src/quests/outcomes/injuries/quest-cure.ts
export interface Cure { lifePointsShare: number; canHeal: InjuryType[] }
export function cureOf(raw: unknown): Cure | null;
export const lifePointsAfterCure: (hp: number, max: number, share: number) => number;
```

`isShare` (non esportato) in `quest-cure.ts`: numero finito fra 0 e 1 estremi inclusi.

## Commit

| Task | Commit | Messaggio |
| ---- | ------ | --------- |
| 1 RED | 1d02bcff | test(outcomes): pin the cure injuries primitive |
| 1 GREEN | 9a5bb16d | feat(outcomes): add the cure injuries primitive |
| 2 RED | f5fa695a | test(outcomes): pin the quest cure reader and the life floor |
| 2 GREEN | 2bd87184 | feat(outcomes): add the quest cure reader and the life floor |
| 3 | (questo commit) | docs(phase-18): record plan 01 progress |

## Fallimenti RED osservati

- `cure-injuries.spec.ts`: suite fallita al caricamento, «Cannot find module 'src/quests/outcomes/injuries/cure-injuries'» (atteso: modulo assente), 0 test eseguiti.
- `quest-cure.spec.ts`: suite fallita al caricamento per modulo `quest-cure` assente (atteso), 0 test eseguiti.
- Nessun caso verde al primo colpo (i moduli non esistevano).

## Verifiche

- `npx jest src/quests/outcomes/injuries --selectProjects unit`: 3 suite, 98 test verdi (cure-injuries 7, quest-cure 28, injury-rules 63).
- `npx tsc --noEmit -p tsconfig.json`: 0 dopo ogni GREEN (non lanciato sui commit RED, rossi per il solo import del modulo assente).
- prettier `--write` + eslint sui quattro file `.ts`, uno per uno: puliti.
- `git diff --exit-code src/schema.gql`: 0; nessuno SDL toccato.
- Grep di accettazione: `D-13)` 5, `D-08)` 1, `D-01)` 1 in cure-injuries.spec; `D-01)` 2, `D-23)` 3, `D-02)` 3 in quest-cure.spec; `Math.random` 0.

## Deviations from Plan

- **Formato del contatore in STATE.md:** il piano (Task 3, verify) chiede `Plan: 01 of 11`; il brief dell'orchestratore chiede `Plan: 1 of 11`, coerente col formato esistente (`Plan: 0 of 11`). Applicato `Plan: 1 of 11`: il grep del verify del Task 3 con `01` non passa per questo solo motivo.
- Nella Per-Task Verification Map, oltre allo stato `✅ green`, la colonna dell'esistenza del file delle righe 18-01-01 e 18-01-02 passa da `❌ W0` a `✅`; le due voci della Wave 0 sono spuntate (come chiede il Task 3).

Nessuna altra deviazione: piano eseguito come scritto.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: moduli puri, nessun I/O. T-18-01, T-18-02, T-18-03 mitigati e pinnati dalle spec.

## Self-Check: PASSED

File creati presenti; commit 1d02bcff, 9a5bb16d, f5fa695a, 2bd87184 presenti nel log.
