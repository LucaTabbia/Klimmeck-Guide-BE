---
phase: 21-premi-per-rango-e-soccorsi
fixed_at: 2026-11-13
review_path: .planning/phases/21-premi-per-rango-e-soccorsi/21-REVIEW.md
iteration: 1
base: a6c9f0f1
findings_in_scope: 23
fixed: 22
not_needed: 1
skipped: 0
status: partial
---

# Phase 21 — Report dei fix della code review

**Data:** 2026-11-13 · **Base:** `a6c9f0f1` · **Commit dei fix:** 26 (da `2e1bd86a` a `9f820dfb`), più questo report.
Ogni fix di codice in TDD (RED `test(...)` con il fallimento atteso verificato, poi GREEN `fix(...)` / `refactor(...)`). Nessun tiro nuovo, `src/schema.gql` invariato, nessuna variabile d'ambiente nuova, nessun trailer nei commit.

## Esiti per finding

| Id | Esito | Commit | Prova |
|----|-------|--------|-------|
| C-WR-01 + B-WR-01 | fixed | `2e1bd86a` RED, `05af3192` GREEN | `questBattleOf` / `facedCatalogOf` in `src/quests/outcomes/quest-battle.ts`, unica regola per il percorso individuale e per il soccorso; il riconoscimento «aid di dungeon» è solo `rescueTurnOf(aid.rescue?.turn)`. Int-spec `dungeon-aid.int-spec.ts` › «a dungeon aid left without wounded after the start»: ferito archiviato col vero archiviatore a countdown partito; il soccorritore che vince percorre i turni fino al 4 (2 scontri, contatori 8/5/5/exploration, xp dei soli gruppi affrontati), quello che perde salva il turno `{ 1, fight, 8 }` sulla nuova aid con premio riscalato col rapporto (31 → 12). Rosso al RED: nessuna esplorazione (combattimento unico). |
| C-WR-02 | fixed | `41515992` RED, `a8d6dafc` GREEN | `checkedDungeonResolution` (in `dungeon-turns.ts`, chiamata da `questBattleOf`, unico lettore della porta) lancia `DungeonContractViolation` su sconfitta senza `failedTurn`, indice fuori da `[0, turnsTotal)` o non intero, oltre `lastTurnIndex`, tipo diverso dalla parità, `turnsCompleted` diverso dall'indice: la transazione abortisce. Il turno da salvare viene solo da `savedTurnOf` (da `failedTurn`, totale della dungeon o del turno salvato, sanificato con `rescueTurnOf`); `rescueTurnFromStages` e `nextRescueTurnOf` tolte; il ramo sconfitta di `turnCountersOf` riusa `fallenCountersOf`. Unit `quest-battle.spec.ts` con porta finta malformata (7 rifiuti, 3 derivazioni). |
| B-WR-02 + A-WR-02 | fixed | `2212530c` RED, `88c60fa7` GREEN | `clonedPrizesOf` legge i blocchi con `rankBlocksOf(sorgente)` (tipo di gruppo, titolo valido) e tiene il primo per titolo. `aid-quest.spec.ts`: titolo non valido / voce illeggibile / senza titolo esclusi, doppione → il primo, nessun blocco valido → nessuna chiave `rankPrizes`, aid di una hunt con blocchi rimasti a DB → premio unico (800 xp). |
| B-WR-03 + A-WR-01 | fixed | `4f585895` RED, `098c3ed6` GREEN | `disband` legge un posto senza titolo in un boss come party incompletabile: alla scadenza delle 24 ore scioglie con la routine di sempre (corsie e PendingQuest liberate, `questCancelled`), anche a posti pieni; WARN dopo il commit col solo id della quest. Posti malformati: `stale` come prima. Int-spec D-24: `party-timeout.int-spec.ts` (3 posti / 2 iscritti, 1 posto / 1 iscritto, finestra non scaduta → `waiting`), `quest-start.int-spec.ts` (avvio a posti pieni → `stale` + WARN; verde al primo colpo, pinna il comportamento). La worldMission non passa né dall'avvio né dal timeout del party (corsia del GM, `PARTY_TYPES` solo corsia standard): per lei il difetto non esiste. |
| B-WR-04 | fixed (test) | `193960b1` | Caso `keeps the rescuers of a started aid it concludes (B-WR-04, D-27)`: aid avviata, soccorritore con PendingQuest avviata, unico ferito archiviato → `concludedAt` scritto, posto intatto, `released: []`, nessun WARN. Nel caso legacy ora si asserisce `registeredAdventurers` svuotato; helper rinominato `expectRescuerInLane`. Sonda: vedi sotto. |
| B-IN-01 | fixed (rimosso) | `1ebe56b2` | VERIFY: in `timeoutAid` e `kill` l'aid è già conclusa dal claim prima di `dieWithin`, l'archiviatore conclude solo aid con `concludedAt` null e un ferito attende una sola aid: `archived.released` è sempre vuoto. Tolti `state.archiveReleased`, `DeathRequest.released`, `WoundedStep.released`, `notifyReleased` del soccorso; `dieWithin` legge solo l'esito (commento con la prova). Int-spec aid verdi (46). |
| B-IN-02 | fixed | `d3b8ea18` | `archiveWithin` rimosso (nessun chiamante in produzione); le sei int-spec che lo usavano passano da `archiveWithinReporting`. |
| B-IN-03 | not_needed | — | Il WARN di `releaseMembersWithin` descrive un dato a DB (membro con PendingQuest già avviata o di un'altra missione), vero anche se la transazione viene rieseguita o abortisce: una riesecuzione lo ripete, non lo rende falso. Portarlo dopo il commit richiede di cambiare il contratto di `ArchiveReport` e i quattro chiamanti (scioglimento, timeout dell'aid, cancellazione, morte) per un dato legacy raro: costo alto per un log già corretto nel contenuto (solo id). |
| B-IN-04 | fixed | `23bd78a7` RED, `7e46dc50` GREEN | `notifyQuestCancelled` è best-effort: un errore (lettura dei proprietari o invio) diventa un WARN `Push questCancelled della missione <id> non inviata: <nome>, code <codice>` e non fa mai fallire la mutation o il job già committati. Int-spec `character-deletion.resolver.int-spec.ts`: lettura dei proprietari che cade dopo il commit → `deleteCharacter` riuscita, personaggio archiviato, PendingQuest liberata, nessun push, un WARN. |
| A-IN-01 | fixed (test) | `ccf6c604` | `quests.resolver.int-spec.ts`: boss con due blocchi pieni, `EquipmentItem` e `LootItem` misti, un loot orfano accanto a una voce sorella che resta, letto da `quests` da un mage e da un paladin. Verde al primo colpo: il populate annidato funziona. Sonda: vedi sotto. |
| A-IN-02 | fixed (test) | `c7921244` | `quest-generator.int-spec.ts` › `pins the draws of a mixed boss at the tail of its quest (A-IN-02, D-23)`: corsa a seme 7 su mondo con candidati boss, 3 boss (2 misti) con posti e blocchi pinnati e 284 tiri. Sonda: vedi sotto. |
| A-IN-03 | fixed | `e8919ef9` RED, `7ee781d7` GREEN | `groupPrizeViolationsOf`: nuova violazione `invalidBlock` (voci di `rankPrizes` più dei blocchi validi o titolo ripetuto) e `seatWithoutBlock` anche per una quest a più titoli senza blocchi validi (il boss a titolo unico resta muto, D-28). Sola lettura, solo id e nomi delle violazioni, tetto di righe invariato. |
| A-IN-04 | fixed | `bead3d71` | Il report filtra su `[...GROUP_PRIZE_TYPES]`; `OPEN_GROUP_TYPES` tolto. |
| A-IN-05 | fixed | `b54ced37` | Commenti di `generation-rules.ts`, `quest-prizes.resolver.ts`, `quest-rank-prize.model.ts` riallineati; titolo `lists every rank block in its stored order (D-22)`. |
| B-IN-05 | fixed | `9f820dfb` | Titolo `concludes a lost %s without aid at one life point (D-19)`; commento di `buildAidQuest` sui due percorsi (il soccorso clona l'originale, il soccorritore da solo clona l'aid e riscala col rapporto). |
| C-IN-01 | fixed (test) | `4a987239` | 90 × 7/10 e 5 × (1/6)/(5/6) cadono sotto l'intero in IEEE 754: casi in `rescue-share.spec.ts` (63 su xp, monete e quantità) e `aid-quest.spec.ts` (5 → 1); più 89 × 0.7 = 62, 5 × 0.2 = 1, 4 × 0.2 = 0 (mai gonfiati). L'esempio del commento (5/6 × 6) era esatto in IEEE 754: sostituito. Sonda: vedi sotto. |
| C-IN-02 | fixed | `fc857aab` RED, `5f73a213` GREEN | `savedTurnWarningOf` (in `quest-battle.ts`): un `rescue.turn` presente ma malformato, o con `total` diverso dal doppio dei gruppi validi dell'aid, produce un WARN dopo il commit, una volta per risoluzione, nei due servizi; nessun aborto, comportamento di oggi. Int-spec `dungeon-aid.int-spec.ts` (due casi: turno malformato → combattimento unico; totale 10 su 8 turni). |
| C-IN-03 | fixed | `f06b9619` | Commenti di `quest-result.model.ts`, `outcome-plan.ts` e del soccorso riallineati; il commento di `dungeon-turns.ts` riscritto già in `a8d6dafc`. |
| C-IN-04 | fixed (test) | `ff787838` | Titolo `scales the pet chance of a dungeon aid rescuer (D-20)`; titolo della catena di `buildAidQuest` ristretto; nel caso D-10/D-26 il premio della nuova aid ora si asserisce con 4 xp (dall'originale 1, dall'aid già scalata 0); casi nuovi: turno salvato a indice 0 (nessun gruppo, 50 → 6 xp), dungeon da 1 gruppo (quota 2/2, premio intero), soccorritori caduti in esplorazione con la porta di test (`{ 2, exploration, 8 }`). Sonde: vedi sotto. |
| C-IN-05 | fixed | `4a1fdea2` | Un solo `SwappableDungeonResolver` (`test/quests/swappable-dungeon-resolver.ts`) e `NO_TURNS` / `turnsOf` condivisi (`test/quests/dungeon-turns.fixture.ts`) in due int-spec e tre spec unitarie; `TurnFailingDungeonResolver` lancia su un indice assente dai turni o oltre il turno salvato del contesto (caso unitario in `placeholder-dungeon-resolver.spec.ts`). |

