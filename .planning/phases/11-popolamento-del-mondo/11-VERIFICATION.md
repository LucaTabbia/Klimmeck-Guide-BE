---
phase: 11-popolamento-del-mondo
verified: 2026-11-02T14:45:00Z
status: passed_with_gaps
score: 7/7 success criteria verified (2 gap minori di contenuto/documentazione, nessun blocker)
overrides_applied: 0
re_verification: false
gaps:
  - truth: "SC3 / BE-CONTENT-03: lore con relatedLore incrociate"
    status: partial
    reason: "4 lore su 405 hanno relatedLore vuoto; una (Bandiera mortuaria) non è collegata da nulla (nessun link in entrata né in uscita)"
    artifacts:
      - path: "content/lore/piante.yaml:51"
        issue: "Bandiera mortuaria (6ae8065202a77381730f2829): relatedLore [], nessuna lore/nemico/quest la riferisce; le altre 8 piante hanno 2-4 link"
      - path: "content/lore/creature-a.yaml:140"
        issue: "Doppelganger: relatedLore [] (solo il link in entrata dal nemico omonimo)"
      - path: "content/lore/creature-b.yaml:20"
        issue: "Fantasma: relatedLore [] (solo il link in entrata dal nemico omonimo)"
      - path: "content/lore/creature-b.yaml:174"
        issue: "Mimic: relatedLore [] (solo il link in entrata dal nemico omonimo)"
    missing:
      - "Collegare Bandiera mortuaria almeno a una regione/lore di cimiteri o creature (es. il testo cita cimiteri e il veleno «Rancore nero») e dare 1-2 relatedLore a Doppelganger, Fantasma, Mimic; poi --check, --apply, --verify"
  - truth: "SC5 / BE-CONTENT-05: le 77 magie esistenti più al massimo 10 nuove dal saggio"
    status: partial
    reason: "Nel contenuto le magie nuove sono 11 (5 sciamanesimo + 5 Vuoto + 1 «Urlo del Berserker» aggiunta dall'utente il 2026-11-02); i 10 dal saggio rispettano il tetto, ma ROADMAP e REQUIREMENTS dicono ancora «al massimo 10 nuove» senza menzionare l'aggiunta dell'utente (BACKEND-NOTES.md:68 dice correttamente 11)"
    artifacts:
      - path: "content/spells/potenziamenti-nuovi.yaml:3"
        issue: "magia nuova fuori dal saggio, aggiunta dall'utente (commento nel file)"
      - path: ".planning/ROADMAP.md:377"
        issue: "testo non allineato al contenuto (88 magie = 77 + 11)"
    missing:
      - "Allineare ROADMAP SC5 e REQUIREMENTS BE-CONTENT-05 (es. «+ 10 dal saggio e 1 aggiunta dall'utente») oppure registrare l'aggiunta come emendamento di D-15"
human_verification:
  - test: "Revisione dei contenuti da parte dell'utente (SC1 «rivisti dall'utente»)"
    expected: "L'utente conferma lore, nemici, quest (581 contro ~475 stimate), il titolo doppio di Necrorian e i numeri da calibrare elencati in BACKEND-NOTES.md §11"
    why_human: "Giudizio di prodotto/narrativo; la revisione del 2026-11-02 ha già prodotto D-32/D-33/D-34 ma risulta ancora aperta come manual-only in 11-26-SUMMARY"
  - test: "Quick task FE che rimuove `unlocked` da lore_queries.dart e lore.dart prima della merge"
    expected: "La query FE `lores` non seleziona più `unlocked`; solo allora la PR BE esce dal draft"
    why_human: "Dipendenza cross-repo (D-25), fuori da questo repo"
  - test: "Secondo passaggio immagini (content/images.yaml oggi vuoto)"
    expected: "L'utente carica su Cloudinary e compila images.yaml; --apply scrive Lore.image / Enemy.imagePath / Pet.imagePath"
    why_human: "Le immagini sono a carico dell'utente per decisione (D-24)"
---

# Phase 11: Popolamento del mondo — Verification Report

