---
phase: quick-261105-hea
plan: 01
subsystem: models
tags: [spell, use-type, heal]
requirements: [BE-CONTENT-04]
key-files:
  modified:
    - src/models/enums/use-type.enum.ts
    - src/models/enums/use-type.enum.spec.ts
commits:
  - { hash: 7e255af, message: "test(models): expect heal among the spell use types" }
  - { hash: 4b69bbc, message: "style(models): format use-type.enum.ts" }
  - { hash: 34adf5f, message: "feat(models): add the heal use type for the healing spells" }
---

# Quick 261105-hea: `heal` fra i tipi d'uso delle magie

`UseType` ha il nono valore `heal`: una magia con `useType: 'heal'` passa la validazione Mongoose. Nessuna modifica SDL (`Spell.useType` è `String` sul filo; l'enum GraphQL `UseType` non è emesso perché `SpellInput` non è usato da nessun resolver). Il combattimento segnaposto non legge `useType`.

## Modifiche
- `use-type.enum.ts`: `heal = 'heal'` (file formattato con Prettier in un commit di stile separato, come da regola).
- `use-type.enum.spec.ts`: due casi (RED confermato: 2 falliti).

## Gate
- `npx jest src/models/enums/use-type.enum.spec.ts --selectProjects unit`: 2/2.
- `npx tsc --noEmit -p tsconfig.json`: 0; prettier e eslint puliti sui due file.
- `git diff --exit-code src/schema.gql`: nessuna differenza. Nessun trailer nei commit.

## Dati (cura a DB dopo la merge e dopo l'installazione della FE con `heal`)
- Riclassificare in `heal`: Tocco Radioso, Rigenerazione Necrotica, Tocco Guaritore (inserita il 2026-11-05 come `enhance` provvisorio) e le loro copie incorporate nei nemici.
- Magie nuove `heal`: Cura Ferite, Linfa della Foresta, Preghiera di Guarigione, Rigenerazione Vitale (valori nel file di proposta della sessione).

## Deviazioni
Nessuna. Eseguito dall'orchestratore in un worktree (`fix/spell-heal-use-type` da `develop` `162c1f5`) perché l'albero principale è occupato dagli executor della Phase 13.1.
