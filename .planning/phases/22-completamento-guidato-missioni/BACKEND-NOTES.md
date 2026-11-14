# BACKEND-NOTES — Phase 22 Completamento guidato delle missioni (handoff per la FE Phase 21 e la UAT)

- **Fase BE:** 22-completamento-guidato-missioni (requisiti BE-GMFLOW-01..09; decisioni D-01..D-27 in `22-CONTEXT.md`, D-13..D-27 e D-31 nella sezione «Aggiunte dopo la ricerca», che vince sul resto; nomi fissati in `22-REPO-RULES.md`). **Companion:** FE Phase 21 «innkeeper mission completion flow» (wizard dell'oste e avviso «Missione in corso» dei giocatori), ramo FE `feat/21-innkeeper-mission-completion`.
- **Data:** 2026-11-14. Scritto dopo il gate 22-17 e dopo le correzioni della review per aree (`22-REVIEW.md`, `22-REVIEW-FIX.md`: 12 finding, 11 corretti, 1 lasciato per ruling, A-02); descrive il codice della HEAD del ramo (`d9db1971` più i soli commit di documentazione).
- **Branch:** `feat/22-completamento-guidato-missioni` → PR verso `develop` a cura dell'orchestratore, dopo `npm run test:cov`, verifica, audit, build e riavvio reale del BE dal ramo e la UAT su device (§6).
- **Gate 22-17:** `npx tsc --noEmit` 0; unit 295 suite / 3 934 test; integration 153 suite / 2 323 test in cinque blocchi `--runInBand` (`src/quests/outcomes` 14 / 206, resto di `src/quests` 30 / 518, `src/characters` 26 / 413, `src/travel` 12 / 250, resto 71 / 936); boot reale `test/app.int-spec.ts` 101 / 101; coverage per cartella sopra soglia (economy 100 / 94,25 / 100, `characters.service.ts` 98,54 / 90,32 / 100, acceptance 99,11 / 92,83 / 99,75, travel 98,75 / 86,94 / 99,38, generation 98,9 / 88,73 / 99,68). Dopo i fix della review: unit 296 suite / 3 944 test, integration `src/characters` 26 / 417, guided + gm-completion + pending-requests + app + authz 12 / 366; `src/schema.gql` invariato dai fix. `npm run test:cov` completo: lanciato dall'orchestratore.
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, migrazione, seeder o one-off; nessun file di contenuto nel repo (D-36 del progetto): i dati della UAT si descrivono in §6 e li scrive l'orchestratore a DB con uno script fuori dal repo.
- **Fonte:** ogni nome, percorso, codice e titolo di caso è copiato dal codice (`src/quests/guided/`, `src/characters/mission-lock/`, `src/quests/outcomes/`, `src/quests/pending-requests/`). **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **SDL solo additivo** (D-17): `git diff c6079ca3 -- src/schema.gql` = 147 righe aggiunte, 0 tolte. Nessun tipo rinominato, nessun campo tolto.
2. **Otto operazioni nuove dell'oste**, tutte `@Roles(innkeeper)` (FORBIDDEN a ogni altro ruolo): query `missionDraft`, `missionEnemies`, `missionPrizeOptions`; mutation `startMissionDraft`, `saveMissionDraft`, `simulateMissionFight`, `discardMissionDraft`, `completeGuidedMission`. Le cinque mutation entrano nel log di audit con target `PendingQuest`; le query no (D-26).
3. **Due booleani risolti su `CharacterStatus`** (D-16): `missionInProgress: Boolean!` (ogni missione in corso, flusso guidato compreso) e `guidedMissionInProgress: Boolean!` (solo bozza aperta su una richiesta del personaggio). La FE non li deduce: li legge.
4. **`PendingRequest.missionDraftStartedAt: DateTime`** (nullable): data d'avvio della bozza sulla voce della coda dell'oste, per la carta «Riprendi» (N-4).
5. **Codice nuovo `MISSION_IN_PROGRESS`** (messaggio «Missione in corso: azione non disponibile fino al risultato», `extensions` = `{ code }` soltanto) sulle azioni bloccate (§3).
6. **`completePendingRequest` convive** (D-25, N-15): resta con gli override per la FE pre-merge e nella sua transazione cancella la bozza della richiesta, se c'è. Si rimuove dopo la merge della FE Phase 21 (quick o fase successiva: cambio SDL non additivo).

---

## 1. SDL aggiunto (verbatim)

Blocchi copiati da `src/schema.gql` (ordine alfabetico, come lo emette Apollo con `sortSchema`). Prova: `git diff c6079ca3 -- src/schema.gql` mostra sole righe aggiunte (147, conteggio del gate 22-17); identico a `22-RESEARCH.md` §Q9 più le quattro aggiunte di D-17 (`CharacterStatus.guidedMissionInProgress` e, su `MissionFightOutcome`, `consumablesAvailable`, `injuriesBefore`, `spellsAvailable`).

Righe nuove dentro tipi esistenti:

```graphql
type CharacterStatus {
  # … campi esistenti invariati …
  guidedMissionInProgress: Boolean!
  missionInProgress: Boolean!
}

type PendingRequest {
  # … campi esistenti invariati …
  missionDraftStartedAt: DateTime
}

type Query {
  # … righe esistenti invariate …
  missionDraft(pendingQuestId: ID!): MissionDraft
  missionEnemies(pendingQuestId: ID!, showAll: Boolean = false): [Enemy!]!
  missionPrizeOptions(characterId: ID!, pendingQuestId: ID!): MissionPrizeOptions!
}

type Mutation {
  # … righe esistenti invariate …
  completeGuidedMission(pendingQuestId: ID!): [QuestResult!]!
  discardMissionDraft(pendingQuestId: ID!): CommonResponse!
  saveMissionDraft(input: SaveMissionDraftInput!): MissionDraft!
  simulateMissionFight(input: SimulateMissionFightInput!): MissionDraft!
  startMissionDraft(pendingQuestId: ID!): MissionDraft!
}
```

Tipi, enum e input nuovi:

```graphql
type MissionDraft {
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

enum MissionDraftStep {
  fights
  prizes
  recap
  teleport
}

input MissionEnemyInput {
  enemy: ID!
  quantity: Int!
}

type MissionFight {
  enemies: [MissionFightEnemy!]!
  outcomes: [MissionFightOutcome!]!
  verdict: MissionFightVerdict
}

type MissionFightEffects {
  consumablesUsed: [MissionItemUsage!]!
  hpAfter: Int!
  injuriesAdded: [InjuryType!]!
  spellsUsed: [MissionSpellUsage!]!
}

type MissionFightEnemy {
  enemy: Enemy!
  quantity: Int!
}

input MissionFightInput {
  corrections: [ParticipantOverrideInput!]
  enemies: [MissionEnemyInput!]!
}

type MissionFightOutcome {
  character: ID!
  consumablesAvailable: [MissionItemUsage!]!
  corrected: MissionFightEffects
  hpBefore: Int!
  injuriesBefore: [InjuryType!]!
  simulated: MissionFightEffects
  spellsAvailable: [MissionSpellUsage!]!
}

enum MissionFightVerdict {
  failure
  success
}

type MissionItemUsage {
  item: ID!
  quantity: Int!
}

type MissionParticipant {
  character: ID!
  maxLifePoints: Int!
  name: String!
  pendingQuest: ID!
  title: String!
}

type MissionPrize {
  character: ID!
  coins: Coins!
  cure: QuestCure
  items: [MissionPrizeItem!]!
  pet: ID
  spell: ID
  xp: Int!
}

input MissionPrizeInput {
  characterId: ID!
  coins: CoinsInput!
  cure: Boolean!
  items: [MissionPrizeItemInput!]!
  pet: ID
  spell: ID
  xp: Int!
}

type MissionPrizeItem {
  item: ID!
  quantity: Int!
}

input MissionPrizeItemInput {
  item: ID!
  quantity: Int!
}

type MissionPrizeOptions {
  block: QuestPrizes!
  character: ID!
  equipment: [EquipmentItem!]!
  loot: [LootItem!]!
  maxRarity: RarityType!
  pets: [Pet!]!
  spells: [Spell!]!
  title: String!
}

type MissionSpellUsage {
  spell: ID!
  usages: Int!
}

input SaveMissionDraftInput {
  fights: [MissionFightInput!]
  pendingQuestId: ID!
  place: ID
  prizes: [MissionPrizeInput!]
  step: MissionDraftStep
}

input SimulateMissionFightInput {
  enemies: [MissionEnemyInput!]!
  fightIndex: Int!
  pendingQuestId: ID!
}
```

Riusati senza modifiche: `ParticipantOverrideInput { characterId, consumablesUsed: [ItemUsageInput!], hpAfter: Int, injuries: [InjuryType!], spellsUsed: [SpellUsageInput!] }`, `CoinsInput`, `QuestPrizes`, `QuestCure`, `Enemy`, `QuestResult`.

---

## 2. Semantica per passo

**Chiave della bozza (N-3, D-18):** ogni operazione accetta un `pendingQuestId` qualunque del gruppo: per una story la sua sola PendingQuest, per una worldMission una qualunque PendingQuest dei titolari attivi della stessa quest (tutti risolvono la stessa bozza, unica per gruppo con indice unico). Una PendingQuest malformata, assente, di una corsia standard o senza titolari attivi → `NOT_FOUND`.

- **`startMissionDraft(pendingQuestId)`** — idempotente (due avvii concorrenti producono una sola bozza; il secondo legge quella del primo). Crea la bozza e, nella stessa transazione, marca tutte le PendingQuest del gruppo con `missionDraftStartedAt` = istante d'avvio: da qui i partecipanti sono bloccati (§3). **Precompila TUTTO il blocco del titolo** di ogni partecipante in `prizes` (D-22: monete, xp, `prizeItem`, intero pool `randomLoot`, pet, magia, cura se presente; voci orfane scartate, stessa voce fusa con quantità limitata a 99): la FE non costruisce i premi dal blocco, l'oste toglie e aggiunge. `step` = `teleport`, `fights` = `[]`. Rifiuti: `NOT_FOUND`; `QUEST_IN_PROGRESS` se un partecipante ha una PendingQuest standard nella corsia, **anche non ancora avviata** (`assertNoBusyParticipant` di oggi, I4).
- **Teleport (D-01):** invariato. `teleportCharacter` accetta già qualunque POI e **non** è bloccato da `MISSION_IN_PROGRESS` per i partecipanti. Il passo si salta se il gruppo è già sul posto.
- **`missionDraft(pendingQuestId)`** — nullable: `null` senza bozza. **Cancella una bozza orfana** (senza PendingQuest vive) alla lettura e risponde `null`: è una scrittura idempotente dentro una query (I1). `NOT_FOUND` per una richiesta inesistente.
- **`saveMissionDraft(input)`** — sezioni opzionali (`step`, `place`, `fights`, `prizes`): una sezione assente o `null` resta invariata; una presente **sostituisce**. Un solo update per salvataggio; **last-write-wins** fra dispositivi (N-9: nessun campo versione sul filo). I passi si salvano senza ordine imposto (D-18).
  - `place`: id di un POI esistente, altrimenti `NOT_FOUND`.
  - `fights`: la lista completa degli scontri (zero ammessi, D-24). Regole d'invalidazione (D-24, N-8): gli scontri iniziali coi nemici identici (ordine, id, quantità) a quelli salvati conservano simulazione e correzioni; dal primo scontro diverso in poi ogni scontro torna «da simulare» (`verdict` null, `outcomes` vuoti). Nemico inesistente → `NOT_FOUND`.
  - **Correzioni** (`MissionFightInput.corrections`, D-06, D-14): ammesse solo su uno scontro già simulato (altrimenti `OUTCOME_OVERRIDE_INVALID`). Ogni voce è l'**effetto completo** dello scontro per quel personaggio, validato come gli override di `completePendingRequest` (`validateOverrides`) sullo stato **all'inizio di quello scontro** (vita `1..maxLifePoints`, consumabili ≤ posseduti a inizio scontro, usi ≤ usi rimasti delle magie attive, ferite dell'enum). `injuries` = lista completa delle ferite che lo scontro aggiunge dopo la correzione (sostituisce `simulated.injuriesAdded`): **una ferita già presente in `injuriesBefore` non si dichiara** (D-14) → `OUTCOME_OVERRIDE_INVALID`. Il controllo vale solo sugli effetti corretti; gli effetti simulati non corretti passano sempre (ruling W5, D-31). Una correzione che cambia l'effetto di uno scontro k azzera le simulazioni dei successivi. Personaggio fuori dalla bozza → `OUTCOME_NOT_PARTICIPANT`.
  - **La FE manda sempre la lista COMPLETA delle `corrections` di uno scontro, con `hpAfter` per ogni personaggio elencato: un personaggio non elencato torna all'effetto simulato e un `hpAfter` omesso diventa la vita all'inizio dello scontro.**
  - `prizes`: voci per personaggio, **fuse** nella bozza (si sostituisce il premio dei soli personaggi elencati; gli altri restano). Ogni voce è rivalidata con la stessa funzione delle opzioni (oggetti, pet, magia nel catalogo filtrato o nel blocco). Monete e xp **liberi** (D-15: interi ≥ 0, nessun legame col blocco) fino al tetto tecnico di 9 999 999. Quantità per voce `1..99`. **`cure: true` è accettato solo se il blocco del titolo ha una cura**, altrimenti `OUTCOME_OVERRIDE_INVALID`; la cura salvata è quella del blocco (l'oste la tiene o la toglie, non la modifica). Personaggio fuori dalla bozza → `OUTCOME_NOT_PARTICIPANT`; lo stesso personaggio due volte → `OUTCOME_OVERRIDE_INVALID`.
  - Bozza assente → `NOT_FOUND`.
- **`simulateMissionFight(input)`** — scrive i nemici dello scontro `fightIndex` e lo risolve col `CombatResolver` sullo stato all'inizio di quello scontro (stato reale per il primo; per i successivi lo stato lasciato dagli effetti effettivi, corretti o simulati, dei precedenti, D-02). Scontro k con k-1 non simulato, indice fuori da `0..fights.length` o oltre il tetto → `OUTCOME_OVERRIDE_INVALID`. Il rilancio di k riscrive k e azzera le simulazioni dei successivi (D-05, D-24). **Nessuna scrittura fuori dalla bozza** (personaggi, quest, risultati intatti) e **nessun tiro dalla sorgente di caso condivisa** (porta dedicata `MissionSimulationChance`, D-04). Il compagno equipaggiato entra nel contesto (D-20; il segnaposto lo ignora). Verdetto uno per scontro (`MissionFight.verdict`, D-21). **Limiti serviti per scontro** (D-17, N-7): ogni `MissionFightOutcome` porta `hpBefore`, `injuriesBefore`, `consumablesAvailable` (loot posseduto a inizio scontro), `spellsAvailable` (magie attive con gli usi rimasti); `maxLifePoints` sta su `MissionParticipant`. Nemico inesistente → `NOT_FOUND`.
- **`missionEnemies(pendingQuestId, showAll = false)`** (D-03, D-19) — luogo = `MissionDraft.place` se salvato, altrimenti la posizione del primo partecipante. Regola: nemici che vivono nei tipi del POI o con habitat `city` (animali compresi), nella fascia xp del titolo della missione (story: `minTitle`; worldMission: unione delle fasce da `minTitle` al titolo più alto dei posti; `legend` gioca come `hero`, titolo assente come `rookie`); per la **worldMission** in più i leggendari della zona **senza filtro di fascia**; story mai leggendari. Zona vuota → ripiego sui nemici con habitat `all` (D-19, D-31). Ordine stabile: xp crescente, poi nome, poi id. `showAll: true` = bestiario intero. **N-5:** `place` resta un `ID`: la FE lo risolve con la sua lettura dei POI (D-29 della FE); nessun rifiuto per un gruppo diviso (decide il primo partecipante o il luogo salvato). **N-6:** tetto 20 per voce (`MAX_ENEMY_QUANTITY`).
- **`missionPrizeOptions(characterId, pendingQuestId)`** (D-07, D-22) — `block` = blocco del titolo del personaggio (`QuestPrizes`, blocco vuoto se la quest non ne ha) e catalogo filtrato: `equipment`, `loot`, `pets` fino a `maxRarity` (tetto dalla tabella boss per la worldMission, enemy per la story); `spells` solo a un caster con `minXpToLearn` ≤ xp e non già note. Le voci del blocco sono sempre ammesse anche oltre il tetto. Personaggio fuori dalla richiesta → `OUTCOME_NOT_PARTICIPANT`. **N-10:** il blocco arriva come `QuestPrizes` (con `randomLoot`), non come righe concrete: le righe concrete sono già in `MissionDraft.prizes`, precompilate dal BE all'avvio.
- **`discardMissionDraft(pendingQuestId)`** — cancella la bozza e riporta i marcatori a null in una transazione (anche senza documento: mai un blocco che non si rilascia). Risposta `{ response: 'Bozza scartata', successful: true }`. Il teleport già fatto resta.
- **`completeGuidedMission(pendingQuestId)`** (D-05, D-08, D-25) — legge **solo la bozza** (nessun input di stato). Una transazione: per ogni posto stato finale = effetto aggregato degli scontri (vita dell'ultimo, ferite unite, consumi e usi sommati), rivalidato scontro per scontro in sessione; nemici di tutti gli scontri fusi in `QuestResult.enemies`; xp dei nemici e del compagno, conoscenza e lore di vittoria come una vittoria; premi scelti rivalidati; esito sempre `gmCompleted` (nessuna aid, nessuna sconfitta scritta, anche con una simulazione persa); PendingQuest cancellate, worldMission conclusa, bozza cancellata; foglio dell'esito e push come oggi dopo il commit. **Nessun tiro.** Zero scontri ammessi (story narrativa: solo premi, D-24, N-14). Rifiuti: `NOT_FOUND` (richiesta o bozza assente), `QUEST_IN_PROGRESS` (partecipante con la corsia standard occupata), `OUTCOME_OVERRIDE_INVALID` (scontro senza verdetto, partecipante senza esito, correzione non più valida, premio non più ammesso, **bozza scritta dopo la lettura**: vedi sotto).
  - **Bozza cambiata durante il completamento:** il completamento cancella solo la revisione della bozza che ha letto (contatore `rev` solo Mongoose, mai sul filo). Un salvataggio o una simulazione arrivati fra la lettura e la cancellazione fanno rifiutare il completamento con `OUTCOME_OVERRIDE_INVALID` senza alcuna scrittura: **la FE rilegge la bozza (`missionDraft`) e riprova**. Una scrittura che arriva dopo la cancellazione riceve `NOT_FOUND` dalla bozza sparita.
  - **Completamento concorrente:** due `completeGuidedMission` insieme sulla stessa richiesta (anche da due PendingQuest diverse del gruppo): uno vince, l'altro riceve `NOT_FOUND`; un solo `QuestResult` per posto.

### Mutation → codici di rifiuto

| Operazione | Codici |
|------------|--------|
| `startMissionDraft` | `NOT_FOUND`, `QUEST_IN_PROGRESS`, FORBIDDEN |
| `missionDraft` (query) | `NOT_FOUND`, FORBIDDEN |
| `saveMissionDraft` | `NOT_FOUND` (richiesta, bozza, POI, nemico), `OUTCOME_OVERRIDE_INVALID`, `OUTCOME_NOT_PARTICIPANT`, `BAD_USER_INPUT` (validatori del filo), FORBIDDEN |
| `simulateMissionFight` | `NOT_FOUND` (richiesta, bozza, nemico), `OUTCOME_OVERRIDE_INVALID` (ordine, intervallo, tetti), `BAD_USER_INPUT`, FORBIDDEN |
| `missionEnemies` (query) | `NOT_FOUND`, FORBIDDEN |
| `missionPrizeOptions` (query) | `NOT_FOUND`, `OUTCOME_NOT_PARTICIPANT`, FORBIDDEN |
| `discardMissionDraft` | `NOT_FOUND` (richiesta), FORBIDDEN |
| `completeGuidedMission` | `NOT_FOUND`, `QUEST_IN_PROGRESS`, `OUTCOME_OVERRIDE_INVALID`, FORBIDDEN |

### Contratto: tetti tecnici

La FE fissa i suoi stepper da qui (costanti in `src/quests/guided/mission-draft.inputs.ts`, `mission-draft-prefill.ts`, `src/models/request/complete-pending-request.model.ts`). Oltre il tetto: `BAD_USER_INPUT` dal validatore del filo, `OUTCOME_OVERRIDE_INVALID` dal dominio.

| Nome | Valore | Cosa |
|------|--------|------|
| `MAX_MISSION_FIGHTS` | 10 | scontri per missione |
| `MAX_FIGHT_ENEMIES` | 10 | voci di nemico per scontro |
| `MAX_ENEMY_QUANTITY` | 20 | quantità per voce di nemico (`1..20`) |
| `MAX_OVERRIDE_ENTRIES` | 50 | correzioni per scontro |
| `MAX_PRIZE_ITEMS` | 500 | voci di oggetto per premio (tetto largo: un blocco precompilato si salva sempre invariato, ruling W2) |
| `MAX_PRIZE_ITEM_QUANTITY` | 99 | quantità per voce di oggetto (`1..99`) |
| `MAX_PRIZE_AMOUNT` | 9 999 999 | ogni taglio di monete (oro, argento, rame) e xp di un premio (`0..9 999 999`) |
| premi | nessun tetto | uno per partecipante |

Il tetto di 9 999 999 è **tecnico, non di prodotto**: D-15 resta «liberi»; la FE limita l'input a 7 cifre. Sul filo resta `CoinsInput` (il tetto vive in una classe di sola validazione, il negozio non lo eredita). Un blocco del titolo con più di 9 999 999 in un taglio (nessuno oggi) non si potrebbe risalvare invariato. Scontro fuori ordine o fuori intervallo → `OUTCOME_OVERRIDE_INVALID` (nessun codice nuovo).

### Uso lato FE (già implementato nella FE, ramo `feat/21-innkeeper-mission-completion`)

- Il wizard invia le `corrections` **solo** per lo scontro in modifica; sugli altri scontri `corrections` è assente (quindi le loro correzioni restano invariate se i nemici non cambiano).
- Al salvataggio degli scontri invia anche lo step `fights`.
- «Completa» è disabilitato finché uno scontro non ha verdetto.
- La cura si aggiunge solo se `MissionPrizeOptions.block.cure` è presente.

---

## 3. Blocco «missione in corso»

**Definizione (D-11, D-12, D-13, D-23):** un personaggio è bloccato se
- la sua corsia standard ha una PendingQuest **avviata** (`startDate` presente): le solitarie dall'arrivo sul marker (tempo d'attesa), le registrate (enemy, boss, soccorritori di un'aid) dall'avvio del party; in viaggio verso la quest o in attesa del gruppo **non** è bloccato;
- oppure una sua corsia GM (story, worldMission) ha la bozza aperta (`missionDraftStartedAt` presente); la `startDate` delle corsie GM scritta all'accettazione non conta.

Il ferito in attesa di soccorso **non** è «missione in corso» (D-23): ha già i suoi rifiuti `AWAITING_AID`. Un solo predicato condiviso da tutte le guardie e dai due campi risolti. Rilascio: esito della missione, completamento o scarto della bozza, archivio del personaggio.

**`missionInProgress` vs `guidedMissionInProgress` (D-16):** `missionInProgress` è vero in ogni caso sopra (righe di Diario e Tabellone); `guidedMissionInProgress` solo con la bozza aperta (etichetta sulla pedina durante il flusso dell'oste). Entrambi risolti a ogni lettura del personaggio, anche quando l'oste legge `character(id)`; un personaggio letto senza le corsie chiede al reader invece di rispondere `false` (fix A-04).

**Operazioni bloccate** (precedenza: i codici esistenti vincono dove già scattano; `MISSION_IN_PROGRESS` solo dove oggi l'azione passerebbe):

| Mutation | Codici che vengono prima | Missione in corso |
|----------|--------------------------|-------------------|
| `equipItem`, `equipPet`, `unequipPet`, `equipSpell`, `unequipSpell`, `useSpell` | nessuno | `MISSION_IN_PROGRESS` |
| `useItem` | `AWAITING_AID` | `MISSION_IN_PROGRESS` (prima di possesso, ricarica, effetto) |
| `doTransaction` | `CHARACTER_IMPRISONED` | `MISSION_IN_PROGRESS` (prima di `SHOP_NOT_IN_CITY`) |
| `startTravel`, `travelPreview` | quelli di oggi (`AWAITING_AID`, `CHARACTER_IMPRISONED`, `TRAVEL_IN_PROGRESS`, `QUEST_IN_PROGRESS` con la corsia standard occupata, `TRAVEL_SAME_LOCATION`, `TRAVEL_NO_PATH`) | `MISSION_IN_PROGRESS` (bozza guidata) |
| `acceptQuest` | soccorso, viaggio, prigione, già presa, titolo, `QUEST_SLOT_BUSY`, posti | `MISSION_IN_PROGRESS`; worldMission con bozza aperta → `QUEST_NOT_ACCEPTABLE` |
| `questTravelPreview` (anteprima dell'accettazione) | quest/personaggio inesistenti, `QUEST_NOT_IN_CITY` | `MISSION_IN_PROGRESS` (ruling 2026-11-14) |
| `teleportCharacter` (oste), `deleteCharacter`, `abandonQuest`, `acknowledgeQuestResult` | — | non bloccate |

`travelPreview` e `questTravelPreview` sono query ma rifiutano come le mutation (D-23, D-31). Con una missione in corso **ogni** accettazione o iscrizione è rifiutata, anche su un'altra corsia (D-13). L'oste non ha bypass: le guardie valgono anche col bearer `innkeeper` sul proprio personaggio.

**Messaggio:** «Missione in corso: azione non disponibile fino al risultato». **`extensions` = `{ code: 'MISSION_IN_PROGRESS' }`**, nessuna chiave in più (provato).

**Precedenza parziale (finding A-02, lasciato per ruling):** D-23 garantisce la precedenza ai soli cinque codici `QUEST_IN_PROGRESS`, `QUEST_SLOT_BUSY`, `AWAITING_AID`, `CHARACTER_IMPRISONED`, `TRAVEL_IN_PROGRESS`, e la rispetta. Alcuni rifiuti minori controllati più avanti escono **dopo** `MISSION_IN_PROGRESS`: per esempio `PET_NOT_OWNED` su `equipPet` e la città del negozio (`SHOP_NOT_IN_CITY`) su `doTransaction`. Un personaggio bloccato riceve `MISSION_IN_PROGRESS` anche quando l'azione sarebbe comunque fallita per quei motivi.

**Corsa accettata (D-23):** la guardia legge e poi scrive; un avvio che fa commit nei millisecondi fra controllo e scrittura non è visto. Scelta dichiarata (un blocco persistito sul personaggio avrebbe molti punti di rilascio e il rischio di blocchi eterni).

---

## 4. Subscription

- **`characterUpdated`** porta i due booleani aggiornati (N-11): all'avvio di una solitaria all'arrivo, all'avvio del party, **all'avvio e allo scarto della bozza** (senza scritture sul personaggio: publisher sul marcatore delle PendingQuest, `MissionDraftLockPublisher`, che ripubblica ogni titolare delle corsie GM) e all'esito (il completamento scrive i personaggi; a fine missione normale la corsia a null porta il flag a `false`). Se il token di ripresa del change stream esce dall'oplog (storia persa), il publisher ripubblica tutti i titolari attivi delle corsie GM (fix A-01): nessun avviso resta appeso.
- **`pendingRequestsUpdated`** riemette la coda dell'oste all'avvio e allo scarto della bozza, con `missionDraftStartedAt` valorizzato o null (N-4); alla cancellazione delle PendingQuest come oggi (N-13).
- **Bozza e simulazioni non arrivano mai ai giocatori** (D-10): nessuna subscription della bozza, nessun campo della bozza su tipi letti dai giocatori, il marcatore della PendingQuest fuori dal filo di `PendingQuest`.

---

## 5. Comportamenti provati

Percorsi relativi al repo BE; titoli dei casi copiati.

- Lista dei nemici di zona e città nella fascia, leggendari solo per la worldMission (D-03, D-19): `src/quests/guided/mission-enemy-pool.spec.ts`; sul filo «lists the ruins and city enemies of the mage band plus the legendaries (D-03, D-19)», «lists the whole bestiary with show all (D-03)», «offers no legendary for a story (D-03)», «reads the place of the first participant without a draft (D-01)» in `src/quests/guided/guided-mission.resolver.int-spec.ts`.
- Ripiego sui nemici che vivono ovunque e ordine stabile (D-19): «falls back to anywhere enemies when the zone is empty (D-19)», «orders by xp, then name, then id (D-19)» in `mission-enemy-pool.spec.ts`.
- Avvio idempotente, una bozza per gruppo, precompilazione del blocco (D-18, D-22): «starts one draft for the whole world mission from any entry (D-18)», «keeps one draft under two concurrent starts (D-18)», «prefills each participant with the block of their title (D-22)» in `src/quests/guided/mission-draft.service.int-spec.ts`; `src/quests/guided/mission-draft-prefill.spec.ts`.
- Avvio rifiutato con una corsia standard occupata (D-23): «refuses to start while a participant has a busy standard lane (D-23)» in `mission-draft.service.int-spec.ts`.
- Ripresa da ogni PendingQuest del gruppo e bozza orfana cancellata (D-09): «reads the draft from any pending quest of the group and null without one (D-09)», «drops an orphan draft whose pending quests are gone (D-09)» in `mission-draft.service.int-spec.ts`.
- Scarto che libera i partecipanti anche senza documento (D-11): «discards the draft and frees the participants (D-11)», «clears the markers even without a draft document (D-11)» in `mission-draft.service.int-spec.ts`.
- Bozza mai servita a un giocatore e audit delle sole mutation (D-10, D-26): «never serves the draft to a player (D-10)», «audits the draft mutations and not the read (D-26)» in `guided-mission.resolver.int-spec.ts`; matrice di autorizzazione con 19 handler dell'oste in `test/authz/`.
- Simulazione senza scritture e senza tiri condivisi (D-04): «simulates a fight without writing characters, quests or results (D-04)», «draws only from the simulation chance (D-04)» in `src/quests/guided/mission-simulation.service.int-spec.ts`.
- Secondo scontro dallo stato corretto del primo, limiti serviti (D-02, D-17): «starts the second fight from the corrected state of the first (D-02)», «serves the start of the fight and the simulated effects (D-17, D-21)» in `mission-simulation.service.int-spec.ts`; «serves the bounds at the start of a fight (D-06, D-17)» in `src/quests/guided/fight-state.spec.ts`.
- Ordine degli scontri, tetti e rilancio (D-24, D-05): «refuses a fight before the previous one is simulated (D-24)», «refuses an enemy list over the caps of a fight (D-24)», «voids the following simulations when a fight is rerun (D-05, D-24)» in `mission-simulation.service.int-spec.ts`.
- Compagno nel contesto del combattimento (D-20): «hands the equipped companion to the engine (D-20)» in `mission-simulation.service.int-spec.ts`; «ignores the companion and draws the same sequence (D-20)» in `src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts`.
- Invalidazione a valle al cambio dei nemici, zero scontri (D-24): «keeps the simulations of an unchanged prefix (D-24)», «voids a fight whose enemies changed and the following ones (D-24)», «saves a draft with no fights (D-24)» in `src/quests/guided/mission-draft-save.service.int-spec.ts`; `src/quests/guided/draft-invalidation.spec.ts`.
- Correzioni nei limiti dello stato a inizio scontro, ferite di prima intoccabili, non elencati al simulato (D-06, D-14): «corrects a fight within the bounds at its start (D-06)», «refuses a correction out of bounds (D-06)», «refuses a correction that adds an injury the character already had (D-14)», «reverts an unlisted character to the simulated effect (D-06)», «voids the following simulations when a fight is corrected (D-24)», «refuses corrections on an unsimulated fight (D-24)» in `mission-draft-save.service.int-spec.ts`.
- Last-write-wins e passi in qualunque ordine (D-18): «keeps the last write of two devices (D-18)», «saves the step and the place in any order (D-18)» in `mission-draft-save.service.int-spec.ts`.
- Premi rivalidati, monete e xp liberi fino al tetto tecnico, cura solo dal blocco, blocco grande salvato invariato (D-07, D-15, D-22, D-31): «saves a prize inside the rank filter with free coins and xp (D-07, D-15)», «refuses a prize outside the rank filter (D-07, D-22)», «refuses a cure the block does not have and a quantity over 99 (D-15, D-22)», «caps every coin and the xp at the technical ceiling (D-15, D-31)», «saves unchanged a prefilled block with more than 50 distinct items (D-22)», «replaces the prize of the listed character only (D-18)» in `mission-draft-save.service.int-spec.ts`; `src/quests/guided/mission-draft.inputs.spec.ts`.
- Catalogo dei premi per titolo (D-07, D-22): `src/quests/guided/mission-prizes.spec.ts`; «serves the block and the filtered catalogue of a mage (D-07, D-22)», «serves no catalogue spell to a paladin (D-07)» in `guided-mission.resolver.int-spec.ts`.
- Completamento in una transazione, sempre `gmCompleted`, senza tiri (D-05, D-07, D-08): «writes the corrected state, the merged enemies, the knowledge and the chosen prizes in one transaction (D-07, D-08)», «completes a lost simulation as a gm completion with no aid (D-05)», «never draws from the shared chance (D-08)», «delivers the result sheet as today (D-08)» in `src/quests/guided/guided-completion.service.int-spec.ts`.
- Story narrativa senza scontri (D-24): «completes a narrative story with prizes only (D-24)» in `guided-completion.service.int-spec.ts`.
- Rivalidazione al completamento (D-06, D-07, D-14, D-31): «refuses a prize no longer allowed without writing (D-07)», «refuses a corrected effect that adds an injury owned before the fight (D-14, D-31)», «refuses a corrected life above the maximum (D-06)», «passes through a simulated injury the character already owns (D-14)» in `guided-completion.service.int-spec.ts`.
- Bozza scritta dopo la lettura e completamento concorrente (D-18, D-25): «refuses a draft saved after the completion read it, without writing (D-18, D-25)», «lets one of two concurrent completions win, with one result per seat (D-08, D-25)» in `guided-completion.service.int-spec.ts`.
- Bozza cancellata e blocco rilasciato al completamento; `completePendingRequest` cancella la bozza (D-11, D-25): «deletes the draft and frees the participants (D-11, D-25)» in `guided-completion.service.int-spec.ts`; «deletes the guided draft of the request in its transaction (D-25)» in `src/quests/outcomes/gm-completion.service.int-spec.ts`.
- Flusso completo sul filo (D-08, D-25): «completes the whole guided flow over the wire (D-08, D-25)» in `guided-mission.resolver.int-spec.ts`.
- Predicato unico del blocco (D-12, D-18, D-23): `src/characters/mission-lock/mission-lock.spec.ts`, `src/characters/mission-lock/mission-lock.reader.int-spec.ts` («locks a character whose standard mission has started (D-12)», «keeps free a character travelling to the quest (D-12)», «ignores a story accepted without a draft (D-12)»).
- Equip, compagno e magie rifiutati in missione, liberi in viaggio, nessun bypass dell'oste, nessuna chiave extra (D-11, D-12, D-23): `src/characters/mission-lock/character-mutations-lock.int-spec.ts`.
- Pozioni (D-11, D-12, D-23): «refuses a potion while the hunt waits on the marker (D-12)», «refuses a potion during a guided draft (D-11)», «allows a potion while travelling to the quest (D-12)» in `src/characters/items/use-item.int-spec.ts`; precedenza in `src/characters/items/item-use.plan.spec.ts`.
- Negozio (D-11, D-12, D-23): «refuses a purchase while the hunt waits on the city marker (D-12)», «keeps the prison refusal first (D-23)», «refuses a mission before the city check (D-23)» in `src/economy/trade/do-transaction.int-spec.ts`.
- Viaggio e anteprima (D-11): «refuses to start a travel during a guided draft without writing (D-11)» in `src/travel/travel.service.int-spec.ts`; teleport dell'oste libero in `src/travel/teleport.resolver.int-spec.ts`.
- Accettazioni (D-13, D-23): «refuses a story while the standard quest has started (D-13)», «refuses a standard quest during a guided draft of a world mission (D-13)», «keeps the existing refusals first (D-23)», «refuses a new registration to a world mission with an open draft (D-23)», «refuses the quest travel preview during a mission (D-23)» in `src/quests/acceptance/quest-acceptance.service.int-spec.ts`.
- Ferito in attesa di soccorso libero, cancellazione permessa (D-23): «answers free for a wounded character awaiting aid (D-23)» in `src/characters/mission-in-progress.int-spec.ts`; «allows a wounded character awaiting aid to change the equipment (D-23)» in `character-mutations-lock.int-spec.ts`; «archives a character locked by a mission in progress (D-23)» in `src/characters/deletion/character-deletion.resolver.int-spec.ts`.
- Campi risolti ed emissioni (D-16, D-23): `src/characters/character-status.resolver.spec.ts`; «emits the lock when a solo quest starts on arrival (D-16)», «emits the lock when the party starts (D-16)», «emits both flags when a guided draft starts and ends (D-23)», «emits the release when a normal mission ends (D-23)», «answers the flags on the character query (D-16)» in `mission-in-progress.int-spec.ts`; recupero della storia persa in `src/characters/mission-lock/mission-draft-lock.publisher.spec.ts`.
- Coda dell'oste riemessa ad avvio e scarto (N-4): `src/quests/pending-requests/mission-draft-queue.refresher.spec.ts`, caso del marcatore in `src/quests/pending-requests/pending-requests.resolver.int-spec.ts`.
- SDL al boot reale (D-17): casi `(D-17)` di `test/app.int-spec.ts`.

---

## 6. Dati a DB e piano di UAT su device

Per l'orchestratore e l'utente. Le semine si fanno con uno script **fuori dal repo** (D-36), con lo stesso formato che scrive il BE; qui solo la forma. Segnaposto: `<poiId>`, `<itemId>`, `<petId>`, `<spellId>`, `<enemyId>`, `<characterId>`, `<questId>`, `<pendingQuestId>`.

### (a) worldMission (collection `quests`)

- `infos`: `title` (testo), `type: 'worldMission'`, `markerLocation: <poiId>` di un marker di città (POI con `city` fra i tipi), `enemies: []`, `timeToComplete: null`, `relatedLore: []`, `description` (testo).
- `requirements`: `minTitle: 'paladin'`, `requiredAdventurers: [{ title: 'mage', count: 1 }, { title: 'paladin', count: 1 }]` (nessun posto senza titolo), `requiredPoints`: intero valido (`1..MAX_QUEST_POINTS`, obbligatorio per le corsie GM), `recommendedLoot: []`.
- `prizes`: premio unico (`prizeCoins { gold, silver, copper }`, `xpPrize`, `prizeItem`, `randomLoot: []`, `spell: null`, `pet: null`, `cure: null`) e `rankPrizes` con due blocchi:
  - `{ title: 'mage', prizeCoins { gold, silver, copper }, xpPrize, prizeItem { itemType: 'LootItem' | 'EquipmentItem', item: <itemId>, quantity ≥ 1 }, randomLoot` di almeno due voci `{ itemType, item: <itemId>, quantity }`, `spell: <spellId>` (solo nel blocco mage), `pet: <petId>` o null, `cure: null` o `{ lifePointsShare, canHeal: [...] } }`;
  - `{ title: 'paladin', …` stessi campi, `spell: null`, `pet: <petId>` o null, `cure` con una cura per provare il premio `cure` `}`.
- `registeredAdventurers: []`, `concludedAt: null`, `startedAt: null`, `generated: false`.

### (b) story (collection `quests`)

- `infos.type: 'story'`, `markerLocation` di un marker di città (la story si accetta da qualunque città), `enemies: []`, `timeToComplete: null`, `relatedLore: []`, `description`.
- `requirements.minTitle` = **titolo esatto** del personaggio di prova (la story richiede il titolo esatto), `requiredAdventurers: []`, `requiredPoints` valido, `recommendedLoot: []`.
- `prizes` = premio unico (nessun `rankPrizes`); stessi campi di `concludedAt`, `startedAt`, `generated` della worldMission.

### (c) nemico leggendario

- Un nemico con `legendary: true` e `locations` **concrete** che coincidano con i tipi del POI interno scelto per la UAT (o con `city`). Controllo della semina (I5): i leggendari compaiono nella lista solo se a DB hanno `locations` che coincidono coi tipi del POI o con `city`; un leggendario con habitat `all` non compare se la zona ha altri nemici.

### Prerequisiti

- Build dalla HEAD della fase e riavvio del BE dal ramo, a cura dell'orchestratore; nessun migratore.
- FE Phase 21 installata sul device dell'oste e su almeno un device giocatore.
- Due personaggi di prova: un mage e un paladin (titoli coerenti coi blocchi), con almeno una pozione, una magia attiva e un compagno equipaggiato.

### Passi (uno per messaggio)

1. I due personaggi (mage, paladin) accettano la worldMission dalla città del marker.
2. L'oste avvia il flusso dalla Locanda → sui telefoni dei giocatori compare «Missione in corso» **senza toccare nulla**; viaggio, negozio, equip, pozione e accettazione di un'altra quest sono rifiutati con il banner della FE.
3. L'oste teletrasporta il gruppo su un POI interno (passo 1 del wizard).
4. Lista dei nemici: il leggendario seminato è presente; due scontri simulati in sequenza; rilancio del secondo (cambia il verdetto o i numeri, il primo resta).
5. Correzioni: vita cambiata, una ferita aggiunta dal motore tolta, una pozione usata; tentativo di togliere una ferita che il personaggio aveva prima → rifiutato.
6. Premi: togliere una voce del blocco, aggiungerne una dal catalogo, cambiare monete e xp (al massimo 7 cifre).
7. Chiudere il wizard e riprenderlo da un altro dispositivo dell'oste: stessa bozza, stesso passo.
8. Completamento → ai giocatori arriva il foglio dell'esito coi nemici dei due scontri; l'avviso «Missione in corso» cade.
9. Story narrativa: avvio, nessuno scontro, solo premi, completamento.
10. Scarto di una bozza (avvio di una nuova worldMission o story e «Scarta la bozza») → i partecipanti tornano liberi senza toccare nulla; il teleport resta.
11. Blocco di una missione normale: una hunt nel tempo d'attesa sul marker → equip, pozione, negozio rifiutati; durante il viaggio verso la quest gli stessi sono permessi.

### Diagnosi suggerita

Lettura della collection `missiondrafts` (bozza per gruppo, `fights`, `prizes`), del campo `missionDraftStartedAt` delle PendingQuest dei partecipanti (presente durante il flusso, null dopo scarto, PendingQuest sparite dopo il completamento) e dei `QuestResult` scritti (`gmCompleted`, `enemies` fusi). Nessuna variabile d'ambiente da leggere.

---

## 7. Domande aperte e deviazioni

**Risposte alle voci N della FE non già coperte sopra:**
- **N-1:** coperto da `CharacterStatus.missionInProgress` (§3), risolto su ogni percorso che legge il personaggio, `characterUpdated` compreso.
- **N-2:** coperto (§3), con la precedenza per operazione.
- **N-9:** nessun campo versione sul filo; last-write-wins. L'unico controllo di revisione è interno al completamento (`OUTCOME_OVERRIDE_INVALID` se la bozza è cambiata dopo la lettura: la FE rilegge e riprova).
- **N-12:** `teleportCharacter` resta permesso; un personaggio su un POI interno, a missione conclusa, può ripartire col viaggio libero (il pianificatore parte da qualunque POI). Negozio e Tabellone restano chiusi lì per la regola FE di oggi.
- **N-13:** coperto (§2 `completeGuidedMission`, §4).
- **N-14:** zero scontri ammessi (story narrativa: solo premi).
- **N-15:** convivenza di `completePendingRequest` fino alla merge della FE Phase 21; nella sua transazione cancella la bozza.

**Scelte del planner e ruling:**
- Tetti tecnici (§2), accettati in D-31; tetto di 9 999 999 su monete e xp aggiunto dalla review (B-03), tecnico e non di prodotto.
- Precompilazione della magia del blocco anche per un non caster: la voce del blocco è sempre ammessa; l'apprendimento resta governato da `canLearnSpell` al completamento.
- Correzioni dei personaggi non elencati che tornano all'effetto simulato.
- Premi fusi per personaggio a ogni salvataggio.
- Tetto largo di 500 voci per i premi al posto di 50 (ruling W2), con il tetto di 50 solo sulle correzioni.
- Controllo delle ferite di prima solo sugli effetti corretti; gli effetti simulati passano da `woundsAfter` (ruling W5).
- Piano del compagno (D-20) anticipato prima della simulazione.
- Precedenza parziale di `MISSION_IN_PROGRESS` sui rifiuti minori (A-02, §3), lasciata per ruling.

**Fuori scope:** D-27 — le PendingQuest delle corsie GM dei personaggi archiviati non vengono mai cancellate (`archived-character-queue.refresher.ts`, `gm-completion.service.ts`); annotato in STATE fra le domande aperte, da decidere in una fase o quick successiva.

**Deviazioni e casi verdi al primo colpo (dai SUMMARY):**
- Matrice di autorizzazione allargata a ogni handler nuovo (14 → 18 righe HTTP, 19 handler dell'oste): correzioni Rule 1 fuori dai file dei piani.
- Pin dei decoratori degli input (`src/validation/input-decorators.spec.ts`) rosso dal piano 13 e chiuso nel gate (sei input registrati).
- Funzione dei tetti dei nemici esportata e poi spostata accanto agli altri tetti (B-04).
- Casi del completamento sulle correzioni (ferita di prima, consumabili, magie, vita sopra il massimo) e del doppio completamento verdi al primo colpo: comportamento già presente, provato togliendo la validazione.
- Confini del blocco (ferito in attesa di soccorso, cancellazione, fine missione normale) verdi al primo colpo (A-05).
- Invariante D-25 sulla spec di `gm-completion.service.int-spec.ts`: una riga tolta è l'import di mongoose riscritto, nessuna asserzione rimossa (falso positivo del gate).

**Domande per la FE:** nessuna.

## Note dopo la verifica e l'audit (2026-11-14)

- Ogni scontro salvato o simulato deve avere **almeno un nemico** (lista vuota → `OUTCOME_OVERRIDE_INVALID`); la missione può invece avere zero scontri (D-24).
- Corsa accettata (`22-SECURITY.md` UF-22-02): un'iscrizione a una worldMission arrivata nello stesso istante di `startMissionDraft` può lasciare un iscritto fuori dalla bozza; `completeGuidedMission` rifiuta con `OUTCOME_OVERRIDE_INVALID` senza scritture finché l'oste non scarta la bozza e la riavvia.
- Una bozza rimasta orfana dopo l'abbandono della quest da parte di un giocatore si cancella alla prima lettura (`missionDraft`).
- Il log di audit registra gli argomenti completi delle cinque mutation (anche l'intero `SaveMissionDraftInput`): nessun segreto, ma cresce a ogni salvataggio (UF-22-01).
- Suite completa con coverage sul ramo dopo le correzioni della review: 449 suite, 6278 test, uscita 0 (2026-11-14).