**Phase Goal:** il DB contiene il mondo di Klimmeck del documento di world building (lore, nemici, pet, magie, equipaggiamento, loot, quest fisse e dungeon) in file di contenuto versionati caricati da uno script idempotente.
**Verified:** 2026-11-02 (branch `feat/11-popolamento-del-mondo`, HEAD `a1f1fea`, 168 commit sopra `origin/develop`)
**Status:** passed with gaps (2 gap minori, nessun blocker)
**Re-verification:** No — verifica iniziale

## Metodo

Sola lettura. Evidenze raccolte con: `node dist/content/run-content.js --check` (exit 0; `dist/content/run-content.js` compilato alle 14:12, dopo l'ultimo commit su `src/`/`content/` che non sia docs o `package.json`), un caricamento offline dell'albero con `loadContentTree` + `mapContentTree` del compilato (documenti esattamente come li scriverebbe `--apply`), lettura dei report `reports/11-24-*.json`, `git diff origin/develop...HEAD -- src/schema.gql`, grep su codice e test. Nessun comando sul database, nessuna lettura di `.env`, nessuna corsa jest (non necessaria: le affermazioni sono verificabili su file e report; la suite completa è nel gate 11-26). `pgrep -fl jest` vuoto a fine verifica.

Corrispondenza file ↔ DB: dopo il caricamento (`30c0e13`, 13:59) nessun commit ha toccato `content/` salvo `content/README.md` (80f4e52, solo prosa); i conteggi di `--check` su HEAD (lore 405, spells 88, equipmentitems 172, lootitems 101, enemies 150, pets 13, quests 581) coincidono con `11-24-verify-after.json`.

## Goal Achievement — Success Criteria della ROADMAP (§Phase 11, ROADMAP.md:368)

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | Cartella `content/` versionata (YAML) con lore, nemici, pet, magie, equipaggiamento, loot, quest fisse dal documento; `.docx` fuori dal repo; nessuna immagine | ✓ VERIFIED | 75 file in `content/{lore,enemies,pets,spells,equipment,loot,quests,fixes,world}` + `config.yaml`, `images.yaml`, `README.md`; testo sorgente in `source/world-building.md`; `git ls-files` → 0 `.docx`, 0 immagini in `content/`; `images.yaml` = `lore: [] / enemies: [] / pets: []` (secondo passaggio, D-24). Revisione utente: parziale, vedi Human Verification |
| 2 | CLI idempotente per `_id`, riferimenti risolti, `--verify` riporta orfani/duplicati/violazioni senza scrivere; rieseguito non cambia nulla | ✓ VERIFIED | `src/content/run-content.ts` (+ `sync/`, `checking/`, `fixes/`); `package.json:25-30` script `content:check/new-id/generate-quests/dry-run/verify/apply`; `11-24-verify-after.json`: ogni collezione `inserted 0 / modified 0 / orphans []`, `cities.relatedLore` unchanged 167, 9 fix `done`, `errors []`, `probableIdDivergence []`; `11-24-apply-2.json`: tutte le collezioni `inserted 0 / modified 0`; `11-24-dry-run.json` riporta i 7 orfani di prova senza scrivere; warning duplicati attivo (titolo doppio Necrorian `quests/dungeon.yaml:745`); test `content-sync.int-spec.ts`, `content-prune.int-spec.ts`, `run-content.cli.int-spec.ts`, `content-wire.int-spec.ts` (4 casi, incluso «applies the real content a second time without changes (D-01)») |
| 3 | ~300 lore a grana fine, culti in terne, `relatedLore` incrociate, città ↔ propria lore ↔ regione | ✓ VERIFIED (gap minore) | 405 lore: city 167, enemy 80, character 26, animal 22, god/religion/ceremony 18/18/18, region 17, knowledge 13, material 9, plant 9, state 8 (D-23: 350–450). Tutte le 18 `god` collegano la propria `religion` e `ceremony`. 167/167 lore `city` collegano una `region` e uno `state`; `cityLore` aggiorna 167 città (`missing: []` nei report). `Lore.unlocked` assente in tutti i documenti mappati. **Gap:** 4 lore con `relatedLore: []` (vedi Gap 1) |
| 4 | Nemici: creature del documento + intake (umani, gigante, orchi) + varianti; XP/habitat dal documento; HP/danni/debolezze da formula per fascia | ✓ VERIFIED | 150 nemici: monster 84 (62 schede del documento esplose per variante + Arbusto Maligno), animal 23, legendary 22 (13 schede → 22 varianti), humanoid 21 (14 PNG di `umani.yaml` + 7 di `giganti-orchi.yaml`: orchi, goblinoidi, Gigante delle colline). Riconciliazione 62/22/13 documentata in `11-22-SUMMARY.md:61-63` (il «63»/«14» della roadmap contava un `[IMG]` doppio). `content/config.yaml`: `xpScale 0.14084507`, `hpScale 100`, `damageScale 100`, `tiers`; il loader deriva `xp`/`lifePoints`/`damages` da `source.{pe,pf,damagePerRound}` (xp 1–29296, HP 100–99400); `locations` non vuote per 150/150; ogni nemico ha `relatedLore` verso una lore `enemy`/`animal`; 39 con debolezze dedotte |
| 5 | Pet 6–8 + 3–4 nuovi; 77 magie + max 10 dal saggio; 27 unici; comune/uncommon; cibo tarato 1 power = 3 min | ✓ VERIFIED (gap di documento) | Pet 13 = Cavallo da viaggio + 8 dal documento + 4 nuovi (Cammello, Lupo invernale addestrato, Cinghiale gigante da sella, Tartaruga gigante), `speedModifier` 1.2–4, HP e prezzi presenti. Magie 88 = 77 + 5 `sciamanesimo.yaml` + 5 `vuoto.yaml` + 1 `potenziamenti-nuovi.yaml` (aggiunta dall'utente, Gap 2). Unici 27 in `equipment/unici.yaml` (rare 10, ultrarare 9, legendary 8). Equip common 30 / uncommon 28 invariati. Loot 101: hunger 33 (12 regionali nuovi in `cibo-regionale.yaml`), heal 25 (pozioni), munition 13; `config.yaml` `food.minutesPerPower: 3`; power del cibo 5–200 |
| 6 | Quest fisse per città con le regole di tipo; dungeon su ogni POI dungeon; servizio sul marker, hunt/dungeon su POI distinti; premi per fascia; nessuna enemy/boss | ✓ VERIFIED | 581 quest: heal 166, job 166 (167 città − Necrorian), guard 68, crime 34, study 30, hunt 77, dungeon 40. Controllo per città su `world/cities.yaml`: 0 violazioni (1 heal + 1 job ovunque tranne Necrorian; Necrorian = solo 2 dungeon; Ferrion senza crime; ≤1 guard/crime/study/hunt per città; tutte le quest di servizio su `City.markerLocation`; nessuna hunt/dungeon sul marker; nessun POI hunt/dungeon condiviso). Hunt: 77/77 animali, PE max 200, `minTitle rookie`, POI della stessa città. Dungeon: 40/40 POI dungeon coperti, solo `monster`. Study: unica con `spellDraw: true` = Valantar, `prizes.spell` fisso in 0 quest. Tutte le 9 capitali hanno crime/guard/study. 0 quest `enemy`/`boss`. 581/581 con `infos.description` (D-32); job di Talmvere «Un aiuto alla locanda di Talmvere» (D-34). Premi = config × moltiplicatore (es. job 40 rame/0 XP, hunt 1 argento/30 XP, dungeon hero 1 oro/2000 XP) |
| 7 | Suite verde, SDL invariato salvo additivi dichiarati, handoff con inventario e ricarica | ✓ VERIFIED | `11-26-SUMMARY.md`: `test:cov` 326 suite / 4184 test exit 0, soglia `./src/content/` S92/B81/L93, build e `tsc` exit 0. `git diff origin/develop...HEAD -- src/schema.gql`: esattamente `-  unlocked: Boolean!` (Lore, D-25) e `+  description: String` (QuestInfos, D-32). `BACKEND-NOTES.md`: §2 inventario per collezione, §3 per regno + dungeon per città, §4 nemici per fascia/zona, §5 pet/unici/cibo, §6 costanti, §7 correzioni, §8–9 D-31..D-34, §10 misura D-12, §11 note fasi 12–16, §12 ricarica → `docs/runbooks/content-seeding.md` (sequenza, ricarica, immagini, ambiente separato, prune, rollback, exit code) |

**Score:** 7/7 criteri verificati; 2 gap minori (non bloccanti) annotati.

## Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-CONTENT-01 (cartella di contenuto versionata, niente immagini, `.docx` fuori) | ✓ SATISFIED | SC1 |
| BE-CONTENT-02 (CLI idempotente per `_id`, ref per id, orfani/duplicati/schema, `images.yaml`) | ✓ SATISFIED | SC2; `mapping/catalog.mapper.ts` `imageUrlsOf` applica `images.yaml` (test in `catalog.mapper.spec.ts`, `enemy.mapper.spec.ts`, `map-content.spec.ts`) |
| BE-CONTENT-03 (lore a grana fine, collegate) | ✓ SATISFIED con gap minore | SC3, Gap 1 |
| BE-CONTENT-04 (creature + intake + formula per fascia) | ✓ SATISFIED | SC4 |
| BE-CONTENT-05 (pet, magie, 27 unici, comune, cibo tarato) | ✓ SATISFIED con gap di documento | SC5, Gap 2 |
| BE-CONTENT-06 (quest fisse, Valantar con sorteggio, Necrorian/Ferrion, marker) | ✓ SATISFIED | SC6; D-31 server-side: `quest-rewards.ts:159` `spellDrawOf`, `outcome-plan.ts:339` `drawLearnableSpell`, `resolution-loader.service.ts:547`; test `study-spell-draw.int-spec.ts` («teaches a spell drawn among the unknown learnable ones (D-31)», «teaches no spell when none is learnable after the prizes», «ignores the spell catalog for a study without the flag») |
| BE-CONTENT-07 (handoff con inventario, ricarica, note 12–16) | ✓ SATISFIED | SC7 |

Nessun requisito orfano: REQUIREMENTS.md mappa sulla Phase 11 solo BE-CONTENT-01..07, tutti dichiarati dai piani.

## Decisioni D-01..D-34 (controllo puntuale)

| Decisione | Esito | Evidenza |
|-----------|-------|----------|
| D-01/D-02 id Mongo, ref per id con commento nome | ✓ | ogni voce YAML ha `id`; ref con `# nome` (es. `content/quests/valan.yaml`); upsert `_id` + `set`/`setOnInsert` nei documenti mappati |
| D-03 YAML, cartella per collezione, file per tema | ✓ | albero `content/` |
| D-04/D-05 export, orfani perimetrati, prune esplicito | ✓ | `export/`, `sync/orphans.ts`, `content-prune.ts`; dry-run elenca 7 orfani, apply non cancella |
| D-06 fix POI, Kliever, quest di prova | ✓ | `content/fixes/*.yaml`; `11-24-apply-1.json` 9 fix `applied` → `done`; `world/cities.yaml`: `Flinas:drusteaVillage`, `Kliever:northVillage` |
| D-07..D-13 nemici, fasce, scale, locations, spells, imagePath | ✓ | SC4; `config.yaml` |
| D-14..D-16 pet, magie, unici, cibo | ✓ (Gap 2 di testo) | SC5 |
| D-17..D-22 regole quest, premi, minTitle, tempi, marker, titoli | ✓ | SC6; `timeToComplete` 1–8 h da config; 2 dungeon `rookie` (Melma grigia) dal fallback testato «falls back to a monster living everywhere, then to a lower band» (`dungeon-quests.spec.ts`), documentato in `11-27-SUMMARY.md:114` |
| D-23 grana fine lore | ✓ (Gap 1) | SC3 |
| D-24 immagini al secondo passaggio | ✓ | `images.yaml` vuoto, mapper pronto; azione utente |
| D-25 rimozione `unlocked` | ✓ lato BE | SDL `-unlocked`; fix `lore-unset-unlocked` 12 documenti; quick task FE pendente (Human) |
| D-26 un solo DB, sequenza backup → verify → dry-run → apply → verify → apply | ✓ | report 11-24-*, checkpoint backup in `11-24-SUMMARY.md` |
| D-27..D-29 CLI, validazione, test | ✓ | `src/content/**`, spec e int-spec, soglia coverage |
| D-30 handoff | ✓ | SC7 |
| D-31 study di Valantar con sorteggio | ✓ | BE-CONTENT-06 |
| D-32 `QuestInfos.description` | ✓ | `src/models/quest/quest-infos.model.ts:46,73`; SDL `+description`; 581/581 descrizioni |
| D-33 recommendedLoot, solo armi, un solo `infos.enemy` | ✓ | hunt: solo `LootItem` (nessuna arma adatta: consentito dalla revisione); dungeon: equipaggiamenti consigliati solo `weapon` (4). Lista multi-nemico e algoritmo di esplorazione = Phase 13 per decisione, non gap |
| D-34 job della locanda a Talmvere | ✓ | test «gives Talmvere a job at the inn instead of the shop job (D-34)» |

## Behavioral Spot-Checks

| Comportamento | Comando | Risultato | Stato |
|---------------|---------|-----------|-------|
| Albero valido offline | `node dist/content/run-content.js --check` | exit 0, `errors: []`, 1 warning (titolo doppio Necrorian) | ✓ PASS |
| Regole quest su dati reali | `node` su `loadContentTree` + `mapContentTree` + `world/cities.yaml` | 0 violazioni città/marker/tipo | ✓ PASS |
| SDL | `git diff origin/develop...HEAD -- src/schema.gql` | solo le 2 righe dichiarate | ✓ PASS |
| Idempotenza sul DB reale | lettura `reports/11-24-verify-after.json`, `11-24-apply-2.json` | zero differenze, zero scritture | ✓ PASS |

## Anti-Patterns

| File | Riga | Pattern | Gravità | Impatto |
|------|------|---------|---------|---------|
| `content/quests/dungeon.yaml` | 745 | due dungeon di Necrorian con lo stesso nemico e titolo | ℹ️ Info | warning noto, segnalato all'utente in BACKEND-NOTES §11 |
| `content/pets/cavalcature.yaml` | — | Cavallo da viaggio esportato con 30 HP contro 1300–7500 dei nuovi | ℹ️ Info | dato preesistente, segnalato in BACKEND-NOTES §11 |
| `content/lore/piante.yaml` | 51 | lore isolata | ⚠️ Warning | Gap 1 |

Nessun TODO/placeholder nel codice di `src/content` (gate 11-26: «Known Stubs: Nessuno»).

## Human Verification Required

1. **Revisione dei contenuti** — l'utente rilegge lore/nemici/quest e i numeri da calibrare (BACKEND-NOTES §11). Perché umano: giudizio narrativo e di bilanciamento.
2. **Quick task FE su `unlocked`** — da completare prima che la PR BE esca dal draft (D-25). Perché umano: dipendenza cross-repo.
3. **Immagini** — compilazione di `content/images.yaml` dopo il caricamento su Cloudinary (D-24).

## Gap

1. **Lore senza collegamenti (SC3, BE-CONTENT-03), minore.** `Bandiera mortuaria` (`content/lore/piante.yaml:51`, `6ae8065202a77381730f2829`) ha `relatedLore: []` e non è riferita da nessuna lore, nemico o quest: è l'unica scheda completamente isolata delle 405. `Doppelganger` (`creature-a.yaml:140`), `Fantasma` (`creature-b.yaml:20`) e `Mimic` (`creature-b.yaml:174`) hanno `relatedLore: []`, raggiungibili solo dal nemico omonimo. Correzione: aggiungere 1–2 `relatedLore` a ciascuna, poi `--check` → `--apply` → `--verify`.
2. **Conteggio delle magie nei documenti di contratto (SC5, BE-CONTENT-05), solo documentazione.** Il contenuto ha 11 magie nuove (10 dal saggio + «Urlo del Berserker», aggiunta dall'utente il 2026-11-02 per i Gambali del Berserker, `content/spells/potenziamenti-nuovi.yaml:3`); ROADMAP.md:377 e REQUIREMENTS.md:144 dicono «al massimo 10 nuove dal saggio» senza l'aggiunta. Il tetto sulle magie del saggio è rispettato; va solo allineato il testo (o registrato come emendamento di D-15).

Non sono gap: la lista `enemies` multi-nemico e l'algoritmo di esplorazione delle dungeon (Phase 13 per D-33), le hunt senza arma consigliata (D-33 rivisto), i conteggi 62/13 invece di 63/14 (riconciliati in `11-22-SUMMARY.md`), le 2 dungeon `rookie` (fallback testato), il quick task FE e le immagini (azioni dell'utente per decisione).

---

_Verified: 2026-11-02T14:45:00Z_
_Verifier: Claude (gsd-verifier)_
