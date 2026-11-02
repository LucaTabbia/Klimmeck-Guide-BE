# Contenuti del mondo di Klimmeck

## Cos'è

Questa cartella è la **fonte di verità del catalogo di gioco**: lore, magie, equipaggiamento, loot, nemici, pet, quest fisse e correzioni ai dati del mondo. I file YAML vengono letti, controllati e caricati sul database dal CLI `src/content/run-content.ts` (compilato in `dist/content/run-content.js`). Il catalogo già presente a DB è stato esportato qui una volta con i suoi id (D-04); da quel momento ogni aggiunta o modifica si fa nei file e si applica col CLI, mai a mano sul database.

`content/` sta alla radice del repo, fuori da `src/`: non viene compilato e non contiene codice. Il codice che lo legge sta in `src/content/`.

## Struttura

| Percorso | Contenuto |
| --- | --- |
| `lore/` | schede di lore, un file per tema (`culti.yaml`, `regni.yaml`, `regioni.yaml`, `citta-<regno>.yaml`, …) |
| `spells/` | magie |
| `equipment/` | equipaggiamento (`itemType: EquipmentItem`) |
| `loot/` | consumabili e materiali (`itemType: LootItem`) |
| `enemies/` | nemici (`mostri.yaml`, `animali.yaml`, `leggendari.yaml`, `umani.yaml`, …) |
| `pets/` | animali da compagnia e cavalcature |
| `quests/` | quest fisse per regno, **generate** da `content:generate-quests` (non si scrivono a mano) |
| `fixes/` | correzioni puntuali ai documenti esistenti (tipi dei POI, rinomine, quest di prova da cancellare) |
| `world/cities.yaml` | snapshot **di sola lettura** di città e POI, scritto da `--export`: serve ai controlli offline |
| `config.yaml` | costanti ritoccabili (scale dei nemici, fasce, premi, tempi, seme del generatore) |
| `images.yaml` | `id → URL Cloudinary` di lore, nemici e pet, compilato dopo il caricamento delle immagini (D-24) |

Ogni file è una **lista di voci** (`- id: …`). File da 20–40 voci, salvo le quest generate. I file si leggono in ordine alfabetico; solo l'estensione `.yaml` conta.

## Identità

- Ogni voce ha un `id` di 24 caratteri esadecimali minuscoli **fra apici singoli**: `id: '6a1f0c2e9b3d4e5f6a7b8c90'`. Senza apici YAML può leggerlo come numero e la voce viene rifiutata.
- Gli id nuovi si generano **solo** col CLI, mai inventati a mano:
  - `npm run content:new-id -- 30`
  - oppure `node dist/content/run-content.js --new-id 30`

  Stampa 30 righe `- '<hex>'` da copiare nei file.
- Ogni riferimento a un'altra voce è un id fra apici con il nome come commento YAML, per la revisione umana: `- '6a1f0c2e9b3d4e5f6a7b8c91' # Lupo`. I commenti non sono dati.
- Gli id sono unici in **tutto** il contenuto, anche fra collezioni diverse.
- I nomi possono ripetersi fra tipi diversi (la lore «Lupo» di tipo `animal` e il nemico «Lupo»); due voci con lo stesso nome nello stesso `(collezione, tipo)` sono un warning.

## Formato delle voci

Le chiavi si scrivono nell'ordine qui sotto; `?` = facoltativa. I campi marcati **SOLO FILE** non vengono scritti a DB così come sono: il caricatore li usa per derivare altri campi o per collegare documenti.

