# BACKEND-NOTES — Phase 21 Premi per rango e soccorsi (handoff per la FE Phase 20, la FE Phase 21 e la UAT)

- **Fase BE:** 21-premi-per-rango-e-soccorsi (requisiti BE-RANKP-01..06; decisioni D-01..D-30 in `21-CONTEXT.md`, D-18..D-30 nella sezione «Aggiunte dopo la ricerca»; nomi interni fissati in `21-REPO-RULES.md`). **Companion:** FE Phase 20 «rank-specific prizes for group quests» (consuma `Quest.prizes` per viewer e i turni sugli esiti); la FE Phase 21 (passo dei premi dell'oste) leggerà `Quest.rankPrizes`.
- **Data:** 2026-11-13. Scritto dopo il gate 21-13 e dopo i fix della code review (`21-REVIEW.md`, `21-REVIEW-FIX.md`: 22 corretti, 1 `not_needed`, 0 saltati, 26 commit di fix da `2e1bd86a` a `9f820dfb`); descrive il codice della HEAD del ramo (`9f820dfb` più i soli commit di documentazione).
- **Branch:** `feat/21-premi-per-rango-e-soccorsi` → PR verso `develop` a cura dell'orchestratore, dopo il riavvio reale del BE dal ramo e la UAT su device (§6).
- **Gate dopo i fix:** `npx tsc --noEmit` 0 su `tsconfig.json` e `tsconfig.build.json`; unit 281 suite / 3 745 test; integration 144 suite / 2 106 test (`src/quests/outcomes` 14 / 199, resto di `src/quests` 24 / 390, `src/characters` 23 / 390, `src/travel` 12 / 244, resto di `src/` 54 / 609, `test/` 17 / 274 col boot reale); coverage di `./src/quests/acceptance/` 99,08 / 92,87 / 99,74 (statements / branches / lines, soglie 97 / 91 / 98) e di `./src/quests/generation/` 98,9 / 88,73 / 99,68 (soglie 96 / 82 / 97); `src/schema.gql` con sole aggiunte rispetto a `1f9db973` (15 righe), `package.json` senza diff. `npm run test:cov` completo: lanciato dall'orchestratore. Verifica (`21-VERIFICATION.md`) e audit di sicurezza (`21-SECURITY.md`): in arrivo, dopo questo piano.
- **Nessuna** variabile d'ambiente nuova, dipendenza nuova, migrazione, seeder o one-off (D-28).
- **Fonte:** ogni nome, percorso, titolo di caso e testo di log è copiato dal codice (`src/quests/prizes/`, `src/quests/outcomes/`, `src/quests/outcomes/aid/`, `src/quests/outcomes/dungeon/`, `src/quests/generation/`, `src/quests/party/`, `src/quests/maintenance/`, `src/characters/deletion/`). **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Cambio solo additivo (D-22):** nessun campo tolto, nessun tipo rinominato, nessun argomento nuovo su `quests`, nessun codice d'errore nuovo.
2. **`Quest.prizes` è ora il blocco del titolo del viewer** (stesso nome, stesso tipo `QuestPrizes!`, stessi sotto-campi): il BE sceglie il blocco sul titolo del personaggio corrente del bearer, su HTTP e per ogni subscriber WS. La FE non sceglie, non fonde e non scala nulla.
3. **`Quest.rankPrizes: [QuestRankPrizes!]!`** (nuovo): tutti i blocchi per titolo di una quest di gruppo, per la FE Phase 21; `[]` per solitarie e boss legacy. La FE Phase 20 non lo seleziona.
4. **Quattro campi nullable nuovi su `QuestResult`:** `turnsTotal`, `turnsCompleted`, `lastTurn` (1-based, ultimo turno giocato), `lastTurnKind: DungeonTurnKind` (`exploration` | `fight`); valorizzati solo per la dungeon e per i soccorritori e i morti di un'aid di dungeon (matrice in §3).
5. **Semantica cambiata, forma no:** `stagesCleared` / `stagesTotal` ora sono valorizzati anche per i soccorritori di un'aid di dungeon (D-21); il foglio di un'aid di dungeon mostra già la quota del premio (D-20); una sconfitta senza aid scrive `outcome` = `failure` come lo scontro di guardia perso (D-19).

---

## 1. SDL aggiunto (verbatim)

Blocchi copiati da `src/schema.gql` (ordine alfabetico, come lo emette Apollo con `sortSchema`):

```graphql
enum DungeonTurnKind {
  exploration
  fight
}

type Quest {
  id: ID!
  infos: QuestInfos!
  noEffect: Boolean!
  prizes: QuestPrizes!
  rankPrizes: [QuestRankPrizes!]!
  registeredAdventurers: [QuestRegistration!]!
  requirements: QuestRequirements!
}

type QuestRankPrizes {
  prizes: QuestPrizes!
  title: String!
}

type QuestResult {
  acknowledgedAt: DateTime
  ambush: AmbushReport
  arrested: Boolean!
  character: ID!
  coinsLost: Coins
  consumablesUsed: [AssetQuantity!]!
  enemies: [QuestEnemy!]!
  guardEncounter: Boolean!
  hpAfter: Int!
  hpBefore: Int!
  id: ID!
  injuriesAdded: [InjuryType!]!
  injuriesHealed: [InjuryType!]!
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
  spellLearned: Spell
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

- **Prova:** `git diff 1f9db973 -- src/schema.gql` (`1f9db973` = `develop` al riallineamento del ramo, Phase 20 compresa) mostra 15 righe aggiunte e 0 tolte: l'enum, la riga `rankPrizes`, il tipo `QuestRankPrizes`, le quattro righe dei turni in `QuestResult`. `git diff --exit-code src/schema.gql` esce 0 dopo il boot reale (`test/app.int-spec.ts`, che rigenera lo schema; casi `adds the rank prize blocks to the schema (D-22)` e `adds the dungeon turns to the schema (D-21, D-22)`).
- **Invariati (D-08, D-22):** `type QuestPrizes` (7 campi: `cure`, `pet`, `prizeCoins`, `prizeItem`, `randomLoot`, `spell`, `xpPrize`), `stagesCleared: Int`, `stagesTotal: Int`, `rewards: QuestRewards!`, `type QuestResultQuest` (`id`, `title`, `type: String!`).
- **Interni, mai sul filo:** `prizes.rankPrizes` a DB (`QuestRankPrize`, solo Mongoose, `src/models/quest/quest-rank-prize.model.ts`) e `rescue.turn { index, kind, total }` (`QuestRescueTurn`, `src/models/quest/quest-rescue.model.ts`): `rescue` resta un campo interno come prima.

---

## 2. Premi per titolo sul foglio

- **`Quest.prizes` per viewer (D-07, D-22):** `QuestPrizesResolver` (`src/quests/prizes/quest-prizes.resolver.ts`) risponde `prizeBlockFor(quest, titolo del personaggio corrente del bearer)`. Il titolo arriva da `ViewerVitalsService.of`, la stessa lettura memoizzata per viewer dentro la chiave dell'evento che serve `noEffect`: su `questUpdated` ogni subscriber riceve il blocco del proprio titolo e il payload condiviso non viene mai mutato. Nessun ramo sul ruolo: l'oste col suo personaggio vede come chiunque.
- **Una sola regola (D-04, D-18):** `prizeBlockFor` (`src/quests/prizes/rank-prizes.ts`) è l'unica funzione che sceglie il blocco, per il foglio e per la risoluzione (`planCombatant`, `GmCompletionService`). Decide il **titolo del personaggio**, non il titolo del posto. Ripiego D-18: se manca il blocco del titolo vale **il blocco più alto non superiore al titolo, altrimenti il più basso**; un legend seduto sui posti hero di un boss hero prende il blocco hero; chi apre il foglio **senza personaggio** vede il blocco del `minTitle`.
- **Solitarie e boss legacy (D-01, D-28):** `enemy`, `hunt`, `dungeon`, l'aid di una solitaria e i tipi senza registrazione hanno un premio unico calcolato sul `minTitle`: ogni vincitore riceve lo stesso premio, qualunque sia il suo titolo. I 12 boss a DB senza blocchi si leggono come premio unico = blocco del loro `minTitle` (nessun migratore).
- **`Quest.rankPrizes` (D-22):** tutti i blocchi validi nell'ordine in cui sono salvati (`{ title, prizes }`, il primo per titolo, titolo nel dominio di `TitleType`); `[]` per le solitarie e per i boss legacy. Lo leggerà la FE Phase 21 nel passo dei premi dell'oste.
- **Tipi coi blocchi:** `GROUP_PRIZE_TYPES` = `boss`, `worldMission`, `aid` (un'aid li ha solo se clonata da una quest di gruppo coi blocchi).
- **Magia (D-05b, D-25):** il cancello `isSpellCaster` sta in `canLearnSpell` / `drawLearnableSpell` e usa il titolo **dopo l'esito**: nessun rookie, adventurer o paladin impara una magia da nessun percorso (fissa, sorteggiata, completamento del GM). Una study di Valantar vinta da un non caster passa al ramo della lore dello studio, con gli stessi tiri. Un blocco sotto mage con una magia è segnalato dal report del boot.
- **«La mano vince» (D-06):** le quest generate ricevono i blocchi dalle tabelle; le quest scritte a mano (worldMission, boss ritoccati) li ricevono dall'utente a DB, senza semina né ripiego sulle tabelle. Per un tipo di gruppo con blocchi validi, la risoluzione e il foglio leggono i blocchi e ignorano i campi di oggi di `prizes`.
- **Report del boot (D-24):** passo di sola lettura dopo la migrazione dei nemici (`GroupPrizeReportService`, `src/quests/maintenance/`): per le quest di gruppo aperte con violazioni logga `Premi per titolo: missione <id> da correggere (<violazioni>)` fino a un tetto, poi `Premi per titolo: <n> quest di gruppo da correggere su <m>`. Violazioni: `nullSeat`, `seatWithoutBlock` (anche per una quest con posti a più titoli e nessun blocco valido; un boss a titolo unico senza blocchi resta muto, D-28), `spellBelowMage`, `invalidBlock` (voci di `rankPrizes` scartate dalla lettura: titolo non valido o ripetuto). Solo id e nomi delle violazioni.

---

## 3. Dungeon a turni, esiti e quota

- **Ritmo (D-12, D-29):** una dungeon è `esplorazione, scontro, esplorazione, scontro…`, due turni per gruppo di `enemies` (`dungeonTurnsOf`, `src/quests/outcomes/dungeon/dungeon-turns.ts`): 4 gruppi = 8 turni, le esplorazioni sono il 1°, 3°, 5°, 7°. Il tipo del turno viene dalla parità dell'indice 0-based (pari = esplorazione). La porta `DungeonResolver` ammette una sconfitta in qualunque turno (`failedTurn`); il segnaposto supera sempre l'esplorazione senza consumare tiri (una dungeon intera tira come prima). Il motore a turni vero è dell'utente (D-13).
- **Contratto della porta:** `checkedDungeonResolution` (chiamata da `questBattleOf`, `src/quests/outcomes/quest-battle.ts`) lancia `DungeonContractViolation` se una risoluzione lo viola (sconfitta senza `failedTurn`, indice fuori dai turni o oltre l'ultimo turno da giocare, tipo diverso dalla parità, `turnsCompleted` diverso dall'indice): la transazione abortisce. Il turno da salvare viene solo da `savedTurnOf`.

**Matrice dei turni** (T = turni dell'intera dungeon, i/f = indice 0-based del turno della caduta, s = indice del turno salvato sull'aid):

| Esito | `outcome` | `turnsTotal` | `turnsCompleted` | `lastTurn` | `lastTurnKind` |
|-------|-----------|--------------|------------------|------------|----------------|
| dungeon vinta | success | T | T | T | fight |
| dungeon persa | failure | T | i | i+1 | tipo di i |
| soccorritore che vince l'aid di dungeon | success | T | s+1 | s+1 | tipo di s |
| soccorritore che perde l'aid di dungeon | failure | T | f | f+1 | tipo di f |
| ferito liberato | rescued | null | null | null | null |
| ferito morto in un'aid di dungeon (soccorso perso o timeout) | death | T | s | s+1 | tipo di s |
| ogni altro esito (`gmCompleted`, sconfitta senza aid D-19, imboscata, quest senza dungeon, aid non di dungeon, dungeon senza nemici validi) | — | null | null | null | null |

- **Nota per la FE:** su `failure` e `death` la lettura è «caduto al turno `lastTurn` di `turnsTotal`»; `lastTurn` è già 1-based, la FE non aggiunge mai 1. Nessuna riga dei turni su `rescued` né sugli esiti dell'oste (`gmCompleted`).
- **Tappe (cambio di semantica, D-21):** `stagesCleared` / `stagesTotal` restano gli **scontri** (un gruppo = una tappa) e ora sono valorizzati anche per i soccorritori di un'aid di dungeon (prima erano null): per il soccorritore che salva al turno salvato `{ 3, fight, 8 }` → `turnsCompleted 4`, `turnsTotal 8`, `lastTurn 4`, `lastTurnKind fight`, `stagesCleared 2`, `stagesTotal 4`. Restano il ripiego della FE quando i turni mancano.
- **Quota del soccorritore (D-14, D-20, D-30):** unità = turni, quota `(indice + 1) / totale` del turno salvato (`rescueShareOf`, `src/quests/outcomes/aid/rescue-share.ts`): caduto al 5° turno di 8 (esplorazione, indice 4) → 5/8; caduto al 4° (scontro, indice 3) → 1/2. Monete (in rame), xp e quantità del `prizeItem` sono scritti **già in proporzione, per difetto, su `Quest.prizes` dell'aid alla nascita** (un `prizeItem` che scende a 0 diventa `null`); `randomLoot` e pet restano sull'aid e alla risoluzione la loro soglia di vittoria è moltiplicata per la quota, con gli stessi tiri. Magia e cura invariate (la cura non si eredita, Phase 18 D-23).
- **Catene:** una nuova aid ricalcola dall'originale col turno nuovo; se la sorgente è un'aid già scalata (originale cancellato, oppure aid di dungeon rimasta senza feriti e risolta come individuale) applica il rapporto delle quote: al più 1 rame / 1 xp di scarto per l'arrotondamento per difetto (due volte, mai per eccesso; scelta del planner I3).
- **Xp e conoscenze del soccorritore:** solo dei gruppi affrontati fino al turno salvato (`facedEnemyCountOf`).
- **Come riconoscere un'aid di dungeon (conferma richiesta dalla FE Phase 20):** sugli ESITI è corretto leggere `quest.type == aid` (cioè `QuestResult.quest.type`) + campi dei turni non null: l'aid perde il tipo d'origine e `rescue` non è sul filo. L'esito `rescued` ha i turni null, quindi lì non si distingue (e la FE non ne ha bisogno: nessuna riga dei turni su `rescued`). Sul FOGLIO della quest (`Quest`) non c'è nessun segnale sul filo: il foglio mostra già la quota in `prizes`, e la FE non deve fare altro.

---

## 4. Aid, sconfitte e boss

- **Aid per tipo (D-09):** solo una sconfitta in `enemy`, `boss`, `hunt`, `dungeon` o `aid` apre un soccorso (`opensAid` / `AID_OPENING_TYPES`, `src/quests/outcomes/aid/aid-opening.ts`).
- **Sconfitta senza aid (D-19):** una `heal`, `job`, `study`, `magic`, `crime` o `guard` persa in combattimento chiude con `planDefeatWithoutAid` (`src/quests/outcomes/defeat-without-aid.ts`): vita a 1, resta in città, corsia standard libera, ferite e consumi dello scontro tenuti, nessun premio, nessuna aid, `status.awaitingAid` assente, `guardEncounter` false, `arrested` false, `outcome` = `failure` — lo STESSO valore dello scontro con le guardie perso, quindi lo stesso foglio. Prova: `src/quests/outcomes/defeat-without-aid.spec.ts` «carries the same failure outcome as a lost guard encounter (D-19)».
- **Crime (D-09b):** l'arresto alla conclusione è invariato (10 ore di prigione, un quarto delle monete, nessun premio, nessuna aid); la crime persa in combattimento segue D-19.
- **Aid di gruppo (D-11):** l'aid di un boss perso clona i posti e i blocchi validi (il primo per titolo, via `rankBlocksOf`), ogni blocco senza cura; un'aid non eredita mai blocchi rimasti su una solitaria (premio unico).
- **Aid persa (D-10, D-26):** regola invariata (feriti originali morti, nuova aid per i soccorritori caduti, timer ripartito); la nuova aid nata da un'aid di dungeon salva il turno dove sono caduti i soccorritori, anche in esplorazione, col premio ricalcolato come al §3.
- **Aid di dungeon senza più feriti (fix della review C-WR-01):** un'aid col turno salvato resta un'aid di dungeon anche se il ferito viene archiviato a soccorso avviato: il soccorritore partito percorre i turni fino a quello salvato (contatori, tappe e xp dei soli gruppi affrontati) e, se perde, la nuova aid salva il turno della caduta e scala il premio dall'aid col rapporto delle quote. Una sola regola sceglie la battaglia: `questBattleOf` / `facedCatalogOf`.
- **Nessun blocco della dungeon (D-15):** con l'aid aperta la dungeon resta accettabile dagli altri; il salvato torna libero e può rifarla (D-12).
- **Boss misti (D-03, D-23):** 1 boss generato su 2 (`MIXED_BOSS_SHARE = 0.5`) ha da 1 a metà dei posti al titolo immediatamente inferiore, mai superiore; posti in ordine `[rango, inferiore]`, mai null; `minTitle` = titolo più basso dei posti (l'accettazione controlla il titolo prima dei posti); un blocco per titolo in `prizes.rankPrizes`, i campi di oggi uguali al blocco del rango del boss; i tiri nuovi in coda alla quest e solo per i boss; la copertura del generatore conta il boss sul titolo più alto dei posti.
- **Posto senza titolo (D-02, D-24):** un posto a titolo null in un `boss` o in una `worldMission` rende la quest non accettabile (`QUEST_NOT_ACCEPTABLE`, nessuna scrittura). Un boss con un posto senza titolo e iscritti registrati non parte e si scioglie alla scadenza delle 24 ore anche a posti pieni (corsie e PendingQuest liberate, `questCancelled`). Vale solo per il boss: una worldMission è della corsia dell'oste e avvio e timeout del party non la leggono.
- **Archiviatore (D-16, D-27):** quando l'archivio di un ferito conclude un'aid non avviata, i soccorritori iscritti e non partiti perdono corsia e PendingQuest nella stessa transazione, con la routine del timeout del party (`releaseRegisteredWithin`, `src/quests/party/registered-release.ts`); i chiamanti (cancellazione del personaggio, morte nel soccorso) mandano `questCancelled` **dopo** il commit. L'invio è best-effort: un push fallito diventa un WARN e non fa mai fallire una mutation o un job già committati. Il testo del push è quello del timeout (§7).

---

## 5. Comportamenti provati

Una voce per comportamento: decisione, spec (percorso e titolo verificati sulla HEAD).

- Magia solo ai caster col titolo dopo l'esito, in ogni percorso (D-05b, D-05c, D-25): `src/quests/outcomes/rewards/quest-rewards.spec.ts` «teaches a fixed spell only to a caster title (D-05b, D-25)»; `src/quests/outcomes/outcome-plan.spec.ts` «never teaches a spell to a rookie on any path (D-05b, D-05c)»; `src/quests/outcomes/study-spell-draw.int-spec.ts` «teaches the Valantar spell only to a caster (D-05b, D-25)».
- Lettura e scelta dei blocchi (D-01, D-04, D-18, D-28): `src/quests/prizes/rank-prizes.spec.ts` «reads a solo quest as one block on its minimum title (D-01)», «picks the block of the exact title (D-04)», «falls back to the highest block not above the title (D-18)», «reads a legacy boss without blocks as one block on its minimum title (D-28)».
- Ognuno vince il blocco del suo titolo, pet per blocco (D-04, D-05, D-05a): `src/quests/outcomes/boss-resolution.int-spec.ts` «gives each seat the block of its own title in a mixed boss (D-04, D-05, D-05a)»; cura del blocco: `src/quests/outcomes/outcome-plan.spec.ts` «heals with the cure of the character title block (D-05)».
- Solitaria = premio del `minTitle` per ogni vincitore (D-01): `src/quests/outcomes/quest-resolution.service.int-spec.ts` «gives the minimum title prize of a solo quest to any winner (D-01)».
- WorldMission coi blocchi scritti a mano (D-06, D-04): `src/quests/outcomes/gm-completion.service.int-spec.ts` «uses the hand written blocks of a world mission as they are (D-06, D-04)».
- `Quest.prizes` per viewer su HTTP e WS, ripiego senza personaggio e legend (D-07, D-18, D-22): `src/quests/quests.resolver.int-spec.ts` «shows each viewer the prize block of their title (D-07, D-22)», «shows the minimum title block to a viewer without a character (D-18)», «shows a legend the hero block (D-18)», «lists every rank block in its stored order (D-22)»; `src/quests/quest-updated.subscription.int-spec.ts` «resolves the prize block for each subscriber of the same quest event (D-07, D-22)».
- `QuestResult.rewards` invariato nella forma (D-08): `src/quests/results/quest-result.resolver.int-spec.ts` «keeps the rewards of each participant in the same shape (D-08)».
- SDL additivo al boot reale (D-21, D-22): `test/app.int-spec.ts` «adds the rank prize blocks to the schema (D-22)», «adds the dungeon turns to the schema (D-21, D-22)».
- Posto senza titolo rifiutato, riportato, sciolto alla scadenza (D-02, D-24): `src/quests/acceptance/quest-acceptance.service.int-spec.ts` «rejects a group quest with a seat without a title with QUEST_NOT_ACCEPTABLE and writes nothing (D-24)»; `src/quests/maintenance/group-prize.report.spec.ts` «reports an untitled seat of a boss or a world mission (D-02, D-24)»; `src/quests/maintenance/group-prize-report.service.int-spec.ts` «reports the open group quests and writes nothing (D-24, D-28)»; `src/quests/party/party-timeout.int-spec.ts` «disbands after 24 hours a boss with an untitled seat for %i taken by %i (D-24)», «keeps a party with an untitled seat within its 24 hours (D-24)»; `src/quests/party/quest-start.int-spec.ts` «starts no boss with an untitled seat, even with every seat taken (D-24)».
- Boss misti generati (D-03, D-23): `src/quests/generation/generation-rules.spec.ts` «mixes one boss out of two (D-23)»; `src/quests/generation/quest-generator.int-spec.ts` «generates mixed bosses with the lower title only (D-03, D-23)», «pins the draws of a mixed boss at the tail of its quest (A-IN-02, D-23)».
- Aid solo dai cinque tipi (D-09): `src/quests/outcomes/aid/aid-opening.spec.ts` «opens an aid only for enemy, boss, hunt, dungeon and aid (D-09)».
- Sconfitta senza aid a vita 1, `outcome` failure (D-19): `src/quests/outcomes/defeat-without-aid.spec.ts` «carries the same failure outcome as a lost guard encounter (D-19)»; `src/quests/outcomes/combatant-plan.spec.ts` «concludes a lost %s without aid at one life point (D-19)»; `src/quests/outcomes/quest-combat.int-spec.ts` «creates no aid for a lost job and leaves one life point (D-19)».
- Crime: combattimento perso senza aid, arresto invariato (D-19, D-09b): `src/quests/outcomes/crime-guard-conclusion.int-spec.ts` «leaves a lost crime fight at one life point without aid and never arrests (D-19, D-09b)», «keeps the crime arrest as it is: ten hours of prison, a quarter of the coins lost, no prize (D-09b)».
- Aid di gruppo coi blocchi senza cura (D-09, D-11): `src/quests/outcomes/boss-resolution.int-spec.ts` «opens an aid with the seats and the rank blocks of a lost boss (D-09, D-11)»; `src/quests/outcomes/aid/aid-quest.spec.ts` «clones the rank blocks of a group quest without their cure (D-11)», «does not inherit the blocks left on a solo quest (A-WR-02, D-01, D-11)».
- Turni della dungeon e porta col segnaposto senza tiri (D-12, D-13, D-29): `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts` «passes every exploration without drawing (D-29)»; contratto della porta: `src/quests/outcomes/quest-battle.spec.ts` (describe «questBattleOf dungeon port contract (C-WR-02, D-13)»).
- Matrice, riga «dungeon vinta» (D-21): `src/quests/outcomes/quest-dungeon.int-spec.ts` «writes the turn counters of a cleared dungeon (D-21)».
- Matrice, riga «dungeon persa» e turno salvato sull'aid (D-12, D-13): `src/quests/outcomes/quest-dungeon.int-spec.ts` «saves the fight turn of the defeat on the aid (D-12)», «saves an exploration turn of the defeat on the aid (D-12, D-13)».
- Matrice, riga «soccorritore che vince» (D-12, D-21): `src/quests/outcomes/dungeon-aid.int-spec.ts` «walks the rescuer through the turns up to the saved one (D-12, D-13)», «writes the turns of a rescuer who wins a dungeon aid (D-21)».
- Matrice, riga «soccorritore che perde» e aid persa (D-10, D-26): `src/quests/outcomes/dungeon-aid.int-spec.ts` «applies the lost aid rule and saves the turn where the rescuers fell (D-10, D-26)», «saves the exploration turn where the rescuers fell (C-IN-04, D-26, D-29)»; `src/quests/outcomes/quest-battle.spec.ts` «saves the turn of the fall on the total of the saved turn (D-26)».
- Matrice, righe «ferito liberato» e «ferito morto» (D-21): `src/quests/outcomes/rescue-plan.spec.ts` «writes where the wounded fell on a death in a dungeon aid (D-21)», «leaves the turns null on a rescued wounded (D-21)»; timeout: `src/quests/outcomes/dungeon-aid.int-spec.ts` «writes where the wounded fell on a death by aid timeout (D-21)».
- Matrice, riga «ogni altro esito» (D-21): `src/quests/outcomes/quest-dungeon.int-spec.ts` «keeps the turn counters null for an enemy quest (D-21)»; `src/quests/outcomes/rescue-plan.spec.ts` «leaves the turns null on a death outside a dungeon aid (D-21)»; l'aid senza turno resta sul combattimento unico: `src/quests/outcomes/dungeon-aid.int-spec.ts` «keeps an aid without a saved turn on the plain fight (D-13)».
- Salvato libero e dungeon aperta agli altri (D-12, D-15): `src/quests/outcomes/dungeon-aid.int-spec.ts` «frees the rescued wounded who can take the dungeon again (D-12)», «keeps the dungeon open to the others while its aid is open (D-15)».
- Quota del premio (D-14, D-20, D-30): `src/quests/outcomes/aid/rescue-share.spec.ts` «shares the prize by the completed turns (D-14, D-20)»; `src/quests/outcomes/rewards/cascading-loot.spec.ts` «scales the drop chance by the share with the same draws (D-20)»; `src/quests/outcomes/combatant-plan.spec.ts` «scales the pet chance of a dungeon aid rescuer (D-20)»; `src/quests/outcomes/aid/aid-quest.spec.ts` «writes the shared prize on a dungeon aid at birth (D-20)», «rescales an already shared aid by the ratio of the shares (D-20)»; `src/quests/outcomes/dungeon-aid.int-spec.ts` «rescues a dungeon lost on the fifth turn with five eighths of the prize (D-14, D-20, D-30)», «rescues a dungeon lost on the fourth turn with half of the prize (D-14, D-20, D-30)», «rolls the loot of a dungeon aid with the shared chances (D-20)».
- Aid di dungeon rimasta senza feriti a soccorso avviato (C-WR-01, D-12, D-21, D-26): `src/quests/outcomes/dungeon-aid.int-spec.ts` (describe «a dungeon aid left without wounded after the start») «walks the rescuer through the turns up to the saved one (C-WR-01, D-12, D-21)», «saves the turn of the rescuer who falls on the next aid (C-WR-01, D-20, D-26)».
- Turno salvato malformato: WARN, combattimento di oggi (C-IN-02): `src/quests/outcomes/dungeon-aid.int-spec.ts` «warns once with ids only about %s (C-IN-02, D-12)».
- Archiviatore che libera i soccorritori iscritti (D-16, D-27): `src/characters/deletion/character-archiver.int-spec.ts` «releases the registered rescuers of an aid it concludes (D-16, D-27)», «keeps the rescuers of a started aid it concludes (B-WR-04, D-27)», «keeps an aid with other wounded open and its rescuers registered (D-16)».
- `questCancelled` dopo il commit, best-effort (D-27): `src/characters/deletion/character-deletion.resolver.int-spec.ts` «cancels the quest of the rescuers released by a deletion (D-27)», «keeps a committed deletion when the cancellation push fails (B-IN-04, D-27)», «sends no push when the deletion releases nobody (D-27)».

---

## 6. Dati a DB e piano di UAT su device

Per l'orchestratore e l'utente, **dopo** questo piano, insieme alla FE Phase 20 (piani 20-03 e 20-04): **stato «da eseguire»**, nessun esito registrato qui. Nessun esecutore lo esegue né tocca il DB reale; le semine si fanno con script FUORI dal repo, con lo stesso formato che scrive il BE (D-36 delle fasi precedenti: nessun file di contenuto nel repo).

**Prerequisiti**

- Riavvio del BE dal ramo a cura dell'orchestratore (build a BE fermo: `deleteOutDir` cancella `dist/`), dalla HEAD della fase; app costruita dal ramo della FE Phase 20 con le selezioni dei turni (piano 20-03).
- **Nessun migratore, nessun seeder (D-28):** i 12 boss a DB restano col premio unico e si leggono come blocco del loro `minTitle`.
- **D-17:** 0 aid a DB dopo la pulizia fatta nel discuss del 2026-11-12 (3 aid avanzi delle UAT, backup EJSON nello scratchpad di quella sessione, cancellate su ordine dell'utente). Nessuna aid vecchia interferisce: le aid della UAT nascono dalle sconfitte dei passi qui sotto.
- Identità di test `<twitchId di test>` (almeno due utenti), personaggi `<characterId>`, quest `<questId>`; mai valori reali in questo file.

**Dati da seminare (orchestratore)**

- **Boss misto con iscritti:** un `boss` con `requirements.requiredAdventurers` = `[{ title: mage, count: 1 }, { title: paladin, count: 1 }]` (ordine `[rango, inferiore]`), `requirements.minTitle` = `paladin`, e `prizes.rankPrizes` con due blocchi diversi (`{ title: mage, … }`, `{ title: paladin, … }`, campi del blocco come `QuestRankPrize`: `prizeCoins`, `xpPrize`, `prizeItem`, `randomLoot`, `pet`, `spell`, `cure`), i campi di oggi di `prizes` uguali al blocco mage; due personaggi di test, uno mage e uno paladin, in grado di vincere; un terzo utente senza personaggio per il foglio del `minTitle`.
- **Dungeon per l'aid a un turno salvato:** una `dungeon` da 4 gruppi in `enemies` col premio leggibile a metà (monete, xp e una quantità pari di `prizeItem`), dove il personaggio di test vince il primo gruppo e perde il secondo (scontro al 4° turno → `rescue.turn { 3, fight, 8 }`). L'aid nasce dalla sconfitta vera, non va seminata a mano.
- **Secondo personaggio per il soccorritore:** un personaggio di un altro utente, abbastanza forte da vincere i primi due gruppi, nella città dell'aid.
- **Heal o job con nemici per la sconfitta senza aid:** una `job` (o `heal`) con `enemies` troppo forti per il personaggio di test.
- **Ferito con soccorritore iscritto per l'archiviatore:** un'aid non avviata (da una sconfitta del passo 3 o di una seconda dungeon) con un soccorritore registrato e non partito.

**Passi (uno per messaggio durante la UAT)**

1. **Foglio del boss misto.** Il viewer mage e il viewer paladin aprono il foglio: **atteso** blocchi diversi in «Ricompense» (ognuno il suo); l'utente senza personaggio vede il blocco paladin (`minTitle`).
2. **Vittoria del boss misto.** Lo stesso boss vinto da entrambi: **atteso** ognuno riceve il suo blocco in `QuestResult.rewards` (e il pet solo se il suo blocco ne ha uno e il tiro lo concede).
3. **Aid di dungeon a metà premio.** La dungeon da 4 gruppi persa al 4° turno (scontro: combattimento perso al secondo gruppo) apre un'aid: **atteso** foglio dell'aid con metà di monete, xp e oggetto fisso. Il soccorritore la accetta e vince: **atteso** esito con `turnsCompleted 4` / `turnsTotal 8`, `lastTurn 4`, `lastTurnKind fight`, `stagesCleared 2` / `stagesTotal 4`, metà premio in «Ricompense»; il ferito liberato riceve l'esito `rescued` senza riga dei turni e torna libero. La caduta in esplorazione non è riproducibile col segnaposto (l'esplorazione è sempre superata, D-29): è provata solo nelle spec.
4. **Job con nemici persa.** **Atteso:** vita 1, in città, nessuna aid creata, corsia libera, stesso foglio dello scontro di guardia perso (`outcome` `failure`, nessuna «attesa di soccorso»).
5. **Cancellazione di un ferito con un soccorritore iscritto.** L'utente del ferito cancella il personaggio: **atteso** l'aid si conclude, il soccorritore riceve il push `questCancelled` e ha la corsia libera (nessuna PendingQuest).
6. **Log del boot.** **Atteso:** report dei premi per titolo con soli id e conteggi (`Premi per titolo: …`), muto se nessuna quest di gruppo aperta viola le regole (i 12 boss legacy a titolo unico non sono violazioni).

**Diagnosi suggerita**

- A DB: `prizes.rankPrizes`, `requirements.requiredAdventurers` e `requirements.minTitle` del boss; `rescue.turn` e `prizes` dell'aid (quota già scritta); campi dei turni e `rewards` dei `QuestResult`; `status.awaitingAid` e corsia dei personaggi.
- Log del BE (solo id, conteggi, nome e codice d'errore):
  - `Premi per titolo: missione <id> da correggere (<violazioni>)`, `Premi per titolo: <n> quest di gruppo da correggere su <m>`;
  - `Missione <id> con un posto senza titolo (D-24): party sciolto alla scadenza`;
  - `Push questCancelled della missione <id> non inviata: <nome>, code <codice>`;
  - `Soccorso <id>: turno salvato non valido, combattimento unico contro tutti i gruppi`, `Soccorso <id>: turno salvato su <n> turni, i gruppi dell'aid ne contano <m>`.

---

## 7. Domande aperte e deviazioni

**Domande per la FE: nessuna.** Risposte alle domande della FE Phase 20 (§4 del suo `BACKEND-NOTES.md`):

1. `Quest.prizes` è non null su ogni percorso che restituisce un `Quest`; un parent arrivato senza `prizes` caricati (es. `PendingQuest.quest` non popolato) riceve un premio vuoto (campi null, `randomLoot` `[]`), mai un errore. Nei casi di gioco il ripiego D-18 vale sempre.
2. Risoluzione per subscriber su `questUpdated`: provata col caso a due subscriber di titolo diverso (§5); il passo 1 della UAT la conferma su device.
3. Boss misto: `minTitle` = titolo più basso dei posti, posti `[rango, inferiore]` (D-23). Confermato.
4. `lastTurn` 1-based, ultimo turno giocato; `turnsTotal` sulla dungeon vinta. Confermato (matrice §3).
5. Sull'esito `death` del ferito di un'aid di dungeon i turni SONO valorizzati (T, s, s+1, tipo di s); su `rescued` sono null. La FE non stampa la riga su nessuno dei due: nessun conflitto.
6. Sconfitta senza aid (D-19): `outcome` = `failure` e `status.awaitingAid` assente (nessuna «attesa di soccorso»).
7. D-24: `QUEST_NOT_ACCEPTABLE`, codice già esistente.
8. D-27: l'archiviatore manda lo stesso `questCancelled` del timeout, dopo il commit, best-effort.

**Domanda aperta per l'utente**

- **Testo del push dell'archiviatore:** il soccorritore liberato da una cancellazione o da una morte riceve il testo del timeout («Il gruppo non si è formato in tempo: la missione è stata annullata.»), come chiesto dal piano. **Deciso dall'utente il 2026-11-13:** alla domanda se volesse un testo dedicato per l'archivio ha risposto «No, va bene così»: il testo resta quello del timeout.

**Comportamenti cambiati dalla review (dichiarati qui, nessun effetto sul filo)**

- Aid col turno salvato rimasta senza feriti a soccorso avviato: il soccorritore percorre comunque i turni fino al salvato; se perde, la nuova aid salva il turno della caduta e scala il premio dall'aid col rapporto delle quote (per difetto due volte, mai per eccesso).
- Una risoluzione della porta che rompe il contratto abortisce con `DungeonContractViolation`; il turno da salvare viene solo da `savedTurnOf` (`rescueTurnFromStages` e `nextRescueTurnOf`, citati nei SUMMARY 09 e 10, non esistono più).
- L'aid clona solo i blocchi validi (primo per titolo) e mai da una solitaria.
- Un boss con un posto senza titolo e iscritti si scioglie alla scadenza delle 24 ore.
- `questCancelled` best-effort; `archiveWithin` rimosso, resta `archiveWithinReporting`.

**Limiti noti**

- Il WARN del membro legacy di `releaseMembersWithin` resta dentro la transazione (B-IN-03 `not_needed`: descrive un dato a DB, vero anche se la transazione si ripete).
- Una worldMission con un posto senza titolo resta alla corsia dell'oste (né avvio né timeout del party la leggono); l'accettazione la rifiuta comunque (D-24).
- Un'aid con un turno salvato malformato a DB resta sul combattimento unico, ora con WARN.
- Fuori scope (RESEARCH §Q11): un'aid **avviata** svuotata dall'archivio non libera soccorritori (sono già partiti); provato da «keeps the rescuers of a started aid it concludes (B-WR-04, D-27)».

**Deviazioni e scelte annotate durante l'esecuzione**

- **Motore a turni:** il segnaposto resta provvisorio per scelta (D-13); il motore vero dell'utente si collega via DI alla porta `DungeonResolver` (`src/quests/outcomes/dungeon/dungeon-resolver.ts`), rispettando il contratto imposto da `checkedDungeonResolution`, senza toccare il flusso.
- **Spec di comportamento cambiate per decisione:** D-19 — «opens the usual aid after a lost crime fight and never arrests» è diventato «leaves a lost crime fight at one life point without aid and never arrests (D-19, D-09b)» (21-05); D-25 — le spec con un non caster che imparava una magia sono passate a un mage (`outcome-plan.spec.ts`, `study-spell-draw.int-spec.ts`, `quest-resolution.service.int-spec.ts`, 21-01); D-24 — le spec che passavano da accettazione, avvio e timeout con posti null sono passate a posti a titolo, i jolly restano provati sull'aid (21-04); D-23 — le spec del generatore leggono il rango del boss con `coverageRankOf` (21-07).
- **Scelte del planner e dell'esecuzione (piani 01–12):** `QuestCure` spostata in `src/models/quest/quest-cure.model.ts` per un import circolare (21-02, SDL invariato); `rankPrizes` con default undefined (le quest senza blocchi non ricevono la chiave); la cura viaggia col blocco tirato in `DrawnRewards.cure` (21-03); una sola regola del posto a titolo, `hasUntitledGroupSeat`, condivisa da accettazione e report (21-04); conclusione «vita a 1» condivisa fra guardia e sconfitta senza aid (`ONE_LIFE_POINT_CONCLUSION`, 21-05); `PushModule` importato direttamente dal modulo della cancellazione (21-06); tiri del boss misto in un metodo privato dopo il draft (21-07); tipo del turno dalla parità dell'indice (21-08); quota per difetto con epsilon contro l'errore di rappresentazione IEEE 754 delle quote non binarie (21-11); `QuestRankPrizes.prizes` tipizzato `PrizesSnapshot` in TypeScript, SDL del contratto (21-12).
- **Casi verdi al primo colpo** (motivati nei SUMMARY): comportamenti di oggi pinnati come non regressione (caster che imparano, solitaria al `minTitle`, boss legacy, aid della hunt, crime e job D-19 in integrazione dopo il GREEN del task 1 di 21-05, enemy identiche all'istantanea a seme fisso, assenza di semina sulle quest a mano, criterio 4 della quota già coperto dal piano 11 task 1, premio unico della solitaria sul filo, populate annidato dei blocchi).
