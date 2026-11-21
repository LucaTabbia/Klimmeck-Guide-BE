# BACKEND-NOTES — Phase 25 Storie dei partecipanti e ferite dell'oste (handoff per la FE Phase 24 e per l'orchestratore)

- **Fase BE:** 25-storie-dei-partecipanti-e-ferite-dell-oste (requisiti BE-WOUND-01..06 e BE-STORY-01..06; decisioni D-01..D-17 di `25-CONTEXT.md`, numerazione condivisa col CONTEXT della FE Phase 24, che è autorevole; nomi e ruling in `25-REPO-RULES.md`). **Companion:** FE Phase 24 «Participants' Stories and Innkeeper Wounds», ramo FE `feat/24-participants-stories-and-innkeeper-wounds`.
- **Data:** 2026-11-21. Scritto dopo il gate 25-13 (`25-13-SUMMARY.md`), sulla HEAD del ramo più i soli commit di documentazione.
- **Branch:** `feat/25-storie-dei-partecipanti-e-ferite-dell-oste`, da `develop`; base dei diff `e87339bb`. PR verso `develop` a cura dell'orchestratore (§7).
- **Gate 25-13:** `npx tsc --noEmit` 0; unit 313 suite / 4 701 test; integration 163 suite / 2 692 test in sei blocchi `--runInBand` (`src/quests/outcomes` 17 / 290, `src/quests/guided` 5 / 155, resto di `src/quests` 25 / 484, `src/characters` 30 / 492, `src/travel` 13 / 277, resto 73 / 994); boot reale più matrice authz 2 suite / 238 test, SDL rigenerato identico al committato, **diciotto righe aggiunte e nessuna tolta** dalla base; coverage per cartella `src/quests/acceptance` 99,11 / 92,83 / 99,75 (soglia 97 / 91 / 98); lint mirato pulito su 60 file. **`npm run test:cov` completo: a cura dell'orchestratore.**
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, handler GraphQL nuovo (`test/authz/expected-handlers.ts` senza diff), migratore o file di contenuto: ogni campo nuovo ha un valore neutro (lista vuota, `false`) sui documenti di oggi.
- **Fonte:** nomi, percorsi e titoli dei casi copiati da `src/schema.gql`, dal codice e dai SUMMARY 25-01..25-13. **Il codice vince su questo documento.**

---

## 0. TL;DR per la FE

1. **SDL solo additivo:** diciotto righe aggiunte, nessuna tolta, nessun tipo cambiato, nessun handler nuovo (§1). La FE di oggi continua a funzionare contro il BE nuovo.
2. **Nessuna query nuova per le storie:** l'oste legge il background di ogni partecipante con la `character(id)` di oggi, prima e senza bozza (§2f).
3. **Bozza:** valore nuovo `MissionDraftStep.stories` e sezione `backgroundAdditions` su `MissionDraft` (servita) e su `SaveMissionDraftInput` (salvata, sostituita per intero) (§2g).
4. **`completeGuidedMission(pendingQuestId: ID!): [QuestResult!]!` invariata nella firma:** scrive le storie dalla bozza, nella stessa transazione del completamento (§2h).
5. **`QuestResult.backgroundEntryAdded: Boolean!`:** vero sul foglio del partecipante il cui background ha ricevuto una pagina in quel completamento (§2e).
6. **`CharacterStatus.innkeeperInjuries: [InjuryType!]!`:** le ferite dell'oste del personaggio, sottoinsieme per tipo di `injuries`; nessuna cura le tocca (§2a, §2b).
7. **Correzioni:** `ParticipantOverrideInput.injuriesRemoved` toglie ferite nei due flussi; l'origine è SERVITA dalla bozza (`MissionFightOutcome.innkeeperInjuriesBefore`, `MissionFightEffects.injuriesRemoved`, `MissionFightEffects.innkeeperInjuries`), mai da dedurre (§2c, §2d).
8. **`QuestResult.injuriesRemoved: [InjuryType!]!`:** le ferite tolte dall'oste, sempre valorizzato (lista vuota se nessuna); disegnarlo o no è una scelta della FE. Un togli-e-riaggiungi della stessa ferita non compare né qui né in `injuriesAdded` (§2e).

---

## 1. Diff SDL (verbatim da `src/schema.gql`)

Blocchi interi copiati dal file (ordine alfabetico di `sortSchema`); le righe nuove sono elencate sotto.

```graphql
type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  coins: Coins!
  currentLifePoints: Int!
  guidedMissionInProgress: Boolean!
  imprisonedUntil: DateTime
  injuries: [InjuryType!]!
  innkeeperInjuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  missionInProgress: Boolean!
  potionRecoveryUntil: DateTime
  spellStates: [SpellState!]!
  title: String!
  unlockedLore: [ID!]!
  xp: Int!
}

input ParticipantOverrideInput {
  characterId: ID!
  companionLifeAfter: Int
  consumablesUsed: [ItemUsageInput!]
  hpAfter: Int
  injuries: [InjuryType!]
  injuriesRemoved: [InjuryType!]
  spellsUsed: [SpellUsageInput!]
}

type MissionFightEffects {
  companionLifeAfter: Int
  consumablesUsed: [MissionItemUsage!]!
  hpAfter: Int!
  injuriesAdded: [InjuryType!]!
  injuriesRemoved: [InjuryType!]!
  innkeeperInjuries: [InjuryType!]!
  spellsUsed: [MissionSpellUsage!]!
}

type MissionFightOutcome {
  character: ID!
  companion: MissionCompanion
  consumablesAvailable: [MissionItemUsage!]!
  corrected: MissionFightEffects
  hpBefore: Int!
  injuriesBefore: [InjuryType!]!
  innkeeperInjuriesBefore: [InjuryType!]!
  simulated: MissionFightEffects
  spellsAvailable: [MissionSpellUsage!]!
}

enum MissionDraftStep {
  fights
  prizes
  recap
  stories
  teleport
}

type MissionDraft {
  backgroundAdditions: [MissionBackgroundAddition!]!
  fights: [MissionFight!]!
  id: ID!
  participants: [MissionParticipant!]!
  place: ID
  prizes: [MissionPrize!]!
  quest: ID!
  questType: String!
  startedAt: DateTime!
  step: MissionDraftStep!
  updatedAt: DateTime!
}

type MissionBackgroundAddition {
  character: ID!
  text: String!
}

input SaveMissionDraftInput {
  backgroundAdditions: [MissionBackgroundAdditionInput!]
  fights: [MissionFightInput!]
  pendingQuestId: ID!
  place: ID
  prizes: [MissionPrizeInput!]
  step: MissionDraftStep
}

input MissionBackgroundAdditionInput {
  characterId: ID!
  text: String!
}

type QuestResult {
  acknowledgedAt: DateTime
  ambush: AmbushReport
  arrested: Boolean!
  backgroundEntryAdded: Boolean!
  character: ID!
  coinsLost: Coins
  companion: CompanionOutcome
  consumablesUsed: [AssetQuantity!]!
  enemies: [QuestEnemy!]!
  guardEncounter: Boolean!
  hpAfter: Int!
  hpBefore: Int!
  id: ID!
  injuriesAdded: [InjuryType!]!
  injuriesHealed: [InjuryType!]!
  injuriesRemoved: [InjuryType!]!
  kind: QuestResultKind!
  lastTurn: Int
  lastTurnKind: DungeonTurnKind
  levelAfter: Int!
  levelBefore: Int!
  loreUnlocked: [Lore!]!
  maxLifePoints: Int!
  outcome: QuestOutcome!
  petXpGained: Int!
  quest: QuestResultQuest
  rescuedCharacters: [ID!]!
  resolvedAt: DateTime!
  rewards: QuestRewards!
  spellFound: Spell
  spellLearned: Spell
  spellResearchFailed: Boolean!
  spellsUsed: [SpellUsage!]!
  stagesCleared: Int
  stagesTotal: Int
  titleAfter: String!
  titleBefore: String!
  turnsCompleted: Int
  turnsTotal: Int
  user: ID!
  xpAfter: Int!
  xpBefore: Int!
  xpGained: Int!
}
```

