---
phase: quick-261123-lcv
plan: 01
subsystem: lore
tags: [lore, bestiary, enemies, pets, authz, graphql, schema]
key-files:
  created:
    - src/lore/lore-creature.ts
    - src/lore/lore-creature.loader.ts
    - src/lore/lore-creature.resolver.ts
    - src/lore/lore-creature.spec.ts
    - src/lore/lore-creature.resolver.int-spec.ts
    - test/authz/creature-catalogue.int-spec.ts
  modified:
    - src/lore/lore-visibility.module.ts
    - src/lore/known-enemies.resolver.ts
    - src/enemies/enemies.resolver.ts
    - src/pets/pets.resolver.ts
    - src/schema.gql
    - src/lore/known-enemies.resolver.int-spec.ts
    - src/lore/lore-related.int-spec.ts
    - src/enemies/weaknesses.wire.int-spec.ts
    - src/pets/pet-rarity.int-spec.ts
    - test/shops/catalog-sellable.int-spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - test/app.int-spec.ts
commits:
  - { hash: 4af4c55f, message: "docs(quick-261123-lcv): plan the creature of a lore for its viewer" }
  - { hash: fc3c3311, message: "test(lore): expect a lore to carry its enemy or its pet for the viewer" }
  - { hash: f699c401, message: "feat(lore): serve the enemy or the pet of a lore only to who unlocked it" }
  - { hash: 9b5900ae, message: "test(authz): expect the whole catalogue of enemies and pets to be the innkeeper's" }
  - { hash: e2f834ce, message: "feat(authz): reserve the whole catalogue of enemies and pets to the innkeeper" }
  - { hash: 96093b70, message: "test(lore): expect a creature only on its own lore, the first of its list" }
  - { hash: a338812a, message: "feat(lore): a creature belongs to its own lore, the first of its list" }
  - { hash: 4e796781, message: "test(lore): expect an enemy to be known by its own lore, as in the bestiary" }
  - { hash: d542ec9c, message: "feat(lore): an enemy is known when its own lore is unlocked" }
metrics:
  started: 2026-11-23
  completed: 2026-11-23
---

# Quick 261123-lcv: la lore porta con sé il suo nemico o il suo pet, solo per chi l'ha sbloccata

`Lore.enemy` e `Lore.pet` (nullable) servono la creatura che ha quella lore come lore PROPRIA (la prima delle sue `relatedLore`), solo a chi ha la lore sbloccata; `QuestEnemy.known` usa la stessa regola; `enemys` e `pets` sono dell'oste.

## Parole dell'utente (2026-11-23)

> «Facciamo la modifica per ottenere solo ciò che il giocatore ha sbloccato. Non ci dovrebbe essere più di una lore per nemico. I nemici conosciuti sono tutti i nemici con la propria lore sbloccata, non c'è un altro modo per sbloccarli».

> «Può chiamare quelle API solo chi ha ruolo innkeeper (perché deve poter vedere tutti i nemici, pet e così via)».

> «Foglio quest e bestiario non si dovrebbero contraddire».

Decisione a metà task (verifica del dato fatta dall'orchestratore, sola lettura): 6 nemici su 206 hanno due lore e «Goblin» è fra le `relatedLore` di 4 nemici; la lore propria di una creatura è la PRIMA del suo elenco. Il piano iniziale («il nemico che ha la lore fra le sue `relatedLore`, id più piccolo se più d'uno») è superato da questa regola.

## Decisioni