## Sonde di mutazione (mai committate, ripristino con `git checkout -- <file>` o inversione della stessa sostituzione)

| Finding | Mutazione | Esito |
|---------|-----------|-------|
| B-WR-04 | `startedAt == null &&` tolto da `concludedUnstartedBy` (`character-archiver.ts`) | il caso B-WR-04 diventa rosso, gli altri tre restano verdi |
| C-IN-01 | `+ SHARE_EPSILON` tolto da `sharedAmountOf` (`rescue-share.ts`) | i due casi C-IN-01 non binari diventano rossi |
| C-IN-04 | il soccorso clona `context.loaded.quest` invece di `context.original ?? …` | il caso D-10/D-26 diventa rosso (atteso 1, ricevuto 0) |
| C-IN-04 | `Math.ceil` al posto di `Math.floor` in `facedEnemyCountOf` | il caso dell'indice 0 diventa rosso |
| A-IN-01 | percorso `prizes.rankPrizes.randomLoot.item` tolto da `QUEST_CATALOG_POPULATE` | il caso A-IN-01 diventa rosso |
| A-IN-02 | in `mixedOf` i premi del titolo inferiore tirati prima del cancello | il pin A-IN-02 (e il caso «generates mixed bosses…») diventano rossi |

## Gate dopo i fix (HEAD `9f820dfb`)