Le diciotto righe aggiunte (`git diff e87339bb -- src/schema.gql`):

| # | Blocco | Riga |
|---|--------|------|
| 1 | `type CharacterStatus` | `innkeeperInjuries: [InjuryType!]!` |
| 2–5 | `type MissionBackgroundAddition` (nuovo) | `type MissionBackgroundAddition {` / `character: ID!` / `text: String!` / `}` |
| 6–9 | `input MissionBackgroundAdditionInput` (nuovo) | `input MissionBackgroundAdditionInput {` / `characterId: ID!` / `text: String!` / `}` |
| 10 | `type MissionDraft` | `backgroundAdditions: [MissionBackgroundAddition!]!` |
| 11 | `enum MissionDraftStep` | `stories` |
| 12 | `type MissionFightEffects` | `injuriesRemoved: [InjuryType!]!` |
| 13 | `type MissionFightEffects` | `innkeeperInjuries: [InjuryType!]!` |
| 14 | `type MissionFightOutcome` | `innkeeperInjuriesBefore: [InjuryType!]!` |
| 15 | `input ParticipantOverrideInput` | `injuriesRemoved: [InjuryType!]` |
| 16 | `type QuestResult` | `backgroundEntryAdded: Boolean!` |
| 17 | `type QuestResult` | `injuriesRemoved: [InjuryType!]!` |
| 18 | `input SaveMissionDraftInput` | `backgroundAdditions: [MissionBackgroundAdditionInput!]` |

**Nessuna riga tolta, nessun handler nuovo.** Attenzione ai due nomi diversi dell'id: `character` sul tipo servito, `characterId` sull'input. Le firme usate negli esempi sono quelle di oggi: `character(id: String!)`, `characterUpdated(id: String!)`, `saveMissionDraft(input: SaveMissionDraftInput!): MissionDraft!`, `completeGuidedMission(pendingQuestId: ID!): [QuestResult!]!`, `completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]!`.

---

## 2. Semantica per area

### (a) Origine delle ferite sul personaggio (D-15, D-16; BE-WOUND-01)

- `CharacterStatus.innkeeperInjuries` è un **sottoinsieme per TIPO** di `injuries`: dice quali ferite portate sono dell'oste. Lista vuota per ogni personaggio di oggi (nessuna migrazione: le ferite già a DB restano normali).
- Servita ovunque esca un `Character`: `character`, `characters`, `me.currentCharacter` e `characterUpdated`. L'evento `characterUpdated` esce **anche quando cambia solo l'origine** e `injuries` resta identica (provato sul filo, §6).
- I malus delle ferite non dipendono dall'origine. Nessun input scrive il campo: `CharacterStatusInput` non lo porta; lo scrivono solo le correzioni dell'oste.
- Il campo è servito **grezzo** (nessun `@ResolveField`): l'invariante «sottoinsieme di `injuries`» è custodita dalle sole scritture del BE (trappola per gli script a DB in §7).

### (b) Cure e «senza effetto» (D-11, D-14; BE-WOUND-02, BE-WOUND-03)

Una sola regola per tutte le vie di cura (`cureInjuries` col terzo argomento):

