---
phase: quick-261105-hea
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/models/enums/use-type.enum.ts
  - src/models/enums/use-type.enum.spec.ts
autonomous: true
requirements: [BE-CONTENT-04]

must_haves:
  truths:
    - "UseType has a ninth value heal, so a spell document with useType heal passes the Mongoose enum validation"
    - "src/schema.gql is unchanged: Spell.useType is exposed as String and the UseType GraphQL enum is not emitted"
  artifacts:
    - path: "src/models/enums/use-type.enum.ts"
      contains: "heal = 'heal'"
    - path: "src/models/enums/use-type.enum.spec.ts"
      contains: "heal included"
---

# Quick 261105-hea: `heal` fra i tipi d'uso delle magie

Regola dell'utente (2026-11-05, revisione del contenuto dei mostri): le magie di cura hanno un `useType` proprio, `heal`; le magie esistenti con semantica di cura vengono riclassificate e se ne aggiungono di nuove a DB (cura a DB, D-36). Il combattimento non legge `useType` (segnaposto dell'utente). La FE aggiunge lo stesso valore con un quick task gemello.

## Task
1. RED `src/models/enums/use-type.enum.spec.ts`: pinna i nove valori con `heal` in coda.
2. `style(models)`: il file dell'enum non passava già Prettier (virgolette doppie): formattato in un commit separato prima della modifica.
3. GREEN: `heal = 'heal'` nell'enum; `npx tsc --noEmit`, prettier ed eslint sui due file; `git diff --exit-code src/schema.gql`.