- `npx tsc --noEmit -p tsconfig.json` 0, `-p tsconfig.build.json` 0.
- Unit: 281 suite / 3745 test (prima 280 / 3725).
- Integration `--runInBand`, sei blocchi, 144 file = `--listTests`:
  - `src/quests/outcomes` 14 / 199 (54,5 s)
  - resto di `src/quests` 24 / 390 (121,9 s)
  - `src/characters` 23 / 390 (75,6 s)
  - `src/travel` 12 / 244 (61,0 s)
  - resto di `src/` 54 / 609 (110,0 s)
  - `test/` 17 / 274 (43,9 s), boot reale `test/app.int-spec.ts` compreso
  - totale 144 / 2106 (prima 2091)
- Coverage per cartella (unit + integration, soglie da `package.json`):
  - `./src/quests/acceptance/` 99,08 / 92,87 / 99,74 contro 97 / 91 / 98 (6 suite / 397)
  - `./src/quests/generation/` 98,9 / 88,73 / 99,68 contro 96 / 82 / 97 (18 suite / 185)
- `git diff --exit-code src/schema.gql` 0; `git diff 1f9db973 -- src/schema.gql | grep -cE '^-[^-]'` = 0; `git status --short` vuoto; 26 subject ≤ 72; trailer 0; nessun `jest.mock(`, `Math.random`, `Date.now`, `process.env`, `setTimeout` aggiunto.

## Da dichiarare nell'handoff (piano 14)

- **Comportamenti cambiati:** il soccorritore già partito di un'aid di dungeon rimasta senza feriti percorre i turni fino al turno salvato (contatori, tappe, xp dei gruppi affrontati) e, se perde, la nuova aid salva il turno della caduta con la quota riscalata dall'aid (rapporto delle quote, arrotondamento per difetto due volte); una risoluzione della porta che rompe il contratto abortisce con `DungeonContractViolation`; l'aid clona solo i blocchi validi (primo per titolo) e mai da una solitaria; un boss con un posto senza titolo e iscritti si scioglie alla scadenza delle 24 ore; `questCancelled` è best-effort.
- **Log nuovi (solo id e conteggi):** WARN `Missione <id> con un posto senza titolo (D-24): party sciolto alla scadenza`; WARN `Push questCancelled della missione <id> non inviata: <nome>, code <codice>`; WARN `Soccorso <id>: turno salvato non valido, combattimento unico contro tutti i gruppi` e `Soccorso <id>: turno salvato su <n> turni, i gruppi dell'aid ne contano <m>`; violazione nuova `invalidBlock` e `seatWithoutBlock` anche sulle quest a più titoli senza blocchi nel report del boot.
- **Limiti noti:** il WARN del membro legacy di `releaseMembersWithin` resta dentro la transazione (B-IN-03); la worldMission con un posto senza titolo resta alla corsia del GM (né avvio né timeout del party); la clonazione dall'aid nel percorso individuale arrotonda per difetto due volte (mai per eccesso); un'aid con turno malformato a DB resta sul combattimento unico (ora con WARN).
- **Bookkeeping per l'orchestratore:** `21-VALIDATION.md` riga 132 cita il titolo vecchio «concludes a lost job without aid at one life point (D-19)»: il titolo nuovo è `concludes a lost %s without aid at one life point (D-19)`.

---

_Fixed: 2026-11-13_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