| Via di cura | Che cosa non tocca |
|-------------|--------------------|
| Quest heal e ogni premio `cure` di una quest vinta | le ferite di `innkeeperInjuries`, con tutte le copie |
| Pozione dal Diario (`useItem`) | idem; la bevuta non scrive mai l'origine |
| Premio guidato `cure` (scelto dall'oste nella bozza) | idem, comprese le ferite inflitte a mano in quella stessa missione |
| Cura del blocco del titolo nel completamento semplice | idem, compresa la ferita inflitta dall'override nello stesso esito |

- `injuriesHealed` (su `QuestResult` e su `UseItemResult`) non elenca **mai** una ferita dell'oste.
- `Quest.noEffect`, il rifiuto `QUEST_NO_EFFECT` di `acceptQuest` e il rifiuto `ITEM_NO_EFFECT` di `useItem` ignorano le ferite dell'oste: una cura che troverebbe solo ferite dell'oste, a vita già al tetto, è senza effetto. Resta «con effetto» appena c'è una ferita normale curabile o vita da recuperare.
- La cura dello stesso esito non guarisce la ferita appena inflitta dall'oste; cura invece una ferita normale aggiunta nello stesso esito.
- **Per la FE:** le righe «Cura le tue ferite: …» e quella della pozione vanno calcolate su `injuries` meno `innkeeperInjuries`.

### (c) Correzioni del completamento semplice (D-12, D-13, D-16; BE-WOUND-04, BE-WOUND-05)

- `completePendingRequest` **resta ed è estesa** (non è più «da rimuovere»): stesso `ParticipantOverrideInput` del flusso guidato.
- `outcomes[].injuries` = ferite aggiunte; **TUTTE dell'oste** (ogni ferita di un override del flusso semplice è inflitta a mano).
- `outcomes[].injuriesRemoved` = ferite tolte, di qualunque origine; assente, `null` o `[]` = nessuna rimozione.
- Stessa ferita in `injuriesRemoved` e in `injuries` = tolta e riaggiunta come ferita dell'oste (D-16).
- Una ferita già portata, elencata in `injuries` e **non** tolta, è **ignorata in silenzio** e conserva la sua origine.
- Rimozione di una ferita che il personaggio non porta (o di un tipo ignoto) → `OUTCOME_OVERRIDE_INVALID`, prima di ogni scrittura.

### (d) Correzioni del flusso guidato e bozza (D-12, D-13, D-16; BE-WOUND-05, BE-WOUND-06)

- `corrections[].injuries` resta «la lista completa delle ferite che lo scontro aggiunge dopo la correzione» (assente = quelle del simulato).
- `corrections[].injuriesRemoved` toglie **solo** ferite di `injuriesBefore` di quello scontro; un'altra → `OUTCOME_OVERRIDE_INVALID`.
- Assente, `null` e `[]` valgono «nessuna rimozione» e la lista vuota esplicita è **accettata**. La correzione è sempre l'effetto completo: rimandarla **senza** una rimozione già salvata **la annulla**.
- Una ferita di `injuriesBefore` può stare in `injuries` solo se è anche in `injuriesRemoved`; altrimenti `OUTCOME_OVERRIDE_INVALID` (qui il guidato è più severo del flusso semplice).
- Ferite dell'oste di uno scontro corretto = aggiunte del corretto **meno** aggiunte del simulato, **più** le tolte-e-riaggiunte. Le ferite simulate lasciate come sono restano normali; uno scontro non corretto non ne ha.
- Che cosa serve la bozza, per scontro e personaggio:
  - `MissionFightOutcome.innkeeperInjuriesBefore`: sottoinsieme di `injuriesBefore`, fotografato alla simulazione; comprende le ferite inflitte a mano in uno scontro precedente della stessa bozza.
  - `corrected.injuriesRemoved`: le rimozioni salvate (seme della correzione riaperta e riga del riepilogo).
  - `corrected.innkeeperInjuries`: quali ferite di `corrected.injuriesAdded` sono dell'oste (derivata, mai salvata).
  - Su `simulated` le due liste nuove sono **sempre vuote**.
- Una correzione che cambia **solo** le rimozioni è una correzione diversa: viene scritta e **azzera gli scontri successivi** (tornano non simulati), come ogni altra correzione.
- Lo scontro successivo parte dallo stato lasciato dal precedente, origine compresa: una ferita tolta al primo scontro non è più in `injuriesBefore` del secondo.
- Le bozze aperte **prima del deploy** rispondono liste vuote sui tre campi; rilanciare lo scontro aggiorna `innkeeperInjuriesBefore`.
- Al completamento le ferite dei vari scontri si piegano **in ordine** (mai un'unione): una ferita aggiunta da uno scontro e tolta da uno successivo non arriva al personaggio.

### (e) Foglio del risultato (BE-WOUND-04, BE-STORY-05)

- `injuriesAdded` = tipi assenti prima e presenti dopo.
- `injuriesRemoved` = tipi presenti prima e tolti dall'oste. Sempre valorizzato; lista vuota sui fogli scritti prima della fase e su ogni via automatica (soccorso, imboscate, esiti senza premio).
- `injuriesHealed` = le sole cure.
- **Un togli-e-riaggiungi della stessa ferita non compare in nessuna delle due liste** (né `injuriesAdded` né `injuriesRemoved`): sul foglio non è successo nulla, l'origine cambiata si legge dal personaggio (`status.innkeeperInjuries`, anche via `characterUpdated`).
- `backgroundEntryAdded` = vero solo sul foglio di un completamento guidato che ha scritto una pagina non vuota nel background di quel partecipante; `false` in ogni altro caso e sui fogli di prima.

### (f) Storie: lettura (D-01, D-02; BE-STORY-01)

- `character(id) { infos { name background } status { title injuries innkeeperInjuries } }` col token dell'oste, per ogni partecipante, **prima e senza bozza**: leggere non crea nulla.
- Gli id dei partecipanti senza bozza vengono da `pendingRequests { character { id } }`.
- `infos.background` è `[String!]!`, voci in ordine d'arrivo, **la più vecchia per prima**. Un altro giocatore riceve `FORBIDDEN`.

### (g) Aggiunte nella bozza (D-05, D-06, D-07; BE-STORY-02, BE-STORY-03)

- Passo `stories` (dopo `recap`): si salva come ogni altro passo.
- Sezione `backgroundAdditions` **assente** (o `null`) = aggiunte salvate invariate; **presente** = sostituisce l'**INTERA** lista (anche con `[]`).
- La FE manda una voce per partecipante, **testi vuoti compresi**: un testo vuoto o di soli spazi è **accettato, mai un errore**, e vuol dire «nessuna aggiunta per quel partecipante» (cade al salvataggio, cancella quella salvata, non viene mai scritta al completamento). Nessun `@IsNotEmpty` sul testo.
- Il testo è salvato dopo `trim`; la bozza serve solo le voci non vuote, già ripulite.
- Tetto: **1000 grafemi** dopo il `trim`, contati come il `maxLength` di Flutter (stessa regola del background della creazione, che resta a 500). Oltre → `BACKGROUND_ADDITION_TOO_LONG`.
- Ordine dei rifiuti al salvataggio: personaggio fuori dalla bozza (`OUTCOME_NOT_PARTICIPANT`) → stesso personaggio due volte (`OUTCOME_OVERRIDE_INVALID`) → tetto (`BACKGROUND_ADDITION_TOO_LONG`). Un rifiuto non scrive nulla (nessuna scrittura parziale).
- Il codice nasce al **salvataggio** e, in difesa, al **completamento** (testo salvato rivalidato).

### (h) Scrittura al completamento (D-05, D-08, D-09, D-10; BE-STORY-04, BE-STORY-05)

- Stessa transazione del completamento: se il completamento è rifiutato nessun background cambia.
- Ogni aggiunta non vuota diventa una voce nuova **in coda** a `infos.background` (un `$push` per partecipante); le voci esistenti non si toccano; nessun confronto coi testi esistenti (un testo uguale a una voce di prima viene aggiunto comunque).
- Nessuna push dedicata. `characterUpdated` del partecipante porta il background nuovo, con la pagina come **ultima** voce (provato sul filo).
- **Solo flusso guidato** (`story`, `worldMission`): `completePendingRequest` non scrive mai un background, nemmeno se la richiesta ha una bozza guidata con aggiunte.

---

## 3. Codici e rifiuti

| Codice | Operazione | Quando | `extensions` |
|--------|------------|--------|--------------|
| `BACKGROUND_ADDITION_TOO_LONG` (**nuovo**) | `saveMissionDraft`, `completeGuidedMission` | un'aggiunta oltre 1000 grafemi dopo il `trim` (al completamento: solo in difesa, su un testo salvato fuori regola) | solo `code` |
| `BAD_USER_INPUT` | `saveMissionDraft` | errore di forma: testo oltre 8000 unità UTF-16, lista delle aggiunte oltre 50 voci, id malformato | forma di oggi |
| `OUTCOME_OVERRIDE_INVALID` | `completePendingRequest`, `saveMissionDraft`, `completeGuidedMission` | rimozione di una ferita non portata; nel guidato, ferita di `injuriesBefore` riaggiunta senza toglierla; stesso personaggio due volte nelle aggiunte | solo `code` |
| `OUTCOME_NOT_PARTICIPANT` | `saveMissionDraft` | aggiunta per un personaggio fuori dalla bozza | solo `code` |
| `QUEST_NO_EFFECT` | `acceptQuest` | invariato nella forma; ora ignora le ferite dell'oste | solo `code` |
| `ITEM_NO_EFFECT` | `useItem` | invariato nella forma; ora ignora le ferite dell'oste | solo `code` |

Messaggio del codice nuovo: «L'aggiunta alla storia può contenere al massimo 1000 caratteri». Esempi: §4.6 (codice nuovo e forma), §4.8 (senza effetto); gli altri due rifiuti hanno la forma di §4.6 col proprio codice.

---

## 4. Esempi

Segnaposto: `<characterId>`, `<otherCharacterId>`, `<pendingQuestId>`, `<questResultId>`, `<enemyId>`, `<questId>`, `<itemId>`. Ferite coi nomi dell'enum `InjuryType`.

### 4.1 Lettura delle storie prima della bozza

```graphql
query ParticipantStory($id: String!) {
  character(id: $id) {
    infos { name background }
    status { title injuries innkeeperInjuries }
  }
}
```

```json
{ "id": "<characterId>" }
```

```json
{
  "data": {
    "character": {
      "infos": { "name": "Brunilde", "background": ["Figlia di un mugnaio.", "Ha lasciato il mulino a sedici anni."] },
      "status": { "title": "adventurer", "injuries": ["deepCut"], "innkeeperInjuries": [] }
    }
  }
}
```

### 4.2 Personaggio del giocatore con una ferita dell'oste

Frammento di `status` in `character` / `me.currentCharacter`:

```json
{ "status": { "injuries": ["deepCut", "fracturedRib"], "innkeeperInjuries": ["fracturedRib"] } }
```

```graphql
subscription OnCharacterUpdated($id: String!) {
  characterUpdated(id: $id) {
    infos { background }
    status { injuries innkeeperInjuries }
  }
}
```

Evento dopo un togli-e-riaggiungi di `deepCut` (variabile `{ "id": "<characterId>" }`; `injuries` identica a prima, cambia solo l'origine):

```json
{ "data": { "characterUpdated": { "infos": { "background": ["Figlia di un mugnaio."] }, "status": { "injuries": ["deepCut"], "innkeeperInjuries": ["deepCut"] } } } }
```

### 4.3 `completePendingRequest` con `injuriesRemoved` e `injuries`

Il personaggio porta `sprain`.

```graphql
mutation CompletePendingRequest($input: CompletePendingRequestInput!) {
  completePendingRequest(input: $input) {
    id character injuriesAdded injuriesRemoved injuriesHealed backgroundEntryAdded
  }
}
```

```json
{
  "input": {
    "pendingQuestId": "<pendingQuestId>",
    "outcomes": [
      { "characterId": "<characterId>", "injuriesRemoved": ["sprain"], "injuries": ["fracturedRib"] }
    ]
  }
}
```

```json
{
  "data": {
    "completePendingRequest": [
      {
        "id": "<questResultId>",
        "character": "<characterId>",
        "injuriesAdded": ["fracturedRib"],
        "injuriesRemoved": ["sprain"],
        "injuriesHealed": [],
        "backgroundEntryAdded": false
      }
    ]
  }
}
```

Dopo: `status.injuries` = `["fracturedRib"]`, `status.innkeeperInjuries` = `["fracturedRib"]`. Con `"injuriesRemoved": ["sprain"], "injuries": ["sprain"]` il foglio avrebbe le due liste vuote e il personaggio `innkeeperInjuries: ["sprain"]`.

### 4.4 `saveMissionDraft` con una correzione che toglie e riaggiunge

Lo scontro 0 è già simulato; il personaggio è entrato con `deepCut` (normale) e la simulazione gli ha dato `sprain`. L'oste rende `deepCut` una ferita sua e lascia `sprain` com'è. I nemici sono quelli dello scontro simulato.

```graphql
mutation SaveMissionDraft($input: SaveMissionDraftInput!) {
  saveMissionDraft(input: $input) {
    step
    fights {
      outcomes {
        character
        injuriesBefore
        innkeeperInjuriesBefore
        simulated { hpAfter injuriesAdded injuriesRemoved innkeeperInjuries }
        corrected { hpAfter injuriesAdded injuriesRemoved innkeeperInjuries }
      }
    }
  }
}
```

```json
{
  "input": {
    "pendingQuestId": "<pendingQuestId>",
    "fights": [
      {
        "enemies": [{ "enemy": "<enemyId>", "quantity": 1 }],
        "corrections": [
          { "characterId": "<characterId>", "injuries": ["sprain", "deepCut"], "injuriesRemoved": ["deepCut"] }
        ]
      }
    ]
  }
}
```

```json
{
  "data": {
    "saveMissionDraft": {
      "step": "fights",
      "fights": [
        {
          "outcomes": [
            {
              "character": "<characterId>",
              "injuriesBefore": ["deepCut"],
              "innkeeperInjuriesBefore": [],
              "simulated": { "hpAfter": 640, "injuriesAdded": ["sprain"], "injuriesRemoved": [], "innkeeperInjuries": [] },
              "corrected": { "hpAfter": 640, "injuriesAdded": ["sprain", "deepCut"], "injuriesRemoved": ["deepCut"], "innkeeperInjuries": ["deepCut"] }
            }
          ]
        }
      ]
    }
  }
}
```

Rimandare la stessa correzione con `"injuriesRemoved": []` (e `"injuries": ["sprain"]`) annulla la rimozione; con `"injuries": ["sprain", "deepCut"]` e senza la rimozione il salvataggio è rifiutato con `OUTCOME_OVERRIDE_INVALID`.

### 4.5 `saveMissionDraft` con `step: stories` e `backgroundAdditions`

```graphql
mutation SaveStories($input: SaveMissionDraftInput!) {
  saveMissionDraft(input: $input) {
    step
    backgroundAdditions { character text }
  }
}
```

```json
{
  "input": {
    "pendingQuestId": "<pendingQuestId>",
    "step": "stories",
    "backgroundAdditions": [
      { "characterId": "<characterId>", "text": "  Ha salvato il mugnaio di Valantar.  " },
      { "characterId": "<otherCharacterId>", "text": "" }
    ]
  }
}
```

```json
{
  "data": {
    "saveMissionDraft": {
      "step": "stories",
      "backgroundAdditions": [
        { "character": "<characterId>", "text": "Ha salvato il mugnaio di Valantar." }
      ]
    }
  }
}
```

### 4.6 Errori: `BACKGROUND_ADDITION_TOO_LONG` e forma

Stessa mutation di §4.5 con un testo di 1001 grafemi (la FE legge solo `extensions.code`):

```json
{
  "errors": [
    {
      "message": "L'aggiunta alla storia può contenere al massimo 1000 caratteri",
      "extensions": { "code": "BACKGROUND_ADDITION_TOO_LONG" }
    }
  ],
  "data": null
}
```

Con un testo oltre 8000 unità UTF-16 la richiesta non arriva al dominio:

```json
{ "errors": [{ "extensions": { "code": "BAD_USER_INPUT" } }], "data": null }
```

In entrambi i casi la bozza resta com'era (le aggiunte salvate non cambiano).

### 4.7 `completeGuidedMission` e il foglio

```graphql
mutation CompleteGuidedMission($pendingQuestId: ID!) {
  completeGuidedMission(pendingQuestId: $pendingQuestId) {
    id character injuriesAdded injuriesRemoved injuriesHealed backgroundEntryAdded
  }
}
```

```json
{ "pendingQuestId": "<pendingQuestId>" }
```

```json
{
  "data": {
    "completeGuidedMission": [
      {
        "id": "<questResultId>",
        "character": "<characterId>",
        "injuriesAdded": ["fracturedRib"],
        "injuriesRemoved": ["deepCut"],
        "injuriesHealed": [],
        "backgroundEntryAdded": true
      },
      {
        "id": "<questResultId>",
        "character": "<otherCharacterId>",
        "injuriesAdded": [],
        "injuriesRemoved": [],
        "injuriesHealed": [],
        "backgroundEntryAdded": false
      }
    ]
  }
}
```

Dopo, per `<characterId>`: `infos.background` = voci di prima più «Ha salvato il mugnaio di Valantar.» in coda; la bozza non esiste più (`missionDraft` risponde `null`).

### 4.8 Heal senza effetto e pozione rifiutata

Personaggio a vita piena con la sola `fracturedRib`, dell'oste; la quest heal cura `fracturedRib`.

```graphql
query Board { quests { id noEffect } }
```

```json
{ "data": { "quests": [{ "id": "<questId>", "noEffect": true }] } }
```

```graphql
mutation Accept($request: AcceptQuestRequest!) {
  acceptQuest(request: $request) { response successful }
}
```

```json
{ "request": { "id": "<characterId>", "questId": "<questId>" } }
```

```json
{ "errors": [{ "message": "Queste cure non ti servirebbero adesso", "extensions": { "code": "QUEST_NO_EFFECT" } }], "data": null }
```

```graphql
mutation UseItem($itemId: ID!) {
  useItem(itemId: $itemId) { hpAfter injuriesHealed quantityLeft }
}
```

```json
{ "itemId": "<itemId>" }
```

```json
{ "errors": [{ "message": "Questa pozione non ti farebbe nulla adesso", "extensions": { "code": "ITEM_NO_EFFECT" } }], "data": null }
```

Sotto il tetto della vita la pozione si beve: `injuriesHealed` non contiene `fracturedRib` e la ferita resta.

### 4.9 Selezioni consigliate per i frammenti della FE

```graphql
# personaggio (character, me.currentCharacter, characterUpdated)
status { injuries innkeeperInjuries }
infos { background }

# bozza (missionDraft, startMissionDraft, simulateMissionFight, saveMissionDraft)
step
backgroundAdditions { character text }
fights {
  outcomes {
    character
    injuriesBefore
    innkeeperInjuriesBefore
    simulated { injuriesAdded injuriesRemoved innkeeperInjuries }
    corrected { injuriesAdded injuriesRemoved innkeeperInjuries }
  }
}

# foglio (questResult, liste dei fogli, subscription del foglio, completeGuidedMission)
injuriesAdded injuriesHealed injuriesRemoved backgroundEntryAdded
```

---

## 5. Finestra FE e compatibilità

### 5.1 Finestra e cautele

- **Tutto additivo:** la FE di oggi continua a funzionare contro il BE nuovo; nessun riavvio coordinato. I piani FE che selezionano i campi nuovi sono gated **SOLO sul merge** di questa fase (e sul riavvio del BE dal ramo per la UAT).
- **Cautela sul valore `stories`:** un client vecchio che riceve `MissionDraft.step: stories` non sa leggerlo. Lo salva solo la FE nuova; una bozza lasciata a quel passo e aperta da un'app vecchia va trattata con la lettura tollerante della FE.
- **D-14 della Phase 22 superata** dalla D-13 emendata: «le ferite di prima non si toccano» non vale più, le correzioni tolgono qualunque ferita presente.
- **`completePendingRequest` non è più «da rimuovere»:** è estesa con `injuriesRemoved` e marca come dell'oste ogni ferita che aggiunge.
- **Log di audit:** `saveMissionDraft` è auditata con gli argomenti completi, quindi i testi delle aggiunte finiscono nel log di audit (fino a 1000 caratteri per partecipante). Nessun segreto; dichiarato qui per trasparenza.

Risposte a N0–N12 della ricerca FE:

- **N0** — confermato: nessuna query nuova; `character(id)` con `infos.background`, la più vecchia per prima (§2f, §4.1).
- **N1** — `MissionDraft.backgroundAdditions: [MissionBackgroundAddition!]!` con `{ character: ID!, text: String! }` (§1).
- **N2** — `SaveMissionDraftInput.backgroundAdditions: [MissionBackgroundAdditionInput!]` con `{ characterId: ID!, text: String! }`; sezione sostituita per intero, assente = invariata. **Differenza:** il testo vuoto SI manda ed è accettato (§2g).
- **N3** — il valore è `stories` (non `additions`).
- **N4** — `BACKGROUND_ADDITION_TOO_LONG`, al salvataggio e in difesa al completamento; `completeGuidedMission(pendingQuestId)` invariata, scrive dalla bozza (§3, §2h).
- **N5** — `QuestResult.backgroundEntryAdded: Boolean!` (§2e).
- **N6** — `ParticipantOverrideInput.injuriesRemoved: [InjuryType!]`; stessa ferita in `injuriesRemoved` e `injuries` ammessa; nel guidato si toglie solo da `injuriesBefore` (§2c, §2d).
- **N7** — `MissionFightEffects.injuriesRemoved: [InjuryType!]!`, vuota su `simulated` (§2d).
- **N8** — `MissionFightOutcome.innkeeperInjuriesBefore: [InjuryType!]!` e, sull'effetto, **`MissionFightEffects.innkeeperInjuries`** (non `innkeeperInjuriesAdded`): sottoinsieme di `injuriesAdded`, vuota su `simulated` (§2d).
- **N9** — `CharacterStatus.innkeeperInjuries: [InjuryType!]!` su `character`, `me.currentCharacter` e `characterUpdated` (§2a).
- **N10** — confermato e provato sul filo: `characterUpdated` per il partecipante al completamento, anche quando cambia solo l'origine e dopo la pagina nuova (§6).
- **N11** — confermato: `Quest.noEffect`, `QUEST_NO_EFFECT`, `ITEM_NO_EFFECT`, `injuriesHealed` e il tabellone servito al personaggio ignorano le ferite dell'oste; nessun cambio di forma (§2b).
- **N12** — lista nuova `QuestResult.injuriesRemoved`, distinta da `injuriesHealed`; un togli-e-riaggiungi non vi compare (§2e).

### Risposte al handoff della FE

Una risposta per ogni punto del §4 del `BACKEND-NOTES.md` della FE Phase 24, nell'ordine e con la numerazione di quel documento.

- **Q1 — Aggiunte al salvataggio (W-7).** Confermato con una differenza di regola: la sezione presente **sostituisce l'intera lista**, non fonde per personaggio (la ricerca BE §Q4 proponeva la fusione; scelta vetabile, §7). Per la FE il risultato è lo stesso perché manda una voce per ogni partecipante: ogni voce sostituisce quella del suo personaggio e un testo vuoto dopo il `trim` la cancella. Attenzione: un partecipante **omesso** da una sezione presente perde l'aggiunta salvata. Un `text` vuoto è accettato sul filo (nessun `@IsNotEmpty`, nessuna lunghezza minima); mandare una voce per ogni partecipante a ogni salvataggio della sezione va bene. §2g, §4.5; `src/quests/guided/mission-draft-save.service.int-spec.ts` (`describe('background additions')`), `src/quests/guided/guided-mission.resolver.int-spec.ts` («accepts an empty text over the wire and clears the saved addition (D-06)»).
- **Q2 — `BACKGROUND_ADDITION_TOO_LONG` (W-9).** In tutti e due: al salvataggio (il caso normale) e al completamento (difesa: il testo salvato è rivalidato; l'intero completamento è rifiutato e nulla viene scritto). `extensions` porta il solo `code`. §3, §4.6; `src/quests/guided/background-additions.spec.ts`, `src/quests/guided/guided-completion.service.int-spec.ts` («refuses at completion an addition over the limit…»).
- **Q3 — Valore del passo (W-8).** Il nome sullo SDL è `stories`, definitivo. §1.
- **Q4 — Ferita simulata che il personaggio porta già.** **No al salvataggio, sì al completamento senza correzione.** Una correzione che elenca in `injuries` una ferita di `injuriesBefore` senza metterla in `injuriesRemoved` è rifiutata con `OUTCOME_OVERRIDE_INVALID` anche quando quella ferita viene dal simulato; uno scontro NON corretto col simulato in quello stato passa al completamento e la ferita resta una sola, normale. È ciò che pinna il caso «passes through a simulated injury the character already owns (D-14)» (`src/quests/guided/guided-completion.service.int-spec.ts`: il salvataggio della correzione è rifiutato, il completamento passa). **In pratica oggi non succede:** la simulazione sceglie la ferita nuova solo fra i tipi che il personaggio non porta all'inizio dello scontro, quindi `simulated.injuriesAdded` e `injuriesBefore` sono disgiunte. Se la FE vuole essere robusta a un motore futuro deve togliere dalla correzione le ferite di `injuriesBefore` non rimosse; lato BE il punto resta aperto in §7.
- **Q5 — `characterUpdated` su un cambio d'origine (W-13).** Confermato e provato sul filo: l'evento esce con `status.injuries` identica e `status.innkeeperInjuries` aggiornata. §2a, §4.2; `src/characters/character-updated.subscription.int-spec.ts` («publishes the character after a completion that only flips the origin of a wound (D-15, D-16)»).
- **Q6 — `quests` per il viewer.** Confermato: `Quest.noEffect` di una heal segue l'origine (vero se le sole ferite curabili sono dell'oste e la vita è al tetto) ed è calcolato a ogni lettura sul personaggio del viewer, quindi la rilettura dopo il cambio di `innkeeperInjuries` dà il valore nuovo. §2b, §4.8; `src/quests/quests.resolver.int-spec.ts` («marks a heal quest as without effect when only innkeeper wounds match (D-14)»).
- **Q7 — `injuriesRemoved` assente su una correzione (W-2).** Chiave assente (e `null`) = **«nessuna rimozione»**, non «rimozioni invariate». La lista vuota esplicita è accettata e vuol dire la stessa cosa. Poiché la correzione è sempre l'effetto completo, rimandarla senza una rimozione già salvata la annulla (e azzera gli scontri successivi): la funzione della FE non va cambiata. §2d, §4.4; `src/quests/guided/mission-draft-save.service.int-spec.ts` (`describe('wound removals')`, «accepts an explicit empty list»).
- **Q8 — `innkeeperInjuriesBefore` sulle bozze simulate prima del deploy.** Confermato: lista vuota finché lo scontro non viene simulato di nuovo; idem `corrected.injuriesRemoved` e `corrected.innkeeperInjuries`. Nessuna nota per l'oste prevista dal BE; al riavvio dal ramo l'orchestratore controlla se esistono bozze aperte (§7). `src/quests/guided/mission-draft.mapper.spec.ts` («serves empty lists for a draft opened before the fields (D-13)»).
- **Q9 — Client vecchi.** Preso atto: per il BE una bozza al passo `stories` è una bozza come le altre; l'atterraggio su «Luogo» è della lettura tollerante della FE. §5.1.
- **Q10 — Riga del negozio.** Nessun lavoro BE: la riga del catalogo non dipende dal compratore. Resta alla decisione dell'utente in UAT.
- **Q11 — Sigillo e «visto» sul dispositivo.** Nessun lavoro BE. Il BE non confronta l'aggiunta con le voci esistenti: un testo identico a una voce di prima viene aggiunto comunque in coda. Nella UAT usare un testo nuovo (§7).

---

## 6. Comportamenti provati

Ogni voce: comportamento, decisione, spec che lo fissa.

**BE-WOUND-01 — origine sul personaggio**
- Lettura normalizzata: senza doppioni, soli tipi noti e portati, campo assente = lista vuota (D-16) — `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts`.
- Campo servito da `character` all'oste e al proprietario, personaggio scritto senza il campo = lista vuota (D-15) — `src/characters/characters-ownership.int-spec.ts`, pin SDL in `test/app.int-spec.ts`.
- `characterUpdated` quando cambia solo l'origine, e dopo un completamento dell'oste che la cambia (D-15, D-16) — `src/characters/character-updated.subscription.int-spec.ts`.

**BE-WOUND-02 — nessuna cura tocca una ferita dell'oste**
- La primitiva lascia la ferita dell'oste con tutte le copie e non la conta fra le guarite (D-11, D-14) — `src/quests/outcomes/injuries/cure-injuries.spec.ts`.
- Pozione: ferita dell'oste ancora lì dopo la bevuta, guardia di scrittura sull'origine come letta (D-14, D-16) — `src/characters/items/item-use.plan.spec.ts`, `src/characters/items/use-item.int-spec.ts`.
- Quest vinta con premio `cure`: la ferita dell'oste resta, anche quella inflitta nello stesso esito; la normale aggiunta nello stesso esito guarisce (D-11, D-14) — `src/quests/outcomes/outcome-plan.spec.ts`, `src/quests/outcomes/quest-resolution.service.int-spec.ts`.
- Cura del blocco del titolo nel completamento semplice: lascia la ferita dell'override, cura la normale (D-14) — `src/quests/outcomes/gm-completion.service.int-spec.ts`.

**BE-WOUND-03 — «senza effetto»**
- Predicato: senza effetto se la cura trova solo ferite dell'oste a vita piena; con effetto accanto a una normale o sotto il tetto (D-14) — `src/quests/outcomes/injuries/heal-no-effect.spec.ts`, `src/quests/no-effect/viewer-vitals.service.spec.ts`.
- `acceptQuest` rifiuta con `QUEST_NO_EFFECT`; `Quest.noEffect` vero sul tabellone (D-14) — `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `src/quests/quests.resolver.int-spec.ts`.
- Pozione rifiutata con `ITEM_NO_EFFECT` a vita piena con sole ferite dell'oste (D-14) — `src/characters/items/item-use.plan.spec.ts`, `src/characters/items/use-item.int-spec.ts`.

**BE-WOUND-04 — le correzioni tolgono**
- Input: rimozioni solo di ferite portate, tipo ignoto rifiutato, tetto dell'override, chiave solo se non vuota (D-13) — `src/quests/outcomes/gm-overrides.spec.ts`.
- Completamento semplice: toglie una ferita normale e una dell'oste, rifiuta quella non portata; sul filo (D-12, D-13) — `src/quests/outcomes/gm-completion.service.int-spec.ts`, `src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts`.
- Foglio: `injuriesRemoved` servito, lista vuota sui fogli di prima; togli-e-riaggiungi assente dalle due liste (D-13, D-16) — `src/quests/results/quest-result.resolver.int-spec.ts`, `src/quests/results/quest-result.populate.spec.ts`, `src/quests/outcomes/outcome-plan.spec.ts` («reports nothing for a wound removed and added again (D-16)»).

**BE-WOUND-05 — la ferita aggiunta a mano è dell'oste**
- Correzione pura: toglie dalle due liste, marca solo le ferite davvero aggiunte, ferita già portata e non tolta conserva l'origine (D-12, D-16) — `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts`.
- Flusso semplice: ogni ferita dell'override è dell'oste; ferita normale tolta e riaggiunta diventa dell'oste; senza override l'origine non si scrive (D-12, D-16) — `src/quests/outcomes/gm-completion.service.int-spec.ts`.
- Flusso guidato: dell'oste = corretto meno simulato più le tolte-e-riaggiunte; la simulata lasciata com'è resta normale (D-12) — `src/quests/guided/draft-invalidation.spec.ts`, `src/quests/guided/guided-completion.service.int-spec.ts` («leaves a simulated wound kept as it is ordinary (D-12)»).

**BE-WOUND-06 — origine e rimozioni fra gli scontri**
- Predicato a due liste e stato fra gli scontri: rimozione fuori da `injuriesBefore` e riaggiunta senza togliere rifiutate; lo scontro successivo parte dallo stato lasciato (D-13, D-16) — `src/quests/guided/fight-state.spec.ts`, `src/quests/guided/mission-draft-save.service.int-spec.ts`.
- Bozza servita: `innkeeperInjuriesBefore`, `corrected.injuriesRemoved`, `corrected.innkeeperInjuries`, liste vuote su `simulated` e sulle bozze di prima (D-12, D-13, D-16) — `src/quests/guided/mission-draft.mapper.spec.ts`, `src/quests/guided/guided-mission.resolver.int-spec.ts`.
- Completamento: netto della piega in ordine, rimozioni alla rivalidazione, cura scelta che salta le ferite dell'oste (D-12, D-13, D-14) — `src/quests/guided/guided-outcome.spec.ts`, `src/quests/guided/guided-completion.service.int-spec.ts` (`describe('innkeeper wounds')`).
- Flusso intero sul filo: ferita tolta, ferita inflitta a mano, passo `stories`, completamento, personaggio riletto dal proprietario (D-05, D-09, D-12, D-13) — `src/quests/guided/guided-mission.resolver.int-spec.ts`.

**BE-STORY-01 — lettura dei background**
- L'oste legge `infos { name background } status { title }` del personaggio di un altro, voci in ordine; un altro giocatore riceve `FORBIDDEN` (D-01, D-02) — `src/characters/characters-ownership.int-spec.ts` (`describe('participant stories')`).

**BE-STORY-02 — aggiunte nella bozza**
- Forma dell'input: testo vuoto accettato, tetto di forma, sezione annullabile, voci annidate validate (D-06, D-07) — `src/quests/guided/mission-draft.inputs.spec.ts`.
- Salvataggio: passo `stories`, sezione sostituita per intero, vuote lasciate cadere, estraneo e doppione rifiutati, nessuna scrittura parziale (D-05, D-06) — `src/quests/guided/mission-draft-save.service.int-spec.ts`.
- Sul filo: aggiunte servite ripulite, testo vuoto che cancella la salvata (D-06) — `src/quests/guided/guided-mission.resolver.int-spec.ts`.

**BE-STORY-03 — tetto di 1000 grafemi**
- Un solo predicato di conteggio condiviso con la creazione, che resta a 500 (D-07) — `src/characters/creation/grapheme-count.spec.ts`.
- Regole pure delle aggiunte e codice proprio (D-06, D-07) — `src/quests/guided/background-additions.spec.ts`, `src/gameRules/game-rule.exception.spec.ts`.

**BE-STORY-04 — scrittura al completamento**
- Voce in coda nella transazione, ognuna al proprio partecipante, nulla per chi non ha aggiunta, nulla se il completamento è rifiutato o la bozza è cambiata dopo la lettura (D-05, D-06, D-08) — `src/quests/guided/guided-completion.service.int-spec.ts` (`describe('background additions')`).
- Il completamento semplice non scrive mai un background (D-10) — `src/quests/outcomes/gm-completion.service.int-spec.ts`, `src/quests/outcomes/outcome-plan.spec.ts`.
- `characterUpdated` del partecipante con la pagina nuova come ultima voce (D-08, D-09) — `src/characters/character-updated.subscription.int-spec.ts`.

**BE-STORY-05 — flag sul foglio**
- `backgroundEntryAdded` servito, `false` sui fogli di prima e per default (D-09) — `src/quests/results/quest-result.resolver.int-spec.ts`, `src/quests/results/quest-result.populate.spec.ts`.
- Vero solo per il partecipante con un'aggiunta non vuota (D-09) — `src/quests/guided/guided-completion.service.int-spec.ts`.

**BE-STORY-06 — SDL additivo, gate e handoff**
- Gate 25-13 (`25-13-SUMMARY.md`) e questo documento.

**Le tre trappole della ricerca**

| Trappola | Caso che la chiude | Spec |
|----------|--------------------|------|
| 1. `sameCorrections` scarta una correzione di sole rimozioni | «writes a correction that changes only the removals and resets the later fights (D-13)» | `src/quests/guided/mission-draft-save.service.int-spec.ts` |
| 2. `overrideInputOf` perde le rimozioni alla rivalidazione | «carries the removals into the override input (D-13)»; «refuses at completion a removal stored on an uncorrected fight the character no longer carries (D-13)» | `src/quests/guided/guided-outcome.spec.ts`; `src/quests/guided/guided-completion.service.int-spec.ts` |
| 3. unione delle ferite fra scontri | «folds the wounds of the fights in order instead of joining them (D-13)» | `src/quests/guided/guided-outcome.spec.ts` |

---

## 7. Compiti dell'orchestratore, UAT, decisioni vetabili

### Compiti dell'orchestratore

1. `npm run test:cov` in background (≈ 630 s) e soglie di coverage.
2. Verifica e audit della fase.
3. PR verso `develop` (mai `main`).
4. Build e riavvio del BE dal ramo. **NESSUN migratore:** ogni campo nuovo ha un valore neutro. Al riavvio controllare se esistono bozze guidate aperte: rispondono liste vuote sui campi nuovi finché lo scontro non viene rilanciato.
5. Brief della FE con §0–§5 di questo documento.

### UAT su device (un passo per messaggio)

Prerequisiti: BE riavviato dal ramo, build della FE Phase 24 sul device, una `story` o `worldMission` con almeno due iscritti. La bozza nasce col premio del blocco del rango, **cura compresa**: nei passi 2 e 7 controllare (o togliere) la cura del premio, altrimenti guarisce le ferite normali e confonde la lettura.

1. Pagina delle storie prima dell'avvio: i background dei partecipanti si leggono e **nessuna bozza viene creata** (`missiondrafts` senza documenti nuovi).
2. Correzione che toglie una ferita di prima e ne infligge una a mano; ripresa della bozza da un altro dispositivo: rimozione e segno dell'oste ancora lì.
3. Ultima pagina con un'aggiunta (testo nuovo, mai uguale a una voce esistente: Q11); uscita e rientro: il testo c'è ancora.
4. «Concludi»: foglio con la riga della storia, sigillo sul Profilo, ferita nel Diario col segno «Troppo grave per essere curata».
5. Quest heal e pozione che comprendono quella ferita: heal senza effetto (a vita piena) / dopo la pozione la ferita è ancora lì.
6. L'oste la toglie con una correzione in una richiesta successiva: sparisce dal Diario e da `innkeeperInjuries`.
7. Togli-e-riaggiungi su una ferita normale: diventa dell'oste; sul foglio non compare né fra le aggiunte né fra le tolte.

Diagnosi a DB: `characters.status.injuries`, `characters.status.innkeeperInjuries`, `characters.infos.background`, `missiondrafts.backgroundAdditions`, `missiondrafts.fights.outcomes` (`innkeeperInjuriesBefore`, `corrected.injuriesRemoved`; `corrected.innkeeperInjuries` NON è a DB: è derivata), `questresults` (`injuriesRemoved`, `backgroundEntryAdded`).

### Trappola per gli script a DB

`CharacterStatus.innkeeperInjuries` è servita **GREZZA**: nessun `@ResolveField`, l'invariante «sottoinsieme di `injuries`» è custodita solo dalle scritture del BE. Ogni script di UAT o di cura a DB che toglie una ferita da `status.injuries` **DEVE toglierla anche da `status.innkeeperInjuries` nello stesso update** (un solo `$set` con le due liste, o un `$pull` su entrambe), altrimenti il filo serve una ferita dell'oste che il personaggio non porta. Per seminare una ferita dell'oste: `$set` di `status.injuries` e di `status.innkeeperInjuries` insieme. Le regole del dominio (cure, «senza effetto», correzioni) leggono l'origine normalizzata e ignorano una voce sporca, ma la FE disegna ciò che riceve.

### Decisioni di disegno vetabili

- **Sezione delle aggiunte sostituita per intero** (la ricerca proponeva la fusione per personaggio): scelta la sostituzione perché la FE manda la sezione intera, testi vuoti compresi, e un campo svuotato deve cancellare l'aggiunta salvata.
- **Riaggiunta senza togliere:** ignorata in silenzio nel flusso semplice, rifiutata (`OUTCOME_OVERRIDE_INVALID`) nel guidato, com'era prima della fase.
- **`QuestResult.injuriesRemoved` sempre valorizzato** (lista vuota), campo distinto da `injuriesHealed`.
- **Testi delle aggiunte nel log di audit** di `saveMissionDraft` (fino a 1000 caratteri per partecipante, nessun segreto).
- **Un togli-e-riaggiungi non lascia traccia sul foglio:** solo l'origine sul personaggio cambia.

### Punti aperti

- **Q4 (ferita simulata già portata):** la regola del guidato rifiuta la correzione che la rimanda invariata. Oggi il caso non si produce (la simulazione non sceglie ferite già portate); se un motore futuro lo producesse, la FE che rimanda il simulato com'è riceverebbe `OUTCOME_OVERRIDE_INVALID`. Decidere allora se filtrare lato BE o lato FE. Nessun lavoro in questa fase.
- Un `status.injuries` con doppioni (dato legacy) viene ripulito dal completamento solo per le ferite toccate da una correzione; un esito senza correzioni non ripulisce un `status.innkeeperInjuries` sporco.

### Deviazioni dai piani e casi verdi al primo colpo

- **06:** il caso della Phase 22 «applies the cure on top of the game master override (D-07)» è stato riscritto (la cura non guarisce più la ferita dell'override); harness della spec sul filo passato a `createCharactersTestApp`.
- **07:** i due casi «(D-14)» della Phase 22 sul rifiuto della riaggiunta riscritti sul predicato nuovo; tre attese dell'intero record aggiornate per il default di schema (`injuriesRemoved: []`).
- **09:** il netto conta anche un cambio del numero di copie (dato legacy); un caso in più per la trappola 2 (rimozione su uno scontro non corretto: difesa su una bozza manomessa); task 2 di soli test, verdi al primo colpo e provati con due mutazioni temporanee.
- **10–12:** casi in più (doppione prima dei testi, voci annidate validate, ogni aggiunta al proprio partecipante, D-10 con una bozza che porta un'aggiunta).
- **13:** nessuna correzione di codice al gate; un caso in più sulla subscription (pagina nuova in coda); `--forceExit` nei comandi d'integrazione.
- **Verdi al primo colpo (pin di contratto o di assenza):** lettura dei background da parte dell'oste (la query esisteva già), `characterUpdated` sul solo cambio d'origine e sulla pagina nuova (il publisher ascolta il change stream), i casi «nessuna scrittura» del completamento, i tre casi nuovi del gate.
- Nessun `npm run build`, nessun riavvio del BE, nessun accesso al DB reale né lettura di `.env` in tutta la fase.
