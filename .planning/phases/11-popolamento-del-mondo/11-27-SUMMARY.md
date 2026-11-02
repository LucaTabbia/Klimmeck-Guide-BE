---
phase: 11-popolamento-del-mondo
plan: 27
subsystem: content
tags: [content, quests, generator, graphql, BE-CONTENT-06]
requires: ["11-23"]
provides:
  - "QuestInfos.description: String (nullable, @Prop default null + @Field) e QuestInfosInput.description; SDL: una sola riga `+  description: String` in `type QuestInfos`"
  - "QuestInfosEntry.description (@Optional @Text, subito dopo title); mapper: `description: infos.description ?? null` ultima chiave di infos"
  - "src/content/generation/seeded-chance.ts: keyedChance(seed, key) (FNV-1a 32 sui code point, XOR col seme)"
  - "src/content/generation/quest-descriptions.ts: QUEST_DESCRIPTIONS, DescriptionKind, DescriptionNames (3 varianti per tipo)"
  - "generatore: descriptionOf, bestLootOf(heal|hunger), explorationGearOf, dungeonRecommendedLoot, huntWeaponOf, strongestWeaponOf, huntRecommendedLoot; costanti RECOMMENDED_HUNT_EQUIPMENT = 1, RECOMMENDED_EXPLORATION = 2"
  - "content/quests/*.yaml rigenerati: 581 quest con description e recommendedLoot D-33, stessi id"
  - ".planning/phases/11-popolamento-del-mondo/reports/11-27-generate.json"
affects: [11-24, 11-25, 11-26]
tech-stack:
  added: []
  patterns:
    - "estrazioni di sapore su un flusso con seme legato alla chiave della quest (`keyedChance`): il flusso principale `world.chance` non cambia"
    - "campo nuovo del mapper come ULTIMA chiave del sotto-documento: confronto BSON del sync stabile"
key-files:
  created:
    - src/content/generation/quest-descriptions.ts
    - src/content/generation/quest-descriptions.spec.ts
    - .planning/phases/11-popolamento-del-mondo/reports/11-27-generate.json
  modified:
    - src/models/quest/quest-infos.model.ts
    - src/schema.gql
    - test/app.int-spec.ts
    - src/content/schema/quest.content.ts
    - src/content/schema/quest.content.spec.ts
    - src/content/mapping/quest.mapper.ts
    - src/content/mapping/quest.mapper.spec.ts
    - src/content/generation/seeded-chance.ts
    - src/content/generation/seeded-chance.spec.ts
    - src/content/generation/quest-titles.ts
    - src/content/generation/fixed-quests.generator.ts
    - src/content/generation/service-quests.spec.ts
    - src/content/generation/hunt-quests.spec.ts
    - src/content/generation/dungeon-quests.spec.ts
    - src/content/generation/determinism.spec.ts
    - test/content/generator-world.fixture.ts
    - src/content/content-wire.int-spec.ts
    - content/README.md
    - content/quests/{drustea,valan,mirwa,fiamme,madre,liberia,speciali,dungeon}.yaml
    - .planning/phases/11-popolamento-del-mondo/11-REPO-RULES.md
    - .planning/phases/11-popolamento-del-mondo/11-25-PLAN.md
    - .planning/phases/11-popolamento-del-mondo/11-26-PLAN.md
    - .planning/phases/11-popolamento-del-mondo/11-VALIDATION.md
decisions:
  - "D-32: description additiva e nullable; QuestInfosInput non è esposto, quindi lo SDL cresce di una sola riga"
  - "D-33: hunt e dungeon consigliano oggetti entro la rarità della fascia; le nuove estrazioni (variante dell'annuncio, oggetti da esplorazione) usano keyedChance e non spostano i sorteggi principali"
  - "Il ripiego delle hunt segue alla lettera il piano (equipaggiamento con più danni totali): sui dati reali sceglie un elmo, segnalato all'utente invece di restringere a equipType weapon"
metrics:
  duration: "~8 min (misurati dal primo comando)"
  completed: 2026-11-02
  tasks: 5
  files: 37
---

# Phase 11 Plan 27: descrizioni degli annunci e loot consigliato Summary

Campo additivo `QuestInfos.description` dal modello al mapper (D-32), annunci generati in 3 varianti per tipo nella voce di chi li affigge con un flusso `keyedChance` per quest, `recommendedLoot` arricchito per dungeon (armi + cura + cibo + 2 oggetti da esplorazione) e hunt (un equipaggiamento + cura) (D-33), e rigenerazione delle 581 quest reali con gli stessi id, città, tipo e marker.

## Commit

