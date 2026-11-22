---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 10
subsystem: gm
tags: [background, stories, graphemes, error-code, ownership]
requires:
  - "character(id) con @OwnsCharacter: oste esente, estraneo rifiutato (fasi precedenti)"
  - "countGraphemes della creazione del personaggio"
provides:
  - "exceedsGraphemeLimit(text, max) e CODE_UNITS_PER_GRAPHEME in grapheme-count.ts"
  - "GameRuleErrorCode.BACKGROUND_ADDITION_TOO_LONG e GameRuleException.backgroundAdditionTooLong()"
  - "src/quests/guided/background-additions.ts: additionTextOf, additionEntriesOf, additionFor, i due tetti"
  - "contratto di lettura dei background pinnato in characters-ownership.int-spec.ts"
affects: [25-11, 25-12, 25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "una sola funzione per il tetto dei testi liberi: grafemi più unità UTF-16 (otto per grafema)"
key-files:
  created:
    - src/quests/guided/background-additions.ts
    - src/quests/guided/background-additions.spec.ts
  modified:
    - src/characters/creation/grapheme-count.ts
    - src/characters/creation/grapheme-count.spec.ts
    - src/characters/creation/create-character-input.validator.ts
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/characters/characters-ownership.int-spec.ts
key-decisions:
  - "BACKGROUND_MAX_CODE_UNITS tolta: nessun altro file la importava, il tetto in unità vive in exceedsGraphemeLimit"
  - "il doppione di personaggio in una sezione è rifiutato prima di leggere i testi, anche se una delle due voci è vuota o oltre il tetto"
requirements: [BE-STORY-01, BE-STORY-03]
metrics:
  tasks: 3
  files: 9
  completed: 2026-11-21
---

# Phase 25 Plan 10: Storie — lettura, regola di conteggio, codice, regole pure Summary

Le fondamenta delle storie: un solo predicato per il tetto dei testi (`exceedsGraphemeLimit`, grafemi più otto unità UTF-16 per grafema) condiviso da creazione e aggiunte, il codice proprio `BACKGROUND_ADDITION_TOO_LONG`, le regole pure delle aggiunte e il contratto di lettura dei background pinnato sul filo (D-01, D-02, D-06, D-07).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 49b73112 | test(characters): expect a shared grapheme limit rule |
| 1 GREEN | 530573fe | feat(characters): share the grapheme limit rule |
| 1 REFACTOR | 58d2a7bc | refactor(characters): use the shared limit rule at creation |
| 2 RED | 7e68ba9e | test(gm): expect the background addition rules |
| 2 GREEN | 9f903ba6 | feat(gm): add the background addition rules and their error code |
| 3 | (questo commit) | docs(phase-25): record plan 10 progress |

## Cosa cambia

- **`grapheme-count.ts`**: `CODE_UNITS_PER_GRAPHEME = 8` ed `exceedsGraphemeLimit(text, max)`.
- **`create-character-input.validator.ts`**: `normalizeBackground` chiama `exceedsGraphemeLimit(background, BACKGROUND_MAX_GRAPHEMES)`; stesso comportamento (500 grafemi, 4000 unità, codice di oggi). La spec della creazione non è stata toccata ed è verde.
- **Destino di `BACKGROUND_MAX_CODE_UNITS`**: tolta. Il grep in `src/` e `test/` la trovava solo nel validatore; il suo commento è confluito in quello di `CODE_UNITS_PER_GRAPHEME`. `BACKGROUND_MAX_GRAPHEMES = 500` resta esportata.
- **`gameRules`**: `BACKGROUND_ADDITION_TOO_LONG` in coda all'enum; fabbrica `backgroundAdditionTooLong()` col messaggio «L'aggiunta alla storia può contenere al massimo 1000 caratteri», `extensions` col solo `code`. L'elenco esaustivo della spec (`cases`, «covers every GameRuleErrorCode exactly once») ha la riga nuova. `format-domain-error.ts` non va toccato (elenca solo i codici con dati extra).
- **`background-additions.ts`** (nuovo, puro): costanti e tre funzioni.

## Firme finali

```typescript
export const BACKGROUND_ADDITION_MAX_GRAPHEMES = 1000;
export const BACKGROUND_ADDITION_MAX_FORM_LENGTH =
    BACKGROUND_ADDITION_MAX_GRAPHEMES * CODE_UNITS_PER_GRAPHEME; // 8000
export interface BackgroundAdditionEntry {
    character: Types.ObjectId;
    text: string;
}
export function additionTextOf(raw: unknown): string | null;
export function additionEntriesOf(
    incoming: readonly BackgroundAdditionEntry[],
): BackgroundAdditionEntry[];
export function additionFor(
    additions: readonly BackgroundAdditionEntry[] | null | undefined,
    characterId: Types.ObjectId,
): string | null;
```

- `additionTextOf`: non stringa, vuoto o soli spazi → `null`; `trim`; oltre il tetto → `BACKGROUND_ADDITION_TOO_LONG`.
- `additionEntriesOf`: doppione di personaggio (confronto con `hexOf`) → `OUTCOME_OVERRIDE_INVALID` prima di ogni altra cosa; poi ogni testo da `additionTextOf`; le vuote cadono; ordine d'arrivo.
- `additionFor`: trova per `hexOf`, rivalida il testo salvato; `null`/`undefined` come sezione → `null`.

## Fallimenti RED attesi e osservati

**Task 1** — 5 rossi su 10: tutti i casi di `exceedsGraphemeLimit` con `is not a function` (atteso: funzione non esportata).

**Task 2** — unit: `background-additions.spec.ts` non parte (modulo inesistente, atteso); in `game-rule.exception.spec.ts` 3 rossi: la riga nuova di `cases`, il caso «refuses a background addition over the limit with its own code (D-07)» e «covers every GameRuleErrorCode exactly once» (`backgroundAdditionTooLong is not a function`).

**Verdi al primo colpo (dichiarati):** i due casi d'integrazione `participant stories` in `characters-ownership.int-spec.ts`. Motivo: la lettura esiste già (`character(id)` con `@OwnsCharacter`, oste esente) e il piano non aggiunge query: i casi pinnano il contratto (D-01, D-02), non guidano codice nuovo.

## Casi nuovi

- `grapheme-count.spec.ts`, `describe('exceedsGraphemeLimit')`: i cinque del piano.
- `game-rule.exception.spec.ts`: il caso (D-07) più la riga nell'elenco esaustivo.
- `background-additions.spec.ts`: i dodici del piano più uno, «refuses the same character twice before reading the texts (D-06)» (doppione con un testo oltre il tetto → vince `OUTCOME_OVERRIDE_INVALID`: pinna il «prima di tutto» dell'interfaccia).
- `characters-ownership.int-spec.ts`, `describe('participant stories')`: l'oste legge `infos { name background } status { title }` del personaggio di un altro con le voci in ordine; un altro giocatore riceve `FORBIDDEN` col messaggio di oggi e `data` nullo.

## Deviations from Plan

Nessuna deviazione di sostanza. Un caso unit in più (vedi sopra).

## Verifica

- Unit della creazione: 127 verdi (8 suite). Unit, intero progetto: 4682 verdi (313 suite).
- Integrazione `characters-ownership.int-spec.ts`: 73 verdi (con `--forceExit`), rieseguita dopo il GREEN.
- `npx tsc --noEmit -p tsconfig.json` esce 0; `src/schema.gql` senza diff; `test/authz/expected-handlers.ts` e `characters.resolver.ts` senza diff da `e87339bb`.
- Accettazione: `export const exceedsGraphemeLimit` 1; `exceedsGraphemeLimit(` 1 nel validatore e 1 in `background-additions.ts`; `BACKGROUND_MAX_GRAPHEMES = 500` 1; `BACKGROUND_ADDITION_TOO_LONG` 1 nell'enum; `BACKGROUND_ADDITION_MAX_GRAPHEMES = 1000` 1; `D-02)` 2; `D-07)` 6 e `D-06)` 5 nella spec delle aggiunte; nessun jest rimasto vivo.
- Prettier ed eslint sui file toccati puliti. Nessun `npm run build`, nessun riavvio del BE, nessuna lettura di `.env`. La suite larga d'integrazione non è stata eseguita: il piano non tocca servizi né SDL.

## Threat Flags

Nessuna superficie nuova. T-25-29 pinnata dal caso d'integrazione; T-25-30 mitigata dal predicato condiviso (il tetto di forma sul filo arriva col piano 11); T-25-31 accettata.

## Per i piani successivi

- **11:** `@MaxLength(BACKGROUND_ADDITION_MAX_FORM_LENGTH)` sull'input; al salvataggio `additionEntriesOf(voci con characterId già convertito in ObjectId)`; la lista vuota è un esito valido (sezione presente = sostituisce tutto). Nessun `@IsNotEmpty` sul testo: il vuoto è accettato.
- **12:** al completamento `additionFor(draft.backgroundAdditions, characterId)` (tollera la sezione `undefined`, rivalida, può lanciare `BACKGROUND_ADDITION_TOO_LONG`); `null` = nessuna scrittura.
- **14 (handoff):** codice nuovo `BACKGROUND_ADDITION_TOO_LONG` (400, `extensions` col solo `code`) e conteggio in grafemi come il `maxLength` di Flutter.

## Known Stubs

Nessuno. `background-additions.ts` non ha ancora chiamanti: li portano i piani 11 e 12 (dichiarato dal piano).

## Self-Check: PASSED

File creati presenti e commit 49b73112, 530573fe, 58d2a7bc, 7e68ba9e, 9f903ba6 nel log.
