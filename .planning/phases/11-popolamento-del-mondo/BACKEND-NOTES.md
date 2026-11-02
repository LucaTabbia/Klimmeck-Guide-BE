# BACKEND-NOTES — Phase 11 Popolamento del mondo (handoff per il FE, le UAT 13–17 e le fasi BE 12–16)

- **Fase BE:** 11-popolamento-del-mondo (requisiti BE-CONTENT-01..BE-CONTENT-07; decisioni D-01..D-34 in `11-CONTEXT.md`).
- **Data:** 2026-11-02. Documento di fine fase (piano 11-25), scritto dopo il caricamento sul database unico (piano 11-24) e prima del gate finale 11-26.
- **Branch:** `feat/11-popolamento-del-mondo` → PR verso `develop`, **in draft** finché il quick task FE su `unlocked` (§1) non è rilasciato.
- **Schema:** rispetto a `origin/develop` lo SDL ha **una riga tolta** (`  unlocked: Boolean!` in `type Lore`, D-25, l'unica modifica non additiva) e **una riga aggiunta** (`  description: String` in `type QuestInfos`, D-32). Lo schema generato `src/schema.gql` vince su questo documento.
- **Fonte dei numeri:** i file di `content/` (letti in sola lettura) e i report committati in `reports/` (`11-12-stats.json`, `11-23-generate.json`, `11-27-generate.json`, `11-24-apply-1.json`, `11-24-verify-after.json`). Nessuna lettura del database per questo documento: dopo l'apply del piano 11-24 il database coincide con i file (`--verify` a zero differenze).
- **Regola dei letterali:** operatori Mongo, chiavi YAML e letterali GraphQL compaiono solo in code span; nessun URI né host, solo placeholder.

---

## 0. TL;DR per il FE

1. **Azione richiesta PRIMA della merge della PR BE:** togliere `unlocked` dalla query delle lore e dal modello `Lore` (§1). Un'app che lo seleziona riceve un errore di validazione GraphQL sull'intera query `lores`.
2. Il database unico contiene il mondo: 405 lore, 150 nemici, 13 pet, 88 magie, 172 equipaggiamenti, 101 loot, 581 quest fisse su 167 città (§2–§5).
3. `QuestInfos.description: String` è additivo e nullable: il FE può mostrarlo come annuncio della quest (§9).
4. Il BE che serve il database deve girare dal branch della fase (o dalla sua merge): un BE su `develop` risponde `data: null` su `lores`/`enemys` (§1).
5. Ricaricare il contenuto: `docs/runbooks/content-seeding.md` (§12).

---

## 1. Cosa cambia per il FE (azione richiesta PRIMA della merge della PR BE)

**`Lore.unlocked` rimosso dallo SDL (D-25).** Nessun servizio BE lo leggeva; lo sblocco per personaggio arriva con la Phase 16. È l'unica modifica non additiva della fase: un client che seleziona `unlocked` riceve un errore di validazione (`Cannot query field`) e nessun dato.

Quick task FE (pattern gated 08-12/09-12), da rilasciare **prima** del deploy del BE di questa fase:

- `lib/graphql/queries/lore_queries.dart:9` — togliere la riga `unlocked` dal frammento `_LoreFields.full`.
- `lib/models/lore.dart` — togliere il campo `unlocked` dal modello: righe 12 (parametro del costruttore), 21 (campo `final bool? unlocked`), 31 (`fromJson` tollerante, `json["unlocked"] ?? false`), 41 (`toJson`), 52 e 61 (`copyWith`), 73 (`props`).
- Nessun altro file di `lib/` usa `unlocked` sulle lore (verificato con `grep` il 2026-11-02).

La PR BE resta **in draft** finché l'app con il quick task non è rilasciata.

**Quale BE serve il database.** Dal momento dell'apply sul database unico (2026-11-02), il processo BE che lo serve deve girare dal branch `feat/11-popolamento-del-mondo` o dalla sua merge: il codice del piano 11-01 popola `relatedLore` scartando i riferimenti orfani. Un BE su `develop`, senza quel populate, restituisce i `relatedLore` come id grezzi in un campo `[Lore!]!` e risponde `data: null` su `lores` ed `enemys` (Pitfall 1: la serializzazione di `id` fallisce); in più dichiara ancora `unlocked: Boolean!`, assente dalle lore nuove. Il runbook lo ripete nei prerequisiti.

**Profondità di `relatedLore` = 1 (review app ME-03, rinviata alla Phase 16).** I servizi popolano un solo livello: `cities { relatedLore }`, `lores { relatedLore }`, `enemys { relatedLore }` e `quests { infos { relatedLore } }` restituiscono lore complete, ma le lore annidate hanno a loro volta `relatedLore` come id grezzi. Il FE **non** deve selezionare `relatedLore { relatedLore { … } }` né `infos { enemy { relatedLore { … } } }`: per la catena di non-null l'intera lista risponderebbe `data: null` (Pitfall 1). Oggi il FE seleziona un solo livello, quindi il difetto è latente; un risolutore di campo con loader per richiesta arriva con la Phase 16 (lore per personaggio).

**Quest e subscription.** Le quest fisse caricate dal CLI non emettono `questUpdated` all'inserimento: la board le vede al prossimo caricamento della lista.

**Testo dei requisiti.** BE-CONTENT-05 parla di «~20» equipaggiamenti unici: quelli reali sono **27** (uno per divinità, cinque delle figure storiche, parti di mostro; §5).

---

## 2. Inventario per collezione

Totali a DB dopo l'apply del piano 11-24 (`11-24-verify-after.json`: `inserted: 0`, `modified: 0`, nessun orfano):

| Collezione | Totale | Esportate (già a DB) | Nuove della fase |
| --- | ---: | ---: | ---: |
| lore | 405 | 12 | 393 |
| enemies | 150 | 1 | 149 |
| pets | 13 | 1 | 12 |
| spells | 88 | 77 | 11 |
| equipmentitems | 172 | 145 | 27 |
| lootitems | 101 | 83 | 18 |
| quests | 581 | 0 | 581 |

**Lore per `type`:** `city` 167, `enemy` 80, `character` 26, `animal` 22, `god` 18, `religion` 18, `ceremony` 18, `region` 17, `knowledge` 13, `material` 9, `plant` 9, `state` 8. Ogni città ha la sua lore (`City.relatedLore`, 167/167) e ogni lore di città ha `relatedLore` verso regno e regione.

**Nemici per `category` e fascia** (la fascia è un dato dei soli file: `tier` > `legendary` → `legend` > livello del documento, D-10):

| Categoria | rookie | adventurer | paladin | mage | hero | legend | Totale |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `monster` | 5 | 23 | 21 | 16 | 19 | — | 84 |
| `animal` | 12 | 5 | 3 | 1 | 2 | — | 23 |
| `humanoid` | 6 | 7 | 3 | 3 | 2 | — | 21 |
| `legendary` | — | — | — | — | — | 22 | 22 |
| **Totale** | 23 | 35 | 27 | 20 | 23 | 22 | 150 |

**Magie per `useType`:** `attack` 22, `control` 15, `defense` 14, `enhance` 12, `infuse` 11, `confuse` 6, `charm` 4, `illusion` 4 (77 esistenti + 11 nuove in `sciamanesimo.yaml`, `vuoto.yaml`, `potenziamenti-nuovi.yaml`).

**Equipaggiamento per rarità:** `common` 30, `uncommon` 28, `rare` 40, `ultrarare` 37, `legendary` 37. Per slot: `weapon` 23, `helm` 21, `necklace` 21, `ring` 21, `chestPiece` 19, `gloves` 18, `boots` 17, `greaves` 16, `shield` 16.

**Loot per `effect`:** `hunger` 33, `heal` 25, `exploration` 18, `munition` 13, `none` 12.

**Quest per tipo e `minTitle`:**

| Tipo | Totale | `minTitle` |
| --- | ---: | --- |
| heal | 166 | rookie 166 |
| job | 166 | rookie 166 |
| guard | 68 | adventurer 59, paladin 9 (capitali) |
| crime | 34 | adventurer 25, paladin 9 |
| study | 30 | adventurer 21, paladin 9 (una con `spellDraw`, §8) |
| hunt | 77 | rookie 77 |
| dungeon | 40 | rookie 2, adventurer 20, paladin 11, mage 4, hero 3 |
| **Totale** | **581** | |

La stima della ricerca era ~475: la differenza viene dalle 167 città reali (heal e job in tutte tranne Necrorian) e dalle dungeon su ogni POI `dungeon` non-marker. Tempi (`timeToComplete`) e premi seguono `content/config.yaml` (§6).

---

## 3. Inventario per regno

Gruppi del generatore (`regionalGroupOf`: prefisso del `CityType`; i tipi fuori dai sei regni fanno gruppo a sé). Regole: heal e job ovunque tranne Necrorian; guard in città e capitali; crime in tutte le capitali e sorteggiata nelle città, mai a Ferrion; study nelle capitali, a Liberia e sorteggiata nelle città; hunt al più in metà delle città di un gruppo (seme fisso); dungeon su ogni POI `dungeon` che non è il marker; servizi sul marker della città, hunt e dungeon su POI distinti (D-17..D-21).

| Gruppo | Città | heal | job | guard | crime | study | hunt | dungeon |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Regno di Drustea | 21 | 21 | 21 | 10 | 5 | 3 | 10 | 3 |
| Repubblica dei Valan | 23 | 23 | 23 | 13 | 6 | 3 | 11 | 4 |
| Teocrazia di Mirwa | 29 | 29 | 29 | 15 | 8 | 5 | 14 | 9 |
| Unione delle Fiamme | 27 | 27 | 27 | 13 | 7 | 9 | 13 | 5 |
| Regno della Madre | 9 | 9 | 9 | 5 | 2 | 4 | 4 | 3 |
| Liberia | 16 | 16 | 16 | 10 | 5 | 4 | 8 | 3 |
| fuori dai regni: `aarakocraVillage` | 3 | 3 | 3 | 0 | 0 | 0 | 1 | 2 |
| fuori dai regni: `desertVillage` | 7 | 7 | 7 | 0 | 0 | 0 | 3 | 3 |
| fuori dai regni: `elfCapital` | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 |
| fuori dai regni: `ferrionCity` | 1 | 1 | 1 | 1 | 0 | 1 | 0 | 2 |
| fuori dai regni: `forestVillage` | 8 | 8 | 8 | 0 | 0 | 0 | 4 | 1 |
| fuori dai regni: `mountainVillage` | 3 | 3 | 3 | 0 | 0 | 0 | 1 | 0 |
| fuori dai regni: `necrorianCity` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| fuori dai regni: `northVillage` | 9 | 9 | 9 | 0 | 0 | 0 | 4 | 1 |
| fuori dai regni: `talmvereVillage` | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| fuori dai regni: `tropicalVillage` | 8 | 8 | 8 | 0 | 0 | 0 | 4 | 1 |

**Valantar (D-31):** l'unica study di magia è «Studi arcani a Valantar» (`6ae80db9da5c5f8cc5526781`, città `6909620487db8bf7dca08934`, `valanCapital`, marker `69096204003ac12b7cdce6e8`, `minTitle: paladin`), senza `prizes.spell` fisso (§8).

**Talmvere (D-34):** il job è «Un aiuto alla locanda di Talmvere» (`6ae80db9da5c5f8cc55265db`), annuncio nella voce dell'oste.

### Regno di Drustea

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Atheland | `drusteaCity` | città | heal, job, guard | Aquila gigante — demonicPortal/drusteaPlains | — |
| Blu Maggiore | `drusteaSeaCity` | città | heal, job, guard | Worg — drusteaPlains | — |
| Blu Minore | `drusteaSeaCity` | città | heal, job, guard, crime | — | — |
| Brurora | `drusteaVillage` | villaggio | heal, job | Formiche giganti assassine — hills/forest | — |
| Cliffbreak | `drusteaCapital` | capitale | heal, job, guard, crime, study | — | — |
| Daracre | `drusteaCity` | città | heal, job, guard | Aquila gigante — drusteaPlains | — |
| Elessa | `drusteaVillage` | villaggio | heal, job | — | — |
| Flevale | `drusteaVillage` | villaggio | heal, job | — | — |
| Flinas | `drusteaVillage` | villaggio | heal, job | — | — |
| Gemsall | `drusteaVillage` | villaggio | heal, job | — | — |
| Gran Porto | `drusteaCity` | città | heal, job, guard, crime | — | Manticora |
| Grens | `drusteaVillage` | villaggio | heal, job | Formiche giganti assassine — graveyard/drusteaPlains | — |
| Portonuovo | `drusteaSeaCity` | città | heal, job, guard, study | Aquila gigante — battleground/drusteaPlains | — |
| Qey | `drusteaCity` | città | heal, job, guard | Aquila gigante — drusteaPlains | — |
| Rivalago | `drusteaVillage` | villaggio | heal, job | — | Ankheg |
| Shando | `drusteaVillage` | villaggio | heal, job | Worg — ruins/drusteaPlains | Fuoco fatuo |
| Tipus | `drusteaCity` | città | heal, job, guard, crime | Worg — graveyard/drusteaPlains | — |
| Ufragos | `drusteaCity` | città | heal, job, guard, crime, study | Aquila gigante — drusteaPlains | — |
| Ulby | `drusteaVillage` | villaggio | heal, job | — | — |
| Umale | `drusteaVillage` | villaggio | heal, job | — | — |
| Vindence | `drusteaVillage` | villaggio | heal, job | — | — |

### Repubblica dei Valan

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Anden | `valanVillage` | villaggio | heal, job | — | Ankheg |
| Beldenn | `valanVillage` | villaggio | heal, job | — | — |
| Blu Aragh | `valanSeaCity` | città | heal, job, guard, crime | — | — |
| Chargate | `valanSeaCity` | città | heal, job, guard, crime, study | Vespa gigante — demonicPortal/valanPlains | — |
| Fineglen | `valanVillage` | villaggio | heal, job | Cavallo leggero — battleground/valanPlains | — |
| Flushhelm | `valanCity` | città | heal, job, guard | Aquila gigante — ruins/valanPlains | — |
| Gadarreck | `valanSeaCity` | città | heal, job, guard | — | — |
| Glilrid | `valanVillage` | villaggio | heal, job | Worg — graveyard/valanPlains | — |
| Gonfim | `valanVillage` | villaggio | heal, job | Iena — battleground/valanPlains | — |
| Granponte | `valanCity` | città | heal, job, guard, crime | — | — |
| Gravendale | `valanVillage` | villaggio | heal, job | Formiche giganti assassine — ruins/valanPlains | — |
| Lilmere | `valanVillage` | villaggio | heal, job | — | — |
| Marbot | `valanCity` | città | heal, job, guard | Tigre — demonicPortal/ruins/valanPlains | — |
| Millport | `valanSeaCity` | città | heal, job, guard | — | — |
| Noxgard | `valanVillage` | villaggio | heal, job | — | Driade |
| Numstegh | `valanCity` | città | heal, job, guard, crime | Aquila gigante — valanPlains | — |
| Pitchport | `valanSeaCity` | città | heal, job, guard | Aquila gigante — valanPlains | Hobgoblin |
| Quirkdale | `valanVillage` | villaggio | heal, job | — | — |
| Schuzzar | `valanVillage` | villaggio | heal, job | — | Grifone |
| Springford | `valanCity` | città | heal, job, guard | — | — |
| Tinemoor | `valanCity` | città | heal, job, guard | Worg — demonicPortal/valanPlains | — |
| Valantar | `valanCapital` | capitale | heal, job, guard, crime, study (`spellDraw`) | — | — |
| Voxhold | `valanSeaCity` | città | heal, job, guard, crime, study | Formiche giganti assassine — graveyard/valanPlains | — |

### Teocrazia di Mirwa

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Acquasacra | `mirwaCity` | città | heal, job, guard | — | — |
| Acquelimpide | `mirwaVillage` | villaggio | heal, job | — | — |
| Alexandria | `mirwaVillage` | villaggio | heal, job | Cavallo da guerra — valanPlains | Grifone |
| Arcidoma | `mirwaCity` | città | heal, job, guard, crime, study | — | — |
| Calov | `mirwaSeaCity` | città | heal, job, guard | Cavallo leggero — valanPlains | — |
| Canarra | `mirwaVillage` | villaggio | heal, job | — | — |
| Candelaria | `mirwaCity` | città | heal, job, guard, crime, study | — | — |
| Collerede | `mirwaCity` | città | heal, job, guard, study | Coccodrillo — demonicPortal/temistosLake | — |
| Delania | `mirwaVillage` | villaggio | heal, job | Lupo — ruins/mountainTemistos | — |
| Frekti | `mirwaVillage` | villaggio | heal, job | — | — |
| Isolalunga | `mirwaCity` | città | heal, job, guard, crime | Coccodrillo — temistosLake | Manticora |
| Lagoverde | `mirwaCity` | città | heal, job, guard, crime | Lupo — mountainTemistos | Manticora |
| Marescuro | `mirwaCity` | città | heal, job, guard | — | — |
| Mirwen | `mirwaCapital` | capitale | heal, job, guard, crime, study | Coccodrillo — temistosLake | — |
| Nibel | `mirwaSeaCity` | città | heal, job, guard, crime | — | — |
| Porfind | `mirwaVillage` | villaggio | heal, job | — | — |
| Quirra | `mirwaSeaCity` | città | heal, job, guard | — | Licantropo lupo |
| Ravel | `mirwaCity` | città | heal, job, guard, crime | — | — |
| Rimvel | `mirwaVillage` | villaggio | heal, job | Coccodrillo — temistosLake | Gargoyle |
| Rivechiare | `mirwaVillage` | villaggio | heal, job | — | — |
| Santuaria | `mirwaVillage` | villaggio | heal, job | Aquila gigante — ruins/mountainTemistos | — |
| Servel | `mirwaVillage` | villaggio | heal, job | — | Grifone |
| Setteveli | `mirwaVillage` | villaggio | heal, job | — | — |
| Taurin | `mirwaVillage` | villaggio | heal, job | Aquila gigante — mountainTemistos | Arpia |
| Temelia | `mirwaCity` | città | heal, job, guard, study | Coccodrillo — temistosLake | — |
| Tempioblu | `mirwaCity` | città | heal, job, guard, crime | Coccodrillo — temistosLake | Manticora |
| Vallegentile | `mirwaCity` | città | heal, job, guard | Coccodrillo — temistosLake | Licantropo cinghiale |
| Virugis | `mirwaVillage` | villaggio | heal, job | — | — |
| Vitacqua | `mirwaVillage` | villaggio | heal, job | Worg — mountainTemistos | — |

### Unione delle Fiamme

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Al Nerry | `flameVillage` | villaggio | heal, job | Avvoltoio — forest/belleholmIsland | — |
| Bellport | `flameNorthCapital` | capitale | heal, job, guard, crime, study | Worg — forest/belleholmIsland | — |
| Costenere | `flameVillage` | villaggio | heal, job | — | — |
| Cu Nuimyn | `flameVillage` | villaggio | heal, job | Avvoltoio — forest/belleholmIsland | — |
| Danmil Urvyn | `flameCity` | città | heal, job, guard | Vespa gigante — belleholmIsland | Licantropo pipistrello |
| Fiumelento | `flameCity` | città | heal, job, guard, study | — | — |
| Gellirn | `flameVillage` | villaggio | heal, job | — | — |
| Gidevolm | `flameVillage` | villaggio | heal, job | Vespa gigante — belleholmIsland | — |
| Gurlaid | `flameCity` | città | heal, job, guard, crime | Pantera — ruins/forest/belleholmIsland | — |
| Lagorovente | `flameVillage` | villaggio | heal, job | — | — |
| Mapleview | `flameVillage` | villaggio | heal, job | Iena — graveyard/belleholmIsland | — |
| Mistglen | `flameVillage` | villaggio | heal, job | — | — |
| Oldcairn | `flameCity` | città | heal, job, guard | — | — |
| Peadale | `flameVillage` | villaggio | heal, job | Pantera — vulcano/belleholmIsland | Ankheg |
| Pianecalde | `flameCity` | città | heal, job, guard, crime, study | Pantera — forest/belleholmIsland | — |
| Pinecrest | `flameCity` | città | heal, job, guard, study | — | — |
| Rosedenn | `flameCity` | città | heal, job, guard, crime, study | Pantera — belleholmIsland | Basilisco |
| Sprigfront | `flameCity` | città | heal, job, guard | — | — |
| Telobren | `flameSouthCapital` | capitale | heal, job, guard, crime, study | — | Drago di rame giovane |
| Thorndenn | `flameCity` | città | heal, job, guard, study | Lupo — forest/belleholmIsland | — |
| Ultima Terra | `flameVillage` | villaggio | heal, job | Avvoltoio — belleholmIsland | — |
| Unrike | `flameVillage` | villaggio | heal, job | — | — |
| Usrorn | `flameVillage` | villaggio | heal, job | — | — |
| Vired Ivem | `flameCity` | città | heal, job, guard, crime, study | Avvoltoio — belleholmIsland | — |
| Virnen | `flameCenterCapital` | capitale | heal, job, guard, crime, study | — | Drago di rame giovane |
| Vudyld | `flameVillage` | villaggio | heal, job | — | — |
| Yonamnel | `flameVillage` | villaggio | heal, job | — | — |

### Regno della Madre

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Biroldur | `motherVillage` | villaggio | heal, job | Aquila gigante — farNorth/mountainLamstone | — |
| Gor Buldar | `motherCity` | città | heal, job, guard, study | Aquila gigante — ruins/mountainLamstone | — |
| Himboram | `motherVillage` | villaggio | heal, job | — | — |
| Kim Todur | `motherCity` | città | heal, job, guard, study | Worg — farNorth/mountainLamstone | — |
| Kom Dorul | `motherCity` | città | heal, job, guard, study | Lupo — graveyard/farNorth/forest | Progenie vampirica |
| Kom Dural | `motherVillage` | villaggio | heal, job | — | — |
| Morrulir | `motherCapital` | capitale | heal, job, guard, crime, study | — | Elementale dell'acqua |
| Nul Lodir | `motherCity` | città | heal, job, guard, crime | — | — |
| Veg Faldir | `motherVillage` | villaggio | heal, job | — | Drago d'argento cucciolo |

### Liberia

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Altaluce | `liberiaVillage` | villaggio | heal, job | Squalo tropicale — liberiaIsland | — |
| Efragos | `liberiaVillage` | villaggio | heal, job | Squalo tropicale — liberiaIsland | — |
| Fraponte | `liberiaVillage` | villaggio | heal, job | — | — |
| Iriesa | `liberiaCity` | città | heal, job, guard, study | — | — |
| Liberia | `liberiaCapital` | capitale | heal, job, guard, crime, study | Squalo tropicale — ladows | Elementale dell'aria |
| Lushire | `liberiaCity` | città | heal, job, guard, study | Squalo tropicale — ladows | — |
| Mison | `liberiaCity` | città | heal, job, guard | — | — |
| Pontealto | `liberiaCity` | città | heal, job, guard | Squalo tropicale — ladows | Belva distorcente |
| Pontemaggiore | `liberiaCity` | città | heal, job, guard, crime | Squalo tropicale — liberiaIsland | — |
| Portominore | `liberiaCity` | città | heal, job, guard, study | — | — |
| Ridale | `liberiaVillage` | villaggio | heal, job | — | — |
| Sodiff | `liberiaVillage` | villaggio | heal, job | — | — |
| Tine | `liberiaCity` | città | heal, job, guard, crime | Squalo tropicale — ladows | Merrow |
| Vinas | `liberiaCity` | città | heal, job, guard, crime | — | — |
| Voling | `liberiaCity` | città | heal, job, guard, crime | — | — |
| Woln | `liberiaVillage` | villaggio | heal, job | Squalo tropicale — liberiaIsland | — |

### Città fuori dai regni

| Città | Tipo | Taglia | Servizi | Hunt (preda — POI) | Dungeon |
| --- | --- | --- | --- | --- | --- |
| Adehr | `desertVillage` | villaggio | heal, job | — | — |
| Agosbert | `forestVillage` | villaggio | heal, job | — | — |
| Al Anore | `forestVillage` | villaggio | heal, job | — | — |
| Andogan | `northVillage` | villaggio | heal, job | Squalo tropicale — ladows | — |
| Arbisrah | `desertVillage` | villaggio | heal, job | Vespa gigante — oasis | Melma grigia |
| Balkuldir | `aarakocraVillage` | villaggio | heal, job | — | Arpia; Ettercap |
| Bosa | `northVillage` | villaggio | heal, job | Lupo — farNorth | — |
| Capofoce | `forestVillage` | villaggio | heal, job | Cinghiale — forest | — |
| Croce Marina | `tropicalVillage` | villaggio | heal, job | — | — |
| Dalde | `tropicalVillage` | villaggio | heal, job | Pantera — forest/belleholmIsland | Drago di rame cucciolo |
| Dawnborough | `tropicalVillage` | villaggio | heal, job | Squalo tropicale — delants | — |
| Dhomfuhn | `mountainVillage` | villaggio | heal, job | Lupo — farNorth/mountainLamstone | — |
| Duril | `tropicalVillage` | villaggio | heal, job | — | — |
| Erast | `northVillage` | villaggio | heal, job | — | — |
| Ferrion | `ferrionCity` | città | heal, job, guard, study | — | Yeti; Djinni |
| Gellen | `tropicalVillage` | villaggio | heal, job | Pantera — graveyard/belleholmIsland | — |
| Gurdarul | `mountainVillage` | villaggio | heal, job | — | — |
| Hiorgen | `desertVillage` | villaggio | heal, job | — | Melma grigia |
| Inverness | `northVillage` | villaggio | heal, job | Formiche giganti assassine — graveyard/hills/farNorth | — |
| Jok | `forestVillage` | villaggio | heal, job | — | — |
| Kliever | `northVillage` | villaggio | heal, job | Lupo — farNorth | — |
| Ko Shaeras | `elfCapital` | capitale | heal, job, guard, crime, study | — | — |
| Lehadorei | `forestVillage` | villaggio | heal, job | — | Driade |
| Llyne | `northVillage` | villaggio | heal, job | — | — |
| Lunaris | `northVillage` | villaggio | heal, job | — | Ogre |
| Merlern | `tropicalVillage` | villaggio | heal, job | Worg — demonicPortal/belleholmIsland/forest | — |
| Murnborim | `aarakocraVillage` | villaggio | heal, job | — | — |
| Naellond | `forestVillage` | villaggio | heal, job | Lupo — minnelyForest | — |
| Necrorian | `necrorianCity` | città | — | — | Drago d'ombra giovane; Drago d'ombra giovane |
| Norfolk | `northVillage` | villaggio | heal, job | — | — |
| Nortorn | `northVillage` | villaggio | heal, job | — | — |
| Pinatlu | `desertVillage` | villaggio | heal, job | Avvoltoio — ruins/desert | Ippogrifo |
| Rae Thelar | `forestVillage` | villaggio | heal, job | Cinghiale — graveyard/minnelyForest | — |
| Ruldilen | `tropicalVillage` | villaggio | heal, job | — | — |
| Shadmus | `desertVillage` | villaggio | heal, job | — | — |
| Shibirm | `desertVillage` | villaggio | heal, job | Vespa gigante — ruins/oasis | — |
| Talmvere | `talmvereVillage` | villaggio | heal, job | — | Ankheg |
| Thanlenor | `forestVillage` | villaggio | heal, job | Cinghiale — minnelyForest | — |
| Thengran | `aarakocraVillage` | villaggio | heal, job | Aquila gigante — farNorth/mountainLamstone | — |
| Unaicca | `desertVillage` | villaggio | heal, job | — | — |
| Varyllod | `tropicalVillage` | villaggio | heal, job | — | — |
| Vegduhr | `mountainVillage` | villaggio | heal, job | — | — |

### Dungeon per città

Fascia = fascia del mostro; `randomLoot` = un equipaggiamento della rarità della fascia (`dungeonLootRarity`). Il nemico è un solo `infos.enemy` (il mostro principale, D-33): la lista di più nemici è della Phase 13.

| Città | POI | Tipi del POI | Nemico | Fascia | `minTitle` | `randomLoot` |
| --- | --- | --- | --- | --- | --- | --- |
| Alexandria | `690e418673e14de7938f40b4` | dungeon, valanPlains | Grifone | adventurer | adventurer | Martello da guerra |
| Anden | `690e41860bfb243ab2561f4e` | dungeon, forest | Ankheg | adventurer | adventurer | Amuleto di rame anti-elettricità |
| Arbisrah | `690e418621c73b644ef59105` | dungeon, desert | Melma grigia | rookie | rookie | Scudo di legno |
| Balkuldir | `690e41866e57dea679a38638` | dungeon, mountainLamstone | Arpia | adventurer | adventurer | Elmo in maglia anti-tuono |
| Balkuldir | `690e4186d1a98dad553e6f20` | dungeon, undergroundLamstone | Ettercap | adventurer | adventurer | Collana della megera |
| Dalde | `690e4186de4a813e91cb78cd` | dungeon, belleholmIsland | Drago di rame cucciolo | adventurer | adventurer | Martello da guerra |
| Danmil Urvyn | `690e4186bbe45b924b0d9b58` | dungeon, belleholmIsland | Licantropo pipistrello | paladin | paladin | Stivali del Viaggiatore Dimensionale |
| Ferrion | `690e4186c23eec4cfe2602ed` | dungeon, farNorth | Yeti | paladin | paladin | Anello d'argento anti-fuoco |
| Ferrion | `690e4186f32d4859391b1f3f` | dungeon, harkenIsland | Djinni | hero | hero | Guanti runici di Monteaspro |
| Gran Porto | `690e418653318af8c40224a4` | dungeon, hills | Manticora | paladin | paladin | Teschio di Corvo |
| Hiorgen | `690e4186931d631db407e07f` | dungeon, desert | Melma grigia | rookie | rookie | Brocchiero di ferro |
| Isolalunga | `690e4186b191665c70c993c0` | dungeon, mountainTemistos | Manticora | paladin | paladin | Stivali del Freddo Inverno |
| Kom Dorul | `690e4186cb0c4a6ce48fec10` | dungeon, undergroundLamstone | Progenie vampirica | paladin | paladin | Medaglione di Mezaldir |
| Lagoverde | `690e4186cb54d40e344fbb08` | dungeon, mountainTemistos | Manticora | paladin | paladin | Guanti Anti-Fuoco |
| Lehadorei | `690e418699b940097a2f45c8` | dungeon, minnelyForest | Driade | adventurer | adventurer | Sigillo della Forza |
| Liberia | `690e41861dd44fc417a149e4` | dungeon, liberiaIsland | Elementale dell'aria | mage | mage | Corona dei Saggi |
| Lunaris | `690e4186f6bb003c692f4377` | dungeon, farNorth | Ogre | adventurer | adventurer | Spada d'acciaio affilata |
| Morrulir | `690e41861479bf7ca53203e4` | dungeon, forest | Elementale dell'acqua | mage | mage | Guantoni dello spadaccino |
| Necrorian | `690e418641b1298bf5967d1f` | dungeon, glounet | Drago d'ombra giovane | hero | hero | Anello del Litch |
| Necrorian | `690e4186a2175881abee5979` | dungeon, glounet | Drago d'ombra giovane | hero | hero | Stivali della Velocità |
| Noxgard | `690e41863f26e7b6da1a2946` | dungeon, forest | Driade | adventurer | adventurer | Collana della megera |
| Peadale | `690e4186bebd481cc3fbded2` | dungeon, belleholmIsland, forest | Ankheg | adventurer | adventurer | Corazza di cuoio chiodata |
| Pinatlu | `690e41864da7fc351980c536` | dungeon, valanPlains | Ippogrifo | adventurer | adventurer | Stivali di piastre leggere |
| Pitchport | `690e4186d3f89cf09558e8fd` | dungeon, valanPlains | Hobgoblin | adventurer | adventurer | Scudo del Gladiatore |
| Pontealto | `690e4186e560bb6bf4753c69` | dungeon, forest, liberiaIsland | Belva distorcente | paladin | paladin | Stivali del Freddo Inverno |
| Quirra | `690e418646e78e6f378f0a76` | dungeon, forest | Licantropo lupo | paladin | paladin | Corazza anti-veleno |
| Rimvel | `690e418621b2a64e173b3a53` | dungeon, mountainTemistos | Gargoyle | adventurer | adventurer | Elmo in maglia anti-tuono |
| Rivalago | `690e418688c52ff52d77a25f` | dungeon, drusteaPlains | Ankheg | adventurer | adventurer | Dente di bestia |
| Rosedenn | `690e4186fcf4551102e7964b` | dungeon, belleholmIsland | Basilisco | paladin | paladin | Anello del Fulmine |
| Schuzzar | `690e41861ac3270dd0dd7f03` | dungeon, valanPlains | Grifone | adventurer | adventurer | Stivali anti-veleno |
| Servel | `690e41862bfddabc9a8c8fea` | dungeon, mountainTemistos | Grifone | adventurer | adventurer | Scudo delle Harken |
| Shando | `690e418690309049166571b0` | dungeon, swamp | Fuoco fatuo | adventurer | adventurer | Guanti del Ladro |
| Talmvere | `690e418640005dddbe21be8d` | dungeon, forest | Ankheg | adventurer | adventurer | Gambali di Ferro |
| Taurin | `690e4186d9dedb27387f936c` | dungeon, mountainTemistos | Arpia | adventurer | adventurer | Stivali anti-veleno |
| Telobren | `690e4186ba90127cb01f91df` | dungeon, belleholmIsland, forest | Drago di rame giovane | mage | mage | Tiara delle Lacrime della vergine |
| Tempioblu | `690e41865ecb002fec01d84f` | dungeon, mountainTemistos | Manticora | paladin | paladin | Elmo di ferro anti-acido |
| Tine | `690e4186dfa9fa6ead377184` | dungeon, liberiaIsland | Merrow | adventurer | adventurer | Collana della megera |
| Vallegentile | `690e4186269c891d86088137` | dungeon, forest | Licantropo cinghiale | paladin | paladin | Stivali del Ninja del Tuono |
| Veg Faldir | `690e4186a1ad003c8276386c` | dungeon, mountainLamstone | Drago d'argento cucciolo | adventurer | adventurer | Guanti del Pugile |
| Virnen | `690e418653da8c75cc5e9bb6` | dungeon, belleholmIsland | Drago di rame giovane | mage | mage | Stivali dell'Ombra |

---

## 4. Nemici per fascia e zona

Righe = `PoiType` di `locations` (`all` = ovunque); colonne = fascia. Un nemico compare in tutte le zone del suo habitat.

| `PoiType` | rookie | adventurer | paladin | mage | hero | legend |
| --- | --- | --- | --- | --- | --- | --- |
| `all` | Melma grigia | — | — | Elementale del fuoco, Elementale dell'acqua, Elementale dell'aria, Elementale della terra | Djinni | Drago di rame adulto, Drago di rame antico, Tarrasque |
| `battleground` | — | Fuoco fatuo | Cavaliere rinnegato, Fantasma, Veterano | Wraith | — | — |
| `belleholmIsland` | Arbusto Maligno, Avvoltoio, Coccodrillo, Iena, Pantera, Vespa gigante | Drago di rame cucciolo, Hobgoblin, Merrow, Serpente stritolatore gigante | Basilisco, Drago rosso cucciolo, Licantropo pipistrello, Segugio infernale | Drago di rame giovane, Viverna | Drago rosso giovane, Idra | Drago rosso adulto, Drago rosso antico |
| `belleholmLake` | Coccodrillo | Merrow | Chuul | Cumulo strisciante | Idra | — |
| `city` | Cultista, Picchiatore | Cultista fanatico, Ghoul, Licantropo ratto, Mimic, Quasit, Sacerdote corrotto | Demone d'ombra, Doppelganger, Licantropo lupo, Megera verde, Progenie vampirica, Veterano | Gladiatore, Mago rinnegato | Assassino, Vampiro | — |
| `delants` | Squalo tropicale | Merrow | — | — | Aboleth, Lung Wang giovane, Megalodonte, Piovra gigante | Lung Wang adulto, Lung Wang anziano |
| `demonicPortal` | — | Imp, Quasit | Demone d'ombra | — | Hezrou | Goristro |
| `desert` | Avvoltoio, Combattente tribale, Iena | — | Basilisco, Drago blu cucciolo, Licantropo tigre | Squalo di sabbia | Drago blu giovane | Drago blu adulto, Drago blu antico |
| `drusteaPlains` | Arbusto Maligno, Bandito, Formiche giganti assassine, Goblin, Worg | Ankheg, Aquila gigante, Capo dei Banditi, Ippogrifo | Cavaliere rinnegato | Bulette, Troll | — | — |
| `farNorth` | Combattente tribale, Lupo, Orco | Berserker, Ogre, Orog capo orco | Cinghiale gigante, Lupo invernale, Orso grigio, Yeti | Licantropo orso | — | — |
| `forest` | Bandito, Cinghiale, Combattente tribale, Lupo, Worg | Alce, Ankheg, Bugbear, Capo dei Banditi, Driade | Belva distorcente, Licantropo cinghiale, Licantropo lupo, Megera verde, Orsogufo | — | Treant | — |
| `glounet` | Goblin, Scheletro, Sciamano goblin | Bugbear, Cane della morte, Capo goblin, Ghoul, Hobgoblin | Belva distorcente, Capitano hobgoblin, Licantropo pipistrello | Chimera, Wraith | Drago d'ombra giovane | Demilich, Dracolich adulto, Lich, Orgeal il Re lich, Urvinass il non-morto |
| `graveyard` | Cultista, Scheletro | Cultista fanatico, Ghoul, Sacerdote corrotto | Banshee, Fantasma | Wraith | — | Artropal, Demilich, Lich |
| `harkenIsland` | Orco, Scheletro | Berserker, Ogre, Orog capo orco | Cinghiale gigante, Lupo invernale, Orso grigio | Chimera, Licantropo orso | — | — |
| `hills` | Arbusto Maligno, Bandito, Combattente tribale, Formiche giganti assassine, Worg | Aquila gigante, Berserker, Bugbear, Capo dei Banditi, Drago d'argento cucciolo, Hobgoblin | Capitano hobgoblin, Manticora, Orso grigio | Bulette, Gigante delle colline, Troll | Drago d'argento giovane | Drago d'argento adulto, Drago d'argento antico |
| `ladows` | Squalo tropicale | Merrow | — | — | Aboleth, Lung Wang giovane, Piovra gigante | Kraken, Lung Wang adulto, Lung Wang anziano |
| `liberiaIsland` | Arbusto Maligno, Squalo tropicale | Ankheg, Merrow | — | — | — | — |
| `minnelyForest` | Cinghiale, Lupo | Alce, Driade, Pegaso | Banshee, Orsogufo | — | Treant | — |
| `mountainLamstone` | Goblin, Lupo, Sciamano goblin, Worg | Aquila gigante, Arpia, Capo goblin, Drago d'argento cucciolo, Gargoyle | Lupo invernale, Manticora | Gigante delle colline | Drago d'argento giovane | Drago d'argento adulto, Drago d'argento antico |
| `mountainTemistos` | Goblin, Lupo, Worg | Aquila gigante, Arpia, Gargoyle, Grifone, Ippogrifo | Manticora | Bulette, Viverna | — | — |
| `oasis` | Avvoltoio, Vespa gigante | — | Licantropo tigre | — | — | — |
| `ruins` | Cultista, Scheletro | Cultista fanatico, Gargoyle, Mimic, Nothic | Minotauro | Golem di carne, Mago rinnegato | Arcimago, Golem d'argilla, Golem di pietra | Artropal, Golem di ferro, Lich |
| `swamp` | Coccodrillo | Fauce gorgogliante, Fuoco fatuo | Chuul, Megera verde | Cumulo strisciante, Slaad blu, Slaad rosso | Aboleth, Slaad della morte, Slaad grigio, Slaad verde | — |
| `temistosLake` | Coccodrillo | — | Chuul | — | Idra | — |
| `undergroundLamstone` | Goblin, Miconide adulto, Sciamano goblin | Capo goblin, Ettercap, Grick, Miconide sovrano, Nothic | Minotauro, Progenie vampirica, Ragno fase | Umber hulk | Aboleth, Beholder, Drago d'ombra giovane, Fomorian, Hezrou, Manto assassino, Vampiro | Drago d'ombra adulto, Drago d'ombra anziano |
| `undergroundTemistos` | Goblin, Miconide adulto | Ettercap, Grick, Miconide sovrano, Nothic | Progenie vampirica, Ragno fase | Umber hulk | Aboleth, Drago d'ombra giovane, Idra, Manto assassino, Vampiro | Drago d'ombra adulto, Drago d'ombra anziano |
| `valanPlains` | Arbusto Maligno, Bandito, Cavallo da guerra, Cavallo leggero, Formiche giganti assassine, Goblin, Iena, Vespa gigante, Worg | Ankheg, Aquila gigante, Capo dei Banditi, Grifone, Hobgoblin, Ippogrifo, Tigre | Capitano hobgoblin, Cavaliere rinnegato | Troll | — | — |
| `vulcano` | — | Drago di rame cucciolo | Drago rosso cucciolo, Segugio infernale | Drago di rame giovane | Drago rosso giovane | Drago rosso adulto, Drago rosso antico |

### Leggendari (fascia `legend`, Phase 13)

Mai in vendita né in hunt/dungeon generate in questa fase: sono i boss della Phase 13. `xp` = PE × `xpScale`, `lifePoints` = PF × 100, danni per round × 100 (D-11, D-12).

| Nome | Categoria | PE | `xp` | `lifePoints` | Danni | `locations` |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Tarrasque | legendary | 155000 | 21831 | 67600 | blunt 2400, cut 5600, pierce 6800 | all |
| Kraken | legendary | 50000 | 7042 | 47200 | blunt 6000 | ladows |
| Artropal | legendary | 155000 | 21831 | 29300 | cold 2170 | graveyard, ruins |
| Goristro | legendary | 18000 | 2535 | 20800 | blunt 1650, cut 8580 | demonicPortal |
| Dracolich adulto | legendary | 18000 | 2535 | 25600 | cut 3000, pierce 1900, fire 700 | glounet |
| Drago d'ombra adulto | legendary | 38400 | 5408 | 37400 | cut 4380, pierce 2774, necrotic 1022 | undergroundLamstone, undergroundTemistos |
| Drago d'ombra anziano | legendary | 204800 | 28845 | 99400 | cut 6188, pierce 3822, necrotic 2548 | undergroundLamstone, undergroundTemistos |
| Drago rosso adulto | legendary | 18000 | 2535 | 25600 | cut 3000, pierce 1900, fire 700 | vulcano, belleholmIsland |
| Drago blu adulto | legendary | 15000 | 2113 | 22500 | cut 2800, pierce 1800, lightning 500 | desert |
| Drago d'argento adulto | legendary | 15000 | 2113 | 24300 | cut 3000, pierce 1900 | mountainLamstone, hills |
| Drago di rame adulto | legendary | 11000 | 1549 | 18400 | cut 2600, pierce 1700 | all |
| Drago rosso antico | legendary | 62000 | 8732 | 54600 | cut 3400, pierce 2100, fire 1400 | vulcano, belleholmIsland |
| Drago blu antico | legendary | 50000 | 7042 | 48100 | cut 3200, pierce 2000, lightning 1100 | desert |
| Drago d'argento antico | legendary | 50000 | 7042 | 48700 | cut 3400, pierce 2100 | mountainLamstone, hills |
| Drago di rame antico | legendary | 33000 | 4648 | 35000 | cut 3000, pierce 1900 | all |
| Urvinass il non-morto | legendary | 155000 | 21831 | 75000 | cut 8790, pierce 5567, fire 2051 | glounet |
| Lung Wang adulto | legendary | 18000 | 2535 | 34100 | cut 3200, pierce 2600 | ladows, delants |
| Lung Wang anziano | legendary | 41000 | 5775 | 51500 | cut 4832, pierce 3926 | ladows, delants |
| Golem di ferro | legendary | 15000 | 2113 | 21000 | blunt 2000, cut 2300 | ruins |
| Lich | legendary | 19200 | 2704 | 13500 | cold 1000 | graveyard, ruins, glounet |
| Demilich | legendary | 24500 | 3451 | 11600 | cold 860 | glounet, graveyard |
| Orgeal il Re lich | legendary | 208000 | 29296 | 33900 | cold 2510 | glounet |

---

## 5. Pet, oggetti unici, cibo e pozioni

### Pet (cavalcature)

Velocità di marcia = 10 × `speedModifier`; HP = PF del bestiario × 100 (il Cavallo da viaggio esportato ha 30 HP, fuori scala: §11).

| Nome | Acquisto | Vendita | `speedModifier` | HP | Danni |
| --- | --- | --- | ---: | ---: | --- |
| Cavallo leggero | 40 ag | 20 ag | 2.5 | 1300 | blunt 800 |
| Cavallo da guerra | 80 ag | 40 ag | 2 | 1900 | blunt 1100 |
| Alce | 30 ag | 15 ag | 2 | 1300 | blunt 800 |
| Cammello del Mar Sabbioso | 35 ag | 17 ag 50 ra | 2 | 1900 | blunt 1100 |
| Worg | 1 oro | 50 ag | 2.5 | 2600 | pierce 1000 |
| Lupo invernale addestrato | 2 oro | 1 oro | 2.5 | 7500 | pierce 1100 |
| Cinghiale gigante da sella | 1 oro 50 ag | 75 ag | 1.5 | 4200 | cut 1000 |
| Tartaruga gigante delle isole | 1 oro | 50 ag | 1.2 | 6300 | cut 1000 |
| Ippogrifo | 3 oro | 1 oro 50 ag | 3 | 1900 | cut 1000, pierce 800 |
| Aquila gigante | 4 oro | 2 oro | 3 | 2600 | pierce 600, cut 1000 |
| Grifone | 6 oro | 3 oro | 3.5 | 5900 | cut 1100, pierce 800 |
| Pegaso | 10 oro | 5 oro | 4 | 5900 | blunt 1100 |
| Cavallo da viaggio | 1 oro | 50 ag | 2 | 30 | — |

### Oggetti unici (`content/equipment/unici.yaml`, 27)

Potenza = somma dei `power` di `damages.base` e `damages.energy`. I 5 oggetti delle figure storiche (Valantar, Drustea, Monteaspro, Faris, il Bardo) sono `legendary` e `sellable: false`, come gli altri 3 leggendari.

| Nome | Slot | Rarità | Acquisto | Potenza | Danni | `addedSpell` | In vendita |
| --- | --- | --- | --- | ---: | --- | --- | --- |
| Asta delle mani scheletriche | weapon | legendary | 8 oro | 10000 | blunt 2500, necrotic 5000, cold 2500 | Piaga Necrotica | no |
| Anello dal volto mutevole | ring | ultrarare | 1 oro 50 ag | 4200 | acid 1000, force 1000, psychic 2200 | Bolla di caos | sì |
| Filo del destino | necklace | rare | 7 ag 50 ra | 2200 | force 1200, psychic 1000 | — | sì |
| Scudo dorato di Aphine | shield | ultrarare | 1 oro 50 ag | 4500 | blunt 1800, cut 1200, pierce 1000, radiant 500 | Aura Radiosa | sì |
| Corazza della fiamma eterna | chestPiece | legendary | 8 oro | 10000 | blunt 3000, fire 3000, radiant 4000 | Piaga Celestiale | no |
| Velo della luna nera | helm | ultrarare | 1 oro 50 ag | 4200 | necrotic 2000, psychic 2200 | Incubo ad occhi aperti | sì |
| Anello della passione | ring | rare | 7 ag 50 ra | 2200 | fire 1000, psychic 1200 | Voce Ammaliante | sì |
| Monocolo di Ixelia | helm | rare | 7 ag 50 ra | 2200 | enhancing 800, psychic 1400 | — | sì |
| Spilla piumata di Iarus | necklace | rare | 7 ag 50 ra | 2200 | psychic 1000, thunder 1200 | — | sì |
| Tiara delle Lacrime della vergine | helm | ultrarare | 1 oro 50 ag | 4300 | blunt 800, cold 2000, radiant 1500 | Barricata di Gelo | sì |
| Spada del lupo grigio | weapon | rare | 7 ag 50 ra | 2300 | cut 1500, pierce 800 | — | sì |
| Martello della Madre | weapon | ultrarare | 1 oro 50 ag | 4300 | blunt 3000, fire 1300 | Pelle di Roccia | sì |
| Anello delle gemme di Bitya | ring | rare | 7 ag 50 ra | 2200 | force 1100, radiant 1100 | — | sì |
| Manto di scaglie prismatiche | chestPiece | rare | 7 ag 50 ra | 2300 | blunt 1000, pierce 800, lightning 500 | Richiamo della fiamma ancestrale | sì |
| Guanti di corteccia di Enayr | gloves | rare | 7 ag 50 ra | 2200 | blunt 1000, poison 700, acid 500 | — | sì |
| Stivali del viandante verde | boots | rare | 7 ag 50 ra | 2300 | blunt 1200, pierce 600, enhancing 500 | Scatto fulmineo | sì |
| Spadone del trono d'ossa | weapon | legendary | 8 oro | 10000 | cut 5000, pierce 2500, necrotic 2500 | — | no |
| Anello dei quattro | ring | ultrarare | 1 oro 50 ag | 4200 | force 1000, lightning 1100, thunder 1100, psychic 1000 | — | sì |
| Lama di Hilword Valantar | weapon | legendary | 8 oro | 10000 | cut 4500, pierce 2000, cold 1500, radiant 2000 | Luce Punente | no |
| Elmo di Wismund Drustea | helm | legendary | 8 oro | 10000 | blunt 4000, cut 3500, pierce 2500 | — | no |
| Guanti runici di Monteaspro | gloves | legendary | 8 oro | 10000 | blunt 4000, fire 3000, force 3000 | Infusione di Fiamma | no |
| Sigillo della Banca Faris | ring | legendary | 8 oro | 10000 | force 4500, psychic 5500 | Maschera Illusoria | no |
| Medaglione del Bardo delle leggende | necklace | legendary | 8 oro | 10000 | psychic 4500, thunder 5500 | Stordimento Sonoro | no |
| Scaglia di drago rosso | chestPiece | ultrarare | 1 oro 50 ag | 4300 | blunt 1000, pierce 800, fire 2500 | Respiro del Drago | sì |
| Cuore di golem | necklace | ultrarare | 1 oro 50 ag | 4300 | blunt 1800, force 2500 | — | sì |
| Zanna di troll | weapon | rare | 7 ag 50 ra | 2200 | cut 700, pierce 1500 | — | sì |
| Occhio di beholder | necklace | ultrarare | 1 oro 50 ag | 4200 | force 1700, psychic 2500 | Controllo Psichico | sì |

### Cibo regionale e pozioni

Minuti di marcia del cibo = `power` × 3 (`food.minutesPerPower`, Phase 14). Fra tutti i 33 cibi del catalogo il massimo è il Pane di Elfo esportato (`power` 200 → 600 minuti, `hunger.yaml`); fra i nuovi la Carne affumicata del Lontano Nord (120 → 360 minuti).

| Nome | File | Effetto | Rarità | Acquisto | `power` | Minuti di marcia |
| --- | --- | --- | --- | --- | ---: | ---: |
| Frutti del Protettore ancestrale | `cibo-regionale.yaml` | hunger | uncommon | 12 ra | 40 | 120 |
| Pesce del Nanfail | `cibo-regionale.yaml` | hunger | common | 15 ra | 50 | 150 |
| Vino di Mirwa | `cibo-regionale.yaml` | hunger | uncommon | 8 ra | 15 | 45 |
| Datteri del Mar Sabbioso | `cibo-regionale.yaml` | hunger | common | 4 ra | 15 | 45 |
| Pane nero di Drustea | `cibo-regionale.yaml` | hunger | common | 10 ra | 40 | 120 |
| Carne affumicata del Lontano Nord | `cibo-regionale.yaml` | hunger | uncommon | 50 ra | 120 | 360 |
| Funghi delle grotte del Lamstone | `cibo-regionale.yaml` | hunger | common | 6 ra | 20 | 60 |
| Frutti tropicali di Belleholm | `cibo-regionale.yaml` | hunger | common | 5 ra | 15 | 45 |
| Formaggio di capra del Temistos | `cibo-regionale.yaml` | hunger | common | 15 ra | 45 | 135 |
| Gallette di bordo di Liberia | `cibo-regionale.yaml` | hunger | common | 30 ra | 80 | 240 |
| Birra delle Fiamme | `cibo-regionale.yaml` | hunger | common | 3 ra | 10 | 30 |
| Miele delle Pianure dei Valan | `cibo-regionale.yaml` | hunger | uncommon | 8 ra | 20 | 60 |
| Tintura del guaritore di campo | `pozioni.yaml` | heal | common | 30 ra | 800 | — |
| Pozione di guarigione | `pozioni.yaml` | heal | common | 60 ra | 1500 | — |
| Pozione di guarigione superiore | `pozioni.yaml` | heal | uncommon | 3 ag | 4000 | — |
| Pozione di guarigione maggiore | `pozioni.yaml` | heal | rare | 15 ag | 10000 | — |
| Pozione di guarigione suprema | `pozioni.yaml` | heal | ultrarare | 3 oro | 25000 | — |
| Elisir dei Protettori | `pozioni.yaml` | heal | legendary | 8 oro | 40000 | — |

---

## 6. Costanti di `content/config.yaml`

Copia del file al 2026-11-02 (i commenti sono quelli del file). L'utente le ritocca; ogni cambio si applica con la ricarica del runbook, e quelli che toccano le quest richiedono prima `npm run content:generate-quests`.

```yaml
# Costanti del contenuto: l'utente le ritocca, ogni cambio si applica con --apply (D-19)
enemy:
  xpScale: 0.14084507        # 50000 / 355000 (D-11): xp = max(1, round(PE × xpScale))
  hpScale: 100               # lifePoints = PF medi × hpScale (D-12)
  damageScale: 100           # danno medio per round × damageScale (D-12)
tiers:                       # D-10: livello del documento → fascia (limite inferiore degli intervalli)
  rookie: [1, 2]
  adventurer: [3, 4]
  paladin: [5, 10]
  mage: [11, 16]
  hero: [17, 20]
mediumPeByLevel: [50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500, 2800, 3200, 3900, 4200, 4900, 5700]
tierMultiplier: { rookie: 1, adventurer: 2, paladin: 5, mage: 12, hero: 25 }
prizes:                      # base in rame e XP, × moltiplicatore della fascia del minTitle (D-19)
  job: { copper: 40, xp: 0 }
  hunt: { copper: 100, xp: 30 }
  guard: { copper: 200, xp: 40 }
  crime: { copper: 300, xp: 40 }
  study: { copper: 0, xp: 60 }
  heal: { copper: 0, xp: 0 }
  dungeon: { copper: 400, xp: 80, randomLootQuantity: 1 }
dungeonLootRarity: { rookie: common, adventurer: uncommon, paladin: rare, mage: ultrarare, hero: legendary }
timeToCompleteHours: { job: 2, hunt: 1, guard: 8, crime: 1, study: 2, heal: 5, dungeon: 3 }
minTitle:                    # D-20
  serviceCity: adventurer
  serviceCapital: paladin
dungeonTierByCitySize: { Village: adventurer, City: paladin, SeaCity: paladin, Capital: mage }
dungeonHeroZones: [glounet, harkenIsland]
dungeonHeroCityTypes: [necrorianCity]   # D-20: la dungeon di questi tipi di città è sempre di fascia hero
hunt: { maxAnimalPe: 200, maxShareOfRegion: 0.5 }
generator: { seed: 11, crimeCityChance: 0.5, studyCityChance: 0.4 }
food: { minutesPerPower: 3 }
```

Lettura: `xp` del nemico = `max(1, round(PE × xpScale))`; premi delle quest = base × `tierMultiplier[minTitle]` (rame normalizzato in `Coins`); la dungeon aggiunge `randomLootQuantity` oggetti della rarità `dungeonLootRarity[fascia]`; `timeToComplete` in ore per tipo; `hunt.maxAnimalPe` limita le prede, `hunt.maxShareOfRegion` la quota di città con hunt per gruppo; `generator.seed` rende stabili i sorteggi.

---

## 7. Correzioni applicate (piano 11-24, `11-24-apply-1.json`)

Tutti i 9 fix di `content/fixes/` sono `applied` alla prima apply e `done` nel verify successivo:

| Fix | Kind | Effetto |
| --- | --- | --- |
| `poi-type-690e4186108dbf02380d4c81` | `normalizePoiTypes` | `belleholmIsand` → `belleholmIsland` |
| `poi-type-690e4186c26625d660983fea` | `normalizePoiTypes` | `ValanPlains` → `valanPlains` |
| `poi-type-690e4186d116ef011e516635` | `normalizePoiTypes` | `BelleholmIsland` → `belleholmIsland` |
| `poi-type-690e4186477fbde00a7c7a79` | `normalizePoiTypes` | `vulcano ` (spazio finale) → `vulcano` |
| `poi-type-690e418698ec3a87c4b7eb55` | `normalizePoiTypes` | `NULLbelleholmIsland` → `belleholmIsland` |
| `poi-type-690e4186a2175881abee5979` | `normalizePoiTypes` | `gounet` → `glounet` |
| `rename-flinas-north-village` | `renameCity` | la città `690961bf952cc57d174677d7` (villaggio del nord) da Flinas a **Kliever** |
| `delete-talmvere-test-quests` | `deleteQuests` | 16 quest di prova di Talmvere cancellate, `pendingQuestsDeleted: 2`, `poiBackLinksCleared: 0`, `questResultsKept: 24` (i risultati storici restano), `aidReferences: []` |
| `lore-unset-unlocked` | `unsetLoreUnlocked` | `unlocked` tolto dalle 12 lore esistenti |

Prima dell'apply l'orchestratore ha liberato la corsia del personaggio archiviato `6ae30a623a20a4350c47eda5` (pending sulla quest di prova `6ada3608b3dad669f2c257cf`). Correzioni ai dati esportati nel piano 11-12 (3 `addedSpell` pendenti, poi ripuntati dall'utente su Barricata di Gelo, Vento Glaciale e Urlo del Berserker; `locations` vuoto dell'Arbusto Maligno, poi pianure, colline e isole) e normalizzazioni Pitfall 3 alla prima apply (12 lore, 4 equipaggiamenti, 4 loot, 1 nemico).

---

## 8. Regola nuova server-side D-31 (`spellDraw`)

- `QuestPrizes.spellDraw: boolean` è un campo **interno** (`@Prop` con default `false`, nessun `@Field`): non è nello SDL e il FE non lo vede.
- La study di Valantar ha `spellDraw: true` e nessun `prizes.spell`. Alla risoluzione dell'esito (`src/quests/outcomes/rewards/quest-rewards.ts`, `drawLearnableSpell` in `outcome-plan.ts`) il server sorteggia una magia fra quelle **non conosciute** dal personaggio con `minXpToLearn ≤ xp` (xp dopo i premi della quest, come `canLearnSpell`). Se nessuna è apprendibile l'esito è senza magia.
- La magia estratta segue il percorso di apprendimento esistente e compare in `QuestResult.spellLearned` come per le quest con `prizes.spell`: per il FE nulla cambia.

---

## 9. Campo additivo D-32, loot consigliato D-33 e job di Talmvere D-34

**`QuestInfos.description: String`** (nullable, additivo): ogni quest fissa ha un annuncio di 1–3 frasi in italiano nella voce di chi l'ha affisso (tempio per le heal, bottegaio per i job, capitano per le guard, committente losco per le crime, studioso per le study, cacciatore o contadino per le hunt, gilda degli esploratori per le dungeon), 3 varianti per tipo con il nome della città o del nemico. Il FE può selezionarlo nel frammento delle quest (`lib/graphql/fragments/quest_fragment.dart`, blocco `infos`) per mostrare l'annuncio: nessuna rottura, i client che non lo chiedono non cambiano. `QuestInfosInput` non è esposto nello SDL.

**`recommendedLoot` (D-33 rivisto):**

- **dungeon (40):** una cura, un cibo (`hunger`) e 2 oggetti da esplorazione, più fino a 2 armi contro le debolezze del mostro entro la rarità della fascia. Sui dati reali solo le 2 dungeon di Necrorian (Drago d'ombra giovane) ricevono armi; le altre 38 hanno cura + cibo + esplorazione.
- **hunt (77):** una cura e **solo armi** (`equipType: weapon`) contro le debolezze della preda, senza ripiego. I `damages` di un pezzo non-arma sono la sua **protezione**, non un attacco, quindi non entrano fra i consigli. Sui dati reali nessuna arma `common` colpisce le debolezze delle prede: tutte le 77 hunt consigliano la sola «Pozione di guarigione».
- **quest di servizio:** `recommendedLoot` vuoto.

La lista di più nemici (`enemies [{ enemy, quantity }]`) e l'algoritmo di esplorazione delle dungeon sono della Phase 13.

**D-34:** il `job` di Talmvere (`INN_CITY_TYPE = 'talmvereVillage'`) è «Un aiuto alla locanda di Talmvere», con l'annuncio nella voce dell'oste (varianti `innJob`); stesso id e stessa chiave `job|marker` del job generato, cambiano solo titolo e descrizione.

---

## 10. Misura D-12 (potenza del catalogo vs `lifePoints`)

Formula del resolver segnaposto (invariato): `winChance = partyPower / (partyPower + lifePoints)`, con `partyPower` = somma dei `power` degli equipaggiamenti indossati e delle magie attive.

**Potenza per rarità** (somma dei `damages` per pezzo): `11-12-stats.json` sul catalogo esportato (145 pezzi) e `--stats` offline sul catalogo finale (172 pezzi, 2026-11-02):

| Rarità | n (11-12) | mediana (11-12) | n (finale) | min | mediana | max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| common | 30 | 300 | 30 | 50 | 300 | 900 |
| uncommon | 28 | 1000 | 28 | 400 | 1000 | 1900 |
| rare | 30 | 2250 | 40 | 300 | 2200 | 3600 |
| ultrarare | 28 | 4275 | 37 | 1000 | 4300 | 8300 |
| legendary | 29 | 10000 | 37 | 4500 | 10000 | 18500 |

**Mediana per slot (11-12):** boots 2100, chestPiece 1775, gloves 1450, greaves 2950, helm 1800, necklace 1000, ring 1000, shield 3250, weapon 2800.

**Magie (`energyDamage.power`):** 11-12 (77) min 50, mediana 800, max 5000; finale (88) min 50, mediana 825, max 5000. Mediana per `useType` (11-12): attack 1500, charm 400, confuse 800, control 750, defense 800, enhance 650, illusion 450, infuse 700.

**Loot:** cura mediana 2000 / max 40000 (11-12), 3000 / 40000 (finale); cibo 21 voci con 15–300 minuti di marcia (11-12), 33 voci con 15–600 minuti (finale).

**`winChance` dei 4 esempi:**

| Scontro | `lifePoints` | Party | `partyPower` (11-12 / finale) | `winChance` (11-12 / finale) |
| --- | ---: | --- | ---: | ---: |
| Lupo | 1100 | rookie, 1 pezzo mediano common | 300 / 300 | 0.21 / 0.21 |
| Troll | 8400 | paladin, 3 pezzi mediani rare | 6750 / 6600 | 0.45 / 0.44 |
| Drago rosso adulto | 25600 | hero, 9 pezzi mediani legendary | 90000 / 90000 | 0.78 / 0.78 |
| Tarrasque | 67600 | 5 legend × 9 pezzi mediani legendary | 450000 / 450000 | 0.87 / 0.87 |

**Conclusione:** la scala ×100 di HP e danni è coerente in ordine di grandezza con il catalogo; gli scontri rookie col solo equipaggiamento common sono duri (21 %), quelli eroici e leggendari facili col catalogo legendary (mediana 10000, ben sopra la stima di 1800 della ricerca). Il **resolver resta invariato**: la calibrazione è del motore di combattimento dell'utente (Phase 13).

---

## 11. Note per le fasi successive

- **Phase 12 (prune del catalogo, review sync ME-04):** `--prune` ammette solo `quests` e `lore`; per `spells`, `equipmentitems`, `lootitems`, `enemies` e `pets` servono prima le guardie sui riferimenti dei personaggi (`assets.ownedEquipments`/`ownedLoot`, slot di `assets.equipment`, `assets.pet`, `activeSpells.spell`, `status.spells`) e delle quest non fisse (`infos.enemy`, `recommendedLoot`): gli id ancora referenziati vanno in `blocked` con personaggio e campo, come per le quest. Solo allora si riapre `PRUNABLE_COLLECTIONS` (`src/content/sync/content-prune.ts`).
- **Phase 12 (negozi):** taglia e regno si deducono dal `CityType`: suffisso `Capital`/`City`/`SeaCity`/`Village` → taglia (`citySizeOf`, `dungeonSizeKeyOf`), prefisso → regno; le lore `state` di `content/lore/regni.yaml` elencano nel commento i `CityType` di ogni regno (per esempio il Regno di Drustea comprende anche `elfCapital` e `talmvereVillage`, la Repubblica dei Valan `desertVillage`, l'Unione delle Fiamme `tropicalVillage`, il Regno della Madre `mountainVillage` e `aarakocraVillage`; `forestVillage` e `northVillage` restano fuori dai regni). I pool dei negozi si leggono dai file (`content/equipment`, `content/loot`, `content/pets`); i `legendary` non sono **mai in vendita** (`sellable: false` sui leggendari unici). Prezzi da rivedere: cavalli (§5).
- **Phase 13 (quest generate e boss):** nemici per zona e fascia dalla tabella del §4 (`locations` × fascia); i 22 leggendari sono i boss della fascia `legend`; dimensione del party dei boss con la formula del documento di world building («Come calcolare il numero persone», riga 1090: PE del boss / media per titolo); le bande di briganti = N × Bandito (`6ae80bf6947d6a423521c70d`) nella lista `enemies` che la Phase 13 aggiunge alle dungeon; le quest generate **escludono il marker della città**, dove stanno le quest di servizio (D-21). Da calibrare: Beholder e Goristro ereditano i danni degli analoghi, Lich e Demilich sono fragili (13500 e 11600 HP), Hobgoblin a 200 PE, Slaad della morte assente dal documento; Goblin/Hobgoblin sono `monster` in `mostri-c.yaml` mentre i goblinoidi di `umani.yaml` sono `humanoid`; titolo doppio «Dungeon: Drago d'ombra giovane presso Necrorian» (`6ae80db9da5c5f8cc552680c`, unico warning di `--check`); 38 dungeon su 40 e tutte le hunt senza armi consigliate (dati dei nemici).
- **Phase 14 (cibo e marcia):** `power` del cibo tarato su 1 power = 3 minuti di marcia (`food.minutesPerPower`); i cibi nuovi vanno da 30 a 360 minuti, il Pane di Elfo esportato arriva a 600 (§5).
- **Phase 16 (conoscenza):** le lore `city`, `region` e `state` collegate (ogni città → sua lore → regno e regione via `relatedLore`) sono l'insieme iniziale della conoscenza per personaggio; le study senza magia servono allo sblocco casuale delle lore; `Lore.unlocked` non esiste più a livello globale.
- **Rigenerare le quest sposta hunt e dungeon (review app ME-01, rinviata alla Phase 13):** i sorteggi del generatore (tiri crime/study per città, shuffle delle hunt per gruppo, animale e POI della hunt, mostro e `randomLoot` della dungeon) consumano un unico flusso col seme fisso, in un ordine che dipende dall'intero mondo. Aggiungere un animale, una città o un oggetto di una rarità prima assente e rilanciare `content:generate-quests` cambia le hunt dei gruppi successivi (POI diversi → id nuovi, quelle vecchie orfane) e il nemico, il `minTitle` e il `randomLoot` di dungeon con lo stesso id: una quest già accettata da un personaggio combatterebbe contro un nemico diverso da quello mostrato. Prima di una rigenerazione con giocatori attivi va pianificato un `--prune quests` esplicito; la Phase 13 deriva ogni sorteggio da un flusso legato alla sua chiave (`keyedChance`, come le descrizioni D-32) con un test di località.
- **Gruppi di una sola città senza hunt (review app LO-02, decisione dell'utente in sospeso):** `Math.floor(città × hunt.maxShareOfRegion)` vale 0 per i gruppi regionali di una sola città: Ko Shaeras (`elfCapital`), Talmvere (`talmvereVillage`) e Ferrion (`ferrionCity`) non hanno una hunt. Le alternative sono almeno una hunt per gruppo o accorpare i tipi speciali al regno geografico; fino alla decisione resta così.
- **Pet:** i 12 nuovi hanno HP = PF × 100 (1300–7500) mentre il Cavallo da viaggio esportato ha 30 HP; prezzi dei cavalli da rivedere con l'utente.

---

## 12. Ricarica

Sequenza completa (backup → `--verify` → `--dry-run` → `--apply` → `--verify` → seconda `--apply`), ricariche dopo modifiche ai file, immagini, ambiente separato, prune, rollback e codici d'uscita: **`docs/runbooks/content-seeding.md`**. Il formato dei file è in `content/README.md`.