```yaml
# lore
- id: '<hex>'
  type: city            # LoreType
  name: Talmvere
  description: |-
    …
  image: null           # ? URL Cloudinary o null (default null)
  relatedLore: []       # ? id di lore (default [])
  city: '<hex>' # Talmvere   ? SOLO FILE, solo per type city: id della città dello snapshot
# spells
- { id, name, description, useType, energyDamage: { type, power }, requiredLearnTime, minXpToLearn, recoveryTime, maxUsages }
# equipment (itemType sempre 'EquipmentItem')
- { id, name, itemType, description, sellPrice: Coins|null, buyPrice: Coins|null, rarity, equipType, addedSpell: '<hex>'|null, damages: { base: [{ type, power }], energy: [{ type, power }] }, sellable?: bool }
# loot (itemType sempre 'LootItem')
- { id, name, itemType, description, sellPrice, buyPrice, rarity, power, effect, sellable?: bool }
# enemies
- id: '<hex>'
  name: Lupo
  category: animal      # SOLO FILE: monster | animal | legendary | humanoid
  tier: rookie          # ? SOLO FILE: override della fascia derivata
  source:               # ? SOLO FILE (obbligatorio se mancano xp/lifePoints/damages)
    level: 1            # ? 1..20, dal documento; assente → da mediumPeByLevel
    pe: 50              # intero ≥ 1
    pf: 11              # PF medi > 0
    damagePerRound: { pierce: 7 }   # chiavi DamageType o EnergyType (no enhancing), valori > 0
    analog: { name: Lupo, pe: 50, factor: 1 }   # ? per le voci NON TROVATO
  locations: [forest, hills]   # PoiType, almeno 1
  energyWeaknesses: []  # EnergyType senza enhancing
  baseWeaknesses: []    # DamageType
  relatedLore: []       # id di lore
  spells: []            # id di magie (copiate intere a DB, Pitfall 8)
  imagePath: assets/images/lupo.png
  xp: 7                 # ? override intero ≥ 1
  lifePoints: 1100      # ? override intero ≥ 1
  damages: { base: [], energy: [] }   # ? override
# pets
- { id, name, damages, buyPrice: Coins, sellPrice: Coins, xp, maxXp, currentLifePoints, maxLifePoints, imagePath, speedModifier: number>0|null }
# quests (generate dal piano 11-23)
- id: '<hex>'
  city: '<hex>' # Talmvere          SOLO FILE: città della quest
  infos:
    title: Cure al tempio di Talmvere
    description: |-                # ? testo dell'annuncio, 1–3 frasi (D-32); generato
      Il tempio di Talmvere apre le sue porte ai viandanti stanchi e ai combattenti feriti.
    type: heal                      # hunt|dungeon|heal|job|study|crime|guard
    enemy: null                     # id nemico (hunt/dungeon) o null
    markerLocation: '<hex>'         # POI dello snapshot
    relatedLore: ['<hex>']
    timeToComplete: 3600000         # ? override in ms (default dal config)
  requirements:
    minTitle: rookie                # TitleType senza legend
    recommendedLoot: []             # [{ itemType, item, quantity ≥ 1 }]
  prizes:
    randomLoot: []                  # [{ itemType, item, quantity ≥ 1 }]
    prizeItem: null                 # ?
    spell: null                     # ? id magia
    spellDraw: false                # ? D-31
    prizeCoins: { gold, silver, copper }   # ? override
    xpPrize: 120                    # ? override
# fixes
- { key: <stringa unica>, kind: normalizePoiTypes, target: '<hex>', replacements: { <valore sporco>: <PoiType> } }
- { key, kind: renameCity, target: '<hex>', from: Flinas, to: Kliever }
- { key, kind: deleteQuests, ids: ['<hex>', …] }
- { key, kind: unsetLoreUnlocked }
# world/cities.yaml (snapshot di sola lettura)
- { id, name, type, markerLocation: '<hex>', relatedLore: '<hex>'|null, pointsOfInterest: [{ id, type: [string], location: [lng, lat] }] }
# images.yaml
lore: [{ id, url }]   enemies: [{ id, url }]   pets: [{ id, url }]   # url ^https://res\.cloudinary\.com/
```

Campi **SOLO FILE** in sintesi:

| Collezione | Campo | Uso |
| --- | --- | --- |
| lore | `city` | il caricatore scrive `City.relatedLore` della città indicata; ammesso solo su `type: city` |
| enemies | `category` | regole delle quest (hunt solo `animal`, dungeon solo `monster`) e fascia `legend` dei leggendari |
| enemies | `tier` | override della fascia derivata |
| enemies | `source` | dati della fonte da cui derivano `xp`, `lifePoints`, `damages` e la fascia |
| quests | `city` | città a cui appartiene la quest (controllo del marker e delle regole per città) |
| quests | `prizes.spellDraw` | interno, non esposto in GraphQL: la study di Valantar sorteggia la magia (D-31) |

Chiavi sconosciute, refusi compresi, sono errori. `Lore.unlocked` non esiste più (D-25).

## Regole derivate

### Nemici

Il caricatore calcola i campi di gioco dal blocco `source` e da `config.yaml`; un valore esplicito nel file (`xp`, `lifePoints`, `damages`, `tier`) vince sempre.

- `xp = max(1, round(PE × enemy.xpScale))`.
- `lifePoints = round(PF × enemy.hpScale)` (PF medi del bestiario).
- `damages`: danno medio per round per tipo × `enemy.damageScale`. Con `multiattacco` il danno per round è la **somma** degli attacchi elencati; senza, l'attacco singolo con il danno medio più alto. Esclusi gli attacchi «(Ricarica …)», le azioni leggendarie e gli incantesimi. I tipi base vanno in `damages.base` (ordine `blunt`, `cut`, `pierce`), le energie in `damages.energy` (ordine di `EnergyType`).
- **Fascia** (D-10): `tier` esplicito se c'è; altrimenti `category: legendary` → `legend`; altrimenti il livello `source.level` del documento, o in sua assenza il livello più alto `L` con `mediumPeByLevel[L] ≤ PE` (colonna «Medio», minimo 1), convertito in fascia con `tiers` del config. Senza `source` né `tier` la voce non ha fascia.
- **Voci NON TROVATO** nel bestiario: si prendono le statistiche dell'analogo e si scalano col fattore `f = (PE_documento / PE_analogo)^0.5`, arrotondato a 2 decimali: `pf = round(pf_analogo × f)`, ogni danno per round × `f`. Il fattore si scrive in `source.analog.factor` (insieme a `name` e `pe` dell'analogo). XP e fascia vengono sempre dai PE del documento.

### Quest

Premi e tempi **non** si scrivono nei file: il caricatore li calcola da `config.yaml` (tabella `prizes` × `tierMultiplier` della fascia del `minTitle`, `timeToCompleteHours`, `dungeonLootRarity`). Così basta ritoccare il config e ricaricare (D-19). Gli override `prizeCoins`, `xpPrize`, `timeToComplete` restano possibili.

## Regole delle quest fisse

`content:check` le controlla tutte, anche sulle voci scritte a mano. Ogni violazione è un errore con file, riga e id della voce.

- **Necrorian** (`necrorianCity`): solo `dungeon` (D-17).
- **Ferrion** (`ferrionCity`): mai `crime` (D-17).
- **Quest di servizio** (`heal`, `job`, `guard`, `crime`, `study`): `markerLocation` = il `markerLocation` della città, `enemy: null` (D-21).
- **hunt**: nemico con `category: animal` e PE di `source` ≤ `hunt.maxAnimalPe` (200); `minTitle: rookie`; marker su un POI della città diverso dal marker della città e senza il tipo `dungeon` (D-18, D-21).
- **dungeon**: nemico con `category: monster`; marker su un POI con `dungeon` fra i tipi (D-20).
- `hunt` e `dungeon` hanno sempre un nemico.
- `prizes.spellDraw: true` solo sulla `study` della città di nome `Valantar`, e **al massimo una** voce in tutto il contenuto (D-31).
- `prizes.spell` solo su una `study`.
- Al massimo **una quest fissa per POI** diverso dal marker di una città; sul marker della città lo stesso tipo di quest non si ripete (D-21).
- Il `markerLocation` di una quest è un POI della **sua** città.
- Ogni quest generata ha `infos.description` nella voce di chi ha affisso l'annuncio, variante scelta col seme e la chiave della quest (D-32).
- `recommendedLoot`: dungeon = fino a 2 armi contro le debolezze + la cura e il cibo migliori + 2 oggetti da esplorazione; hunt = un'arma contro le debolezze (in mancanza, l'equipaggiamento con più danni in totale) + la cura migliore; sempre entro la rarità della fascia del `minTitle` (D-33). La lista di più nemici delle dungeon arriva con la Phase 13.

