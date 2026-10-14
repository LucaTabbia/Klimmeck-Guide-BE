---
phase: 03-autorizzazione-ownership-ruoli-audit
plan: 07
subsystem: characters / authz
tags: [authz, ownership, roles, graphql, not-found]
requires:
  - "03-02: ResourceNotFoundException.character()/.spell()/.activeSpell()"
  - "03-04: @OwnsCharacter selector decorator + OwnershipGuard (AuthzModule)"
  - "03-05: createCharactersTestApp harness; characterUpdated already guarded"
  - "03-06: @Roles decorator + RolesGuard"
provides:
  - "Ownership su doTransaction, equipItem, equipSpell, unequipSpell, useSpell, character(id), equipment(id)"
  - "characters (lista) innkeeper-only"
  - "CharactersService con NOT_FOUND tipizzato su tutti i percorsi not-found"
affects:
  - src/characters/characters.resolver.ts
  - src/characters/characters.service.ts
tech-stack:
  added: []
  patterns:
    - "Decorator di autorizzazione dichiarativi sopra @Query/@Mutation, nessun check nel corpo del resolver (D-08)"
    - "Int-spec it.each su una tabella OPERATIONS (documento + variabili in funzione del characterId)"
key-files:
  created:
    - src/characters/characters-ownership.int-spec.ts
  modified:
    - src/characters/characters.resolver.ts
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
decisions:
  - "Il service resta agnostico dell'identità: l'autorizzazione vive solo nei guard; il service lancia solo ResourceNotFoundException tipizzate"
  - "unequipSpell su spell non attiva -> ResourceNotFoundException.activeSpell(); useSpell su spell inesistente -> ResourceNotFoundException.spell() (messaggi in italiano, codice NOT_FOUND)"
metrics:
  duration: "~20 min"
  completed: 2026-10-14
  tasks: 2
  files: 4
---

# Phase 3 Plan 07: Ownership sulle operazioni del personaggio Summary

`@OwnsCharacter` sulle 5 mutation del personaggio e sulle query `character(id)`/`equipment(id)`, `@Roles(RoleType.innkeeper)` sulla lista `characters`, e `CharactersService` che lancia `ResourceNotFoundException` tipizzate (`NOT_FOUND`) al posto dei `NotFoundException` grezzi. Le firme GraphQL non cambiano.

## Tasks

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | RED: int-spec di ownership su mutation e query | 9185997 | src/characters/characters-ownership.int-spec.ts |
| 2 | GREEN: decorator sul resolver + NOT_FOUND tipizzato | b7ad52a | src/characters/characters.resolver.ts, characters.service.ts, characters.service.spec.ts |

## TDD

- **RED (Task 1):** 30 test falliti, 17 passati su 47. Sono falliti i casi attesi:
  - caso 1: un altro adventurer su alice, x7 operazioni (nessuna ownership: la mutation riusciva);
  - caso 2: la guardia su alice, x7;
  - caso 5: l'adventurer su id inesistente o malformato, x7 (NotFound grezzo = INTERNAL_SERVER_ERROR oppure CastError);
  - caso 6: l'innkeeper su id inesistente, x7 (NotFound grezzo, nessun `code`);
  - caso 7: `characters` letto da adventurer e guardia (nessun ruolo richiesto).

  Sono già passati, come previsto, i casi proprietario e innkeeper (3, 4), la lista per l'innkeeper, UNAUTHENTICATED senza bearer e il job accodato da `useSpell` on-behalf.
- **GREEN (Task 2):** 47/47 nell'int-spec, 56/56 insieme alla subscription; unit `src/characters` 124/124; regressione integration `src/characters src/users src/auth test/auth test/app.int-spec.ts` 23 suite, 288/288.
- **REFACTOR:** non necessario.

## Verification

- `git diff --exit-code src/schema.gql` → exit 0.
- Ho controllato anche lo schema stampato a runtime dall'harness, con uno spec temporaneo poi cancellato e mai committato. Le 9 firme (`characters`, `character`, `equipment`, `characterUpdated` e le 5 mutation) sono identiche a quelle di `src/schema.gql`.
- `npx tsc --noEmit -p tsconfig.build.json` → exit 0.
- ESLint pulito su resolver, spec unit e int-spec.
- Nessun trailer Co-Authored-By nei 2 commit.
- Acceptance greps:
  - `@OwnsCharacter` = 8;
  - `@Roles(RoleType.innkeeper)` = 1;
  - `ResourceNotFoundException.character()` = 7;
  - `new NotFoundException` = 0;
  - `identity|currentCharacter` nel service = 0;
  - `it.each(OPERATIONS)` = 6;
  - `TEST_DEV_ACCESS_TOKEN` = 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Asserzione sul messaggio in characters.service.spec.ts**
- **Found during:** Task 2
- **Issue:** i due casi `rejects.toThrow(NotFoundException)` riguardano una spell non attiva (`unequipSpell`) e una spell inesistente (`useSpell`), non un personaggio mancante come indicava il plan. Il caso di `unequipSpell` asseriva anche il vecchio messaggio inglese `/is not active/`, che con `ResourceNotFoundException.activeSpell()` sarebbe fallito.
- **Fix:** ho sostituito quell'asserzione con `toMatchObject({ code: 'NOT_FOUND', message: 'Magia non attiva per questo personaggio' })` e ho aggiunto `toMatchObject({ code: 'NOT_FOUND' })` al caso di `useSpell`. `toThrow(NotFoundException)` resta in entrambi.
- **Commit:** b7ad52a

**2. [Formatting] Prettier va a capo dove le acceptance grep si aspettano una riga sola**
- Il decorator di `useSpell` supera la larghezza di riga, e prettier lo spezza in `@OwnsCharacter<{ request: UseSpellRequest }>(` più `({ request }) => request.characterId,` sulla riga successiva. La grep su una sola riga del plan quindi non trova nulla, anche se il contenuto è identico. Ho tenuto la formattazione di prettier, come negli altri plan.

**3. Lint di characters.service.ts**
- Il file ha problemi prettier ed ESLint preesistenti: 44 errori prima, 38 dopo. Il calo viene dall'import accorciato e dalle righe `throw` più corte. Come in 03-01, non ho riformattato il file e il diff si limita alle righe modificate.

## Notes

- Il punto aperto di 03-05 è chiuso: l'innkeeper su un id ben formato ma inesistente riceve ora `{ code: 'NOT_FOUND' }` dal service, anche su `character(id)`, `equipment(id)` e sullo snapshot di `characterUpdated`.
- Un innkeeper con un id **malformato** (es. `'abc'`) passa la policy grazie al bypass e arriva a `findById`, che lancia un CastError (oggi un errore non tipizzato). Il plan non lo copre: per l'adventurer lo stesso input esce già `NOT_FOUND` dalla policy.
- La logica read-modify-write delle mutation non è stata toccata (atomicità: Phase 4).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: src/characters/characters-ownership.int-spec.ts
- FOUND: commit 9185997
- FOUND: commit b7ad52a
