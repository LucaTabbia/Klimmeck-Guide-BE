---
phase: 04-integrita-economica-atomics
plan: 05
subsystem: characters
tags: [atomics, useSpell, spell-recovery, bull, idempotency, compensation, concurrency, tdd]
requires:
  - 04-03 (useSpellFilter, recoverSpellFilter, DECREMENT_/INCREMENT_ACTIVE_SPELL_USAGE, classifyUseSpellFailure, readActiveSpellSnapshot, requireCharacterObjectId)
  - 04-01 (objectIdFromHex, GameRuleException.spellNotActive/spellNoUsagesLeft/spellRecoveryUnavailable)
provides:
  - "CharactersService.useSpell: catalogo → $inc -1 condizionato → queue.add dopo la scrittura con jobId randomUUID, compensazione idempotente + SPELL_RECOVERY_UNAVAILABLE"
  - "SpellRecoveryProcessor: inietta Spell, $inc +1 condizionato a usages < maxUsages del catalogo, skip loggati (malformato, spell fuori catalogo, archiviato/non attiva/al massimo)"
affects: [04-09 (BACKEND-NOTES: useSpell ora risponde SPELL_NOT_ACTIVE / SPELL_NO_USAGES_LEFT / SPELL_RECOVERY_UNAVAILABLE invece di BAD_REQUEST)]
tech-stack:
  added: []
  patterns:
    - "Side effect (queue.add) solo dopo la scrittura; se fallisce, compensazione con lo stesso update idempotente del recovery"
    - "Job at-least-once reso idempotente da un filtro sul massimo del catalogo invece che da un read-modify-write"
key-files:
  created:
    - src/characters/spells/use-spell.int-spec.ts
    - src/characters/spell-recovery.processor.cap.int-spec.ts
  modified:
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/spell-recovery.processor.ts
    - src/characters/spell-recovery.processor.archived.int-spec.ts
    - src/characters/spell-recovery.processor.int-spec.ts
decisions:
  - "spellId malformato in useSpell → SPELL_NOT_ACTIVE senza toccare il DB (coerente con unequipSpell)"
  - "La compensazione usa recoverSpellFilter + INCREMENT_ACTIVE_SPELL_USAGE: non supera mai maxUsages; se fallisce anche lei si logga l'errore con i soli id e si risponde comunque SPELL_RECOVERY_UNAVAILABLE"
  - "Payload del job invariato ({ characterId, spellId } stringhe) per compatibilità coi job già in Redis; il processor converte con objectIdFromHex e salta i malformati"
metrics:
  duration: ~6 min
  completed: 2026-10-18
  tasks: 2
  files: 7
---

# Phase 4 Plan 05: useSpell single-flight e recovery idempotente Summary

`useSpell` è ora un solo `$inc: -1` condizionato a `$elemMatch { spell, usages: { $gte: 1 } }`, preceduto dalla verifica della spell nel catalogo e seguito dall'accodamento Bull con `jobId = <characterId>-<spellId>-<randomUUID()>`; se l'`add` fallisce l'usage viene restituito con lo stesso update idempotente del recovery e il client riceve `SPELL_RECOVERY_UNAVAILABLE`. `SpellRecoveryProcessor` inietta il modello `Spell` e incrementa solo se `usages < spell.maxUsages`: rieseguito o in parallelo non supera mai il massimo.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | useSpell: decremento condizionale, jobId univoco, compensazione | f0fb287 | 574bc28 |
| 2 | Recovery processor idempotente con cap dal catalogo | 4b74d74 | 462533a |

Nessun commit REFACTOR necessario.

## RED evidence

- **Task 1 (wire):** `npx jest src/characters/spells/use-spell.int-spec.ts --selectProjects integration --runInBand` → 6 failed, 1 passed / 7:
  - caso 1: `jobId` = `...-1792335147022` (`Date.now()`) invece del suffisso UUID
  - caso 2 (SC5): `Expected length: 1, Received length: 2` — due vincitori su 4 con 1 solo usage
  - caso 3: `Expected: 0, Received: 1` — due successi ma un solo decremento persistito (lost update del read-modify-write)
  - casi 4/5: `Received: "BAD_REQUEST"` invece di `SPELL_NOT_ACTIVE` / `SPELL_NO_USAGES_LEFT`
  - caso 7: `Received: "INTERNAL_SERVER_ERROR"` invece di `SPELL_RECOVERY_UNAVAILABLE` (usage perso)
  - passato col vecchio codice: caso 6 (NOT_FOUND per spell fuori catalogo, già corretto da Phase 1 D-06).