Gli altri controlli offline:

- schema di ogni voce (enum, campi obbligatori, interi, chiavi sconosciute) (D-28);
- id doppi, nella stessa collezione o fra collezioni diverse;
- riferimenti pendenti: `relatedLore` → lore; `city` → città dello snapshot; `spells`/`addedSpell`/`prizes.spell` → magie; `infos.enemy` → nemici; `infos.markerLocation` → POI della città; `recommendedLoot`/`randomLoot`/`prizeItem` → la collezione dettata da `itemType` (`EquipmentItem` → equipment, `LootItem` → loot: un id del loot con `itemType: EquipmentItem` è un errore); `images.yaml` → voce della sezione omonima;
- senza `world/cities.yaml` ogni riferimento a una città è un errore («snapshot world/cities.yaml mancante»);
- due lore `city` per la stessa città: errore; una città dello snapshot senza lore: warning `città senza lore: <nome> (<CityType>)` (D-23);
- nomi doppi nello stesso `(collezione, tipo)`: warning (D-02);
- prosa che finisce con un a capo: errore.

## Comandi

Gli script npm arrivano col CLI; prima di usarli `npm run build` (il CLI gira da `dist/`).

| Comando | Cosa fa | Database |
| --- | --- | --- |
| `npm run content:check` | tutti i controlli offline di questo README; esce 0 senza errori | nessuno |
| `npm run content:new-id -- <N>` | stampa N id nuovi fra apici | nessuno |
| `npm run content:dry-run` | calcola cosa inserirebbe, modificherebbe o lascerebbe com'è, senza scrivere | sola lettura |
| `npm run content:verify` | controlli offline + confronto col database (differenze, orfani) | sola lettura |
| `npm run content:apply` | scrive inserimenti, modifiche e fix; **non cancella mai** | scrittura |
| `node --env-file=.env dist/content/run-content.js --apply --prune <collezione>` | in più cancella gli orfani di quella collezione | scrittura |
| `node --env-file=.env dist/content/run-content.js --export <dir>` | esporta il catalogo e lo snapshot del mondo in file | sola lettura |
| `npm run content:generate-quests` | rigenera `quests/*.yaml` dal mondo e dal catalogo (seme fisso, id stabili) | nessuno |

**Prima di ogni `--apply` serve un backup del database con `mongodump`.** `--apply` è idempotente (una seconda esecuzione riporta zero modifiche) ma non ha un annullamento: il ripristino è il dump. La sequenza completa è nel runbook `docs/runbooks/content-seeding.md`.

Il CLI legge la connessione dal file `.env` passato a Node (`--env-file`); il file non va mai stampato né copiato nei report.

## Prosa

I testi lunghi si scrivono nei blocchi `|-`, **mai** `|`: lo scalare `|` aggiunge un a capo finale che finirebbe nel database ed è un errore di `content:check`.

```yaml
  description: |-
    Una regione di colline e boschi.
    Nessun viaggiatore vi si perde.
```

Testi in italiano, dal sapore del documento di world building, riassunti in 2–6 frasi per voce senza copiare paragrafi interi.