1. **Lore propria** (`ownLoreHexOf` in `src/lore/lore-creature.ts`): la prima voce di `relatedLore`. Una prima voce illeggibile o cancellata non promuove la seconda: la creatura resta senza lore propria.
2. **`Lore.enemy` / `Lore.pet`** (`LoreCreatureResolver`, field resolver sul tipo): la creatura la cui lore propria è questa lore, solo se `isVisible(viewer, lore)`. Due campi indipendenti: la stessa lore può avere sia un nemico sia un pet («Cavallo leggero»). «Goblin» → il Goblin soltanto, non il Capo goblin che la porta per seconda.
3. **Visibilità riusata, non ridefinita:** `ViewerKnowledgeService.of` (`src/lore/viewer-knowledge.service.ts`) + `isVisible` (`src/lore/lore-visibility.ts`), le stesse di ogni `relatedLore`. Eccezioni identiche: l'oste (`innkeeper`) vede tutto; senza personaggio corrente attivo (o col morto in attesa del foglio) non si vede nulla.
4. **Due proprietari della stessa lore** (oggi nel dato non capita): vince l'id più piccolo, nessun errore, una riga di `warn` con il solo id della lore (`LoreCreatureLoader`).
5. **Niente N+1** (`CreaturesOfLoreBatcher` in `src/lore/lore-creature.loader.ts`): nel repo non c'è `dataloader`; blocco per richiesta sulla stessa chiave di `ViewerKnowledgeService` (`viewerCacheKeyOf`), chiuso al tick successivo. Una lista di lore fa una sola `find` sui nemici e una sola sui pet; una lore chiusa non genera nessuna lettura. Nessuna memo oltre il blocco: una lettura per livello di annidamento, non per voce.
6. **Forma servita:** il nemico come in `enemys` (`ENEMY_WIRE_POPULATE`, orfani scartati; il proprietario si decide sui ref letti, prima del populate), il pet come in `pets`. Il filtro legge la prima voce nelle due forme salvate (ObjectId o stringa scritta da uno script di contenuto) con `$expr`.
7. **`QuestEnemy.known`** (`knowsEnemyByOwnLore`, stessa `ownLoreHexOf`): conosciuto se la lore propria del nemico è sbloccata per chi guarda. La lore si legge dal nemico già popolato sulla voce (i populate di catalogo e fogli esito non toccano `relatedLore`, che resta l'elenco dei ref): nessuna lettura in più, il viewer si legge una volta per richiesta o per evento. Senza lore propria leggibile (nessuna lore, campo assente, nemico non popolato) vale il ripiego su `status.knownEnemies`.
8. **`status.knownEnemies`** continua a essere scritto alla vittoria (`knowledge-addition.ts`, invariato) e letto da `ViewerKnowledgeService` per il solo ripiego: niente resta senza uso.
9. **`enemys` e `pets`** con `@Roles(RoleType.innkeeper)` (lo stesso decoratore di `users`, `pendingRequests`, …): il giocatore riceve `FORBIDDEN`. `enemy(id)` e `pet(id)` non toccate. I campi annidati (pet del negozio, bozze missione, nemici delle quest) non toccati.
10. Nessun migratore, nessun seeder, nessuna modifica ai dati.

## SDL

`git diff develop -- src/schema.gql` mostra solo:

```
 type Lore {
   description: String!
+  enemy: Enemy
   id: ID!
   imagePath: String
   name: String!
+  pet: Pet
   relatedLore: [Lore!]!
   type: String!
 }
```

## Chi può chiamare cosa

| Query | Prima | Ora | Espone |
|-------|-------|-----|--------|
| `enemys` | ogni utente autenticato (solo `AuthGuard` globale) | solo `innkeeper` | tutto il catalogo: `damages`, `weaknesses`, `spells`, `lifePoints`, `xp`, `locations`, `legendary`, `imagePath`, `name`; `relatedLore` ridotte al viewer |
| `pets` | ogni utente autenticato | solo `innkeeper` | tutto il catalogo: `attack`, `defense`, prezzi, `maxXp`, `maxLifePoints`, `rarity`, `speedModifier`, `sellable`, `recoveryTime`, `imagePath`, `name`; `relatedLore` ridotte al viewer, `known` |
| `enemy(id)` | ogni utente autenticato | invariata | gli stessi campi di un nemico qualunque, noto o no, dato l'id |
| `pet(id)` | ogni utente autenticato | invariata | gli stessi campi di un pet qualunque, dato l'id |

Gli id dei nemici arrivano al giocatore da `QuestEnemy.enemy` (tabellone, fogli esito), quelli dei pet da negozi, premi e inventario: `enemy(id)` e `pet(id)` restano una via per leggere i tratti di una creatura non sbloccata. Da decidere dall'utente.

## Altri punti che decidono «conosciuto»

- `QuestEnemy.known` era l'unico lettore di `knownEnemies` per il viewer (quest, `questUpdated`, fogli esito e imboscate passano tutti da `QuestEnemy`): allineato.
- `Pet.known` (`known-pets.resolver.ts`, `knowsAnyLoreOf`): conosciuto se UNA QUALUNQUE delle sue lore è visibile, o se non ne ha. Non è la regola della lore propria; coi 44 pet a una sola lore coincide. Non toccato: da decidere se allinearlo.

## RED osservati

- `fc3c3311`: unit non compilava (modulo assente); integration: stringa dello SDL e suite del resolver non compilabile.
- `9b5900ae`: 3 falliti (`enemys` e `pets` servite al giocatore, lista degli handler dell'oste). In questo commit `test/authz/handler-fixtures.ts` non compila (`Record` senza le due voci nuove): chiuso nel GREEN.
- `96093b70`: unit 8 falliti su 10; integration 4 falliti su 14 (seconda voce, pet, orfano in testa, avviso).
- `4e796781`: unit 5 falliti; integration 5 falliti su 14.

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest --selectProjects unit`: 315 suite / 4761 test verdi.
- `npx jest --selectProjects integration --runInBand --forceExit`: 165 suite / 2742 test verdi.
- Build: `npx tsc -p tsconfig.build.json --outDir <scratchpad>` a 0. `npm run build` NON eseguito: un BE gira da `dist/` sulla 3001 e `nest build` ha `deleteOutDir: true`.
- prettier ed eslint sui file toccati: puliti.

## Test esistenti adattati

Le spec che leggevano `enemys`/`pets` da giocatore: le prove di forma del filo (`weaknesses.wire`, `pet-rarity`, `catalog-sellable`, due di `lore-related`) leggono da oste; le prove per viewer di `lore-related` passano da `enemy(id)`/`pet(id)`. Due test diventati doppioni tolti («single pet query too» per `relatedLore` e per `known`). `authorization-matrix`: 18 → 20 righe dell'oste.

## Note per la FE

- **Rottura voluta:** un giocatore che chiama `enemys` o `pets` riceve `FORBIDDEN`. La FE deve smettere di leggerle (Bestiario e ogni altro uso da giocatore) prima che questo ramo arrivi dove gira l'app.
- Bestiario: `lores { … enemy { damages { … } weaknesses { base energy } } pet { attack { … } defense { … } } }`; i due campi sono `null` sulle lore non di creatura.
- `QuestEnemy.known` ora segue il Bestiario: vero anche per un nemico mai sconfitto se la sua lore è sbloccata (pet comprato), falso per un nemico sconfitto la cui lore propria è chiusa.

## Aperto

- `enemy(id)` / `pet(id)` aperte a ogni giocatore (sopra).
- `Pet.known` con la regola «una qualunque lore».
- Il nemico servito dentro `Lore.enemy` espone `Enemy.relatedLore` ridotte al viewer come ovunque.