| Task | Fase TDD | Commit | Messaggio |
|------|----------|--------|-----------|
| 1 | RED | aa3386d | test(quests): expect the additive quest description (11 D-32) |
| 1 | GREEN | 7fa80ae | feat(quests): add the additive quest description field (11 D-32) |
| 2 | RED | 78658e7 | test(content): expect a notice description on fixed quests (D-32) |
| 2 | GREEN | aabf3d2 | feat(content): describe every fixed quest in its poster's voice |
| 3 | RED | a9c98fc | test(content): expect richer recommended loot (D-33) |
| 3 | GREEN | 51f6047 | feat(content): recommend food, exploration and hunt gear (D-33) |
| 4 | — | 461ef00 | feat(content): regenerate fixed quests with notices and gear |
| 5 | — | ec4dbe0 | docs(phase-11): amend the SDL gates for the quest description |

Ogni commit controllato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject ≤ 72 contati con `wc -c` (61, 64, 65, 63, 52, 63, 60, 61).

### Fallimenti RED attesi

- **Task 1:** unit 3 rossi su 24 (`description` rifiutata come chiave sconosciuta in `accepts a quest with its notice description (D-32)`; chiavi del mapper senza `description`; `writes the notice description or null (D-32)` → `Received: undefined`). Il caso `rejects an empty or newline-terminated description (D-32)` era già verde per il motivo sbagliato (chiave sconosciuta), verde per il motivo giusto dopo GREEN. Boot reale: 1 rosso su 67 (`writes the quest description as an additive field (11 D-32)`); `git diff --exit-code src/schema.gql` = 0 dopo il boot rosso.
- **Task 2:** `quest-descriptions.spec.ts` e `service-quests.spec.ts` non partono (`Cannot find module`), 3 rossi `keyedChance` (non esportata), 2 rossi descrizione hunt/dungeon; 51 verdi.
- **Task 3:** 3 rossi (dungeon D-33, hunt D-33 e ripiego hunt D-33). `keeps every main draw when the flavour items change (D-33)` verde al primo colpo, come atteso: protegge un invariante che il codice già rispettava (nessun oggetto da esplorazione sorteggiato prima di questo piano).

## Verifiche (righe chiave)

- `npx jest src/content/generation src/content/schema src/content/mapping src/content/run-generate-quests.spec.ts src/content/content-tree.spec.ts --selectProjects unit` → `Test Suites: 20 passed`, `Tests: 208 passed`.
- `npx jest test/app.int-spec.ts src/content/content-wire.int-spec.ts --selectProjects integration --runInBand` → `Tests: 71 passed` (boot reale 67, filo 4 compreso `serves the notice description of every fixed quest (D-32)` e `applies the real content a second time without changes (D-01)` col campo nuovo).
- `git diff origin/develop -- src/schema.gql | grep -E '^[-+][^-+]'` → `-  unlocked: Boolean!` e `+  description: String`; `git diff --exit-code src/schema.gql` = 0 dopo ogni commit.
- `node dist/content/run-generate-quests.js` → `exit 0`; report: 581 quest (heal 166, job 166, guard 68, crime 34, study 30, hunt 77, dungeon 40; file identici a 11-23: drustea 70, valan 79, mirwa 100, fiamme 96, madre 33, liberia 59, speciali 104, dungeon 40), `spellDraw: 1`, `skipped: []`, `orphaned: []`, `errors: []` (metadati identici a `11-23-generate.json`); grep URI sul report = `0`.
- Confronto con `29de261`: `{"bad":0, dungeonDrift: 7 id}` → exit 0; nessuna quest non-dungeon cambiata salvo `description` e `recommendedLoot`.
- 581 righe `    description: |-` = 581 `- id:`; righe `id:` cambiate nel diff = `0`; segnaposto residui = `0`; testo dell'utente presente in 52 heal.
- Seconda corsa del generatore: `git diff --exit-code content/quests` = 0 (byte identici).
- `node dist/content/run-content.js --check` → exit 0, 1 warning (invariato): titolo doppio «Dungeon: Drago d'ombra giovane presso Necrorian» (`6ae80db9da5c5f8cc552680c`, `quests/dungeon.yaml` riga 763).
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task di codice; `pgrep -fl jest` vuoto; nessun `process.env.` in `src/` fuori dalle spec.

## Descrizioni per tipo (varianti estratte sulle 581 quest reali)