- **Task 1 (unit):** `characters.service.spec.ts` → 5 nuovi casi `useSpell` falliti (più un caso archived `equipItem` trascinato dai `mockReturnValueOnce` non consumati dei casi falliti; verde dopo GREEN).
- **Task 2:** `npx jest src/characters/spell-recovery --selectProjects integration --runInBand` → cap spec 4 failed, 3 passed / 7:
  - caso 2 (al massimo): `Expected: 3, Received: 4`
  - caso 3 (job rieseguito): `Expected: 3, Received: 4`
  - caso 5 (spell fuori catalogo): `Expected: 0, Received: 1`
  - caso 7 (job malformato): `CastError: Cast to ObjectId failed for value "abc"`
  - passati col vecchio codice: caso 1 (happy path), caso 6 (spell non attiva), caso 4 (3 replay paralleli maxUsages 1 da 0: il `save()` scrive `$set usages: 1` assoluto, quindi i tre scrivono lo stesso valore — sovrascrittura, non cap; con il nuovo codice il risultato è garantito dal filtro).
  - Le due spec processor esistenti restavano verdi con il nuovo costruttore (ts-jest non blocca sull'argomento in più).

## Verification (GREEN)

- Task 1: `npx jest src/characters src/authz --selectProjects integration --runInBand` 14 suite / 193 test; `npx jest src/characters --selectProjects unit` 14 suite / 162 test; tsc ok; eslint 0 errori (12 warning pre-esistenti: change stream e `doTransaction`).
- Task 2: `npx jest src/characters src/authz --selectProjects integration --runInBand` 15 suite / 200 test (incluso Redis reale, ownership, archived visibility, subscription, audit); `npx jest src --selectProjects unit` 53 suite / 610 test; tsc ok; eslint pulito sui 4 file; `git diff --exit-code develop -- src/schema.gql` = 0.
- **SC5 concorrenza:** 4 `useSpell` concorrenti con 1 usage → 1 successo, 3 `SPELL_NO_USAGES_LEFT`, usages 0, `queue.add` 1 volta. 2 concorrenti con 2 usages → 2 successi, usages 0, 2 jobId distinti.
- **Cap del recovery:** maxUsages 3, usages 3 → resta 3 con warn; job eseguito due volte da 2 → 3; 3 replay paralleli con maxUsages 1 da 0 → 1; spell fuori catalogo → 0 con warn sullo spellId; job malformato → risolve `undefined` con warn.
- **Compensazione (D-13):** queue rifiuta → usages di nuovo 1 e `SPELL_RECOVERY_UNAVAILABLE` (wire); compensazione fallita → `logger.error` con id di personaggio e magia (unit).
- Acceptance grep: `randomUUID()` 1, `Date.now()` 0, `BadRequestException` 0, `.save()` nel service 1 (solo `doTransaction`), `spellRecoveryUnavailable()` 1, `'SPELL_NO_USAGES_LEFT'` 2, `'SPELL_RECOVERY_UNAVAILABLE'` 1, `makeCharacter` 0; processor: `recoverSpellFilter(characterOid, spellOid, spell.maxUsages)` 1, `.save()`/`findOne(` 0, `@InjectModel(Spell.name)` 1; archived `SpellModel as never` 1; `SpellSchema` 2; `Promise.all` 2. Righe: use-spell.int-spec 264 (≥ 120), cap.int-spec 197 (≥ 80).
- Nota grep: `useSpellFilter(characterId, spellId), DECREMENT_ACTIVE_SPELL_USAGE` è su due righe consecutive dopo prettier (stessa situazione già registrata in 04-03); la chiamata è unica.

## Deviations from Plan

### Auto-fixed Issues

**1. [Boy Scout] Import e helper inutilizzati rimossi da `characters.service.spec.ts`**
- `makeCharacter`, `NotFoundException`, `buildCharacter`/`buildSpell` non più usati dopo la riscrittura del describe `useSpell`; aggiunto `Logger` per lo spy della compensazione. Commit f0fb287.

**2. [Test hygiene] `mockSpellModel.findById.mockReset()` nel `beforeEach` del describe `useSpell`**
- I casi `equipSpell` impostano `findById` con `mockReturnValue` persistente, che `clearAllMocks` non azzera: senza reset il caso NOT_FOUND avrebbe consumato il valore persistente. Ogni caso usa poi `givenCatalogSpell()` (`mockReturnValueOnce`). Commit f0fb287.

Nessun altro scostamento: implementazione come da plan.

## Known Stubs

None.

## Threat Flags

None: nessuna superficie nuova. T-04-05-01 (caso wire 2), T-04-05-02 (cap casi 3/4), T-04-05-03 (caso wire 3 + caso 7 + unit compensazione fallita), T-04-05-04 (spec archived), T-04-05-05 (cap caso 7), T-04-05-06 (messaggi costanti, id solo nei log) mitigati.

## Notes for later plans

- 04-09 (BACKEND-NOTES / FE): `useSpell` passa da `BAD_REQUEST` a `SPELL_NOT_ACTIVE` / `SPELL_NO_USAGES_LEFT`, nuovo `SPELL_RECOVERY_UNAVAILABLE` ("Recupero della magia non disponibile, riprova") quando Redis rifiuta l'accodamento; `characterUpdated` continua ad arrivare dal change stream.
- 04-08: `.save()` residuo solo in `doTransaction`; `asQuery` resta nello unit spec per i casi archived.

## Self-Check: PASSED