| Tipo (voce) | Variante 1 | Variante 2 | Variante 3 | Totale |
|-------------|-----------:|-----------:|-----------:|-------:|
| heal (tempio; v1 = testo dell'utente) | 52 | 57 | 57 | 166 |
| job (bottegaio) | 50 | 62 | 54 | 166 |
| guard (capitano della guardia) | 23 | 23 | 22 | 68 |
| crime (committente losco) | 9 | 11 | 14 | 34 |
| study (studioso) | 7 | 14 | 8 | 29 |
| spellStudy (studiosi di magia, Valantar) | 0 | 1 | 0 | 1 |
| hunt (cacciatore o contadino) | 30 | 23 | 24 | 77 |
| dungeon (gilda degli esploratori) | 13 | 11 | 16 | 40 |

## Loot consigliato (D-33)

- **hunt (77):** ognuna ha esattamente 1 cura («Pozione di guarigione») e 1 equipaggiamento. Tutte e 77 ricevono «Elmo di ferro leggero» (`68c19536541d89c481b83258`, common, `damages` cut 450 + pierce 400 + fuoco): nessuna arma `common` colpisce le debolezze degli animali cacciati, quindi scatta il ripiego del piano (equipaggiamento `common` con la potenza totale dei `damages` più alta). Vedi il punto per l'utente sotto.
- **dungeon (40):** ognuna ha 1 cura, 1 cibo (`hunger`) e 2 oggetti `exploration` distinti (nessuna con meno di 2: il tetto più basso, `common`, ne lascia già 5). Equipaggiamenti contro le debolezze: 2 in 7 dungeon (Driade a Noxgard e Lehadorei, Drago d'ombra giovane ×2 a Necrorian, Drago d'argento cucciolo a Veg Faldir, Yeti a Ferrion, Progenie vampirica a Kom Dorul), 0 nelle altre 33 (mostri senza debolezze o nessun equipaggiamento entro la rarità le colpisce). Fasce: adventurer 20, paladin 11, mage 4, hero 3, rookie 2.
- Quest di servizio: `recommendedLoot` vuoto (invariato).

## dungeonDrift (rispetto a 11-23, `29de261`)

Id, città e marker invariati; cambiano mostro/titolo o `randomLoot` per le correzioni del catalogo successive a 11-23.

| Id | Titolo prima | Titolo dopo | Campi cambiati |
|----|--------------|-------------|----------------|
| `6ae80db9da5c5f8cc55267f6` | Dungeon: Elementale dell'acqua presso Morrulir | (uguale) | `prizes.randomLoot` |
| `6ae80db9da5c5f8cc55267fa` | Dungeon: Arbusto Maligno presso Arbisrah | Dungeon: Melma grigia presso Arbisrah | `infos.title`, `infos.enemy`, `infos.relatedLore` |
| `6ae80db9da5c5f8cc55267ff` | Dungeon: Drago d'ombra giovane presso Necrorian | (uguale) | `prizes.randomLoot` |
| `6ae80db9da5c5f8cc5526803` | Dungeon: Drago di rame giovane presso Virnen | (uguale) | `prizes.randomLoot` |
| `6ae80db9da5c5f8cc5526809` | Dungeon: Arbusto Maligno presso Hiorgen | Dungeon: Melma grigia presso Hiorgen | `infos.title`, `infos.enemy`, `infos.relatedLore` |
| `6ae80db9da5c5f8cc552680e` | Dungeon: Drago di rame giovane presso Telobren | (uguale) | `prizes.randomLoot` |
| `6ae80db9da5c5f8cc552681a` | Dungeon: Djinni presso Ferrion | (uguale) | `prizes.randomLoot` |

L'Arbusto Maligno ha lasciato le due dungeon per il nuovo habitat (`e9119da`); i `randomLoot` delle fasce `hero` cambiano perché i 5 oggetti delle figure storiche sono diventati `legendary` (`9edb191`).

## Punti per l'utente

- `QuestInfos.description` è **additivo** e nullable: il FE può selezionarlo in `quest_queries.dart` per mostrare l'annuncio, senza rotture. `QUEST_FIELDS` del FE non lo chiede ancora; `content-wire.int-spec.ts` lo prova con una query dedicata.
- Ripiego delle hunt: nel modello di combattimento i `damages` di ogni equipaggiamento indossato contano come attacco, quindi il ripiego del piano sceglie un elmo per tutte le 77 hunt. Se l'utente preferisce un'arma vera (`equipType: weapon`), è una modifica di una riga in `strongestWeaponOf` (+ test) da decidere.
- 33 dungeon su 40 non hanno equipaggiamenti consigliati contro le debolezze (dati dei mostri): da rivedere con la calibrazione dei nemici.
- Grammatica dei template: «vicino a Anden», «presso Ankheg» ecc. seguono il testo fissato dal piano (nessuna «ad» eufonica); ritoccabile in `quest-descriptions.ts` con una rigenerazione.
- Titolo doppio di Necrorian invariato (unico warning di `--check`).

## Deviations from Plan

- **README (minore):** nella regola del `recommendedLoot` delle hunt aggiunto il ripiego «(in mancanza, l'equipaggiamento con più danni in totale)», per descrivere l'algoritmo reale. Nessun altro scostamento: `run-generate-quests.spec.ts` è rimasto verde senza modifiche.

Nessuna deviazione Rule 1–4 sul codice.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/content/generation/quest-descriptions.ts`, `src/content/generation/quest-descriptions.spec.ts`, `.planning/phases/11-popolamento-del-mondo/reports/11-27-generate.json`.
- Commit presenti: aa3386d, 7fa80ae, 78658e7, aabf3d2, a9c98fc, 51f6047, 461ef00, ec4dbe0.
