---
phase: 21
slug: premi-per-rango-e-soccorsi
audited: 2026-11-13T00:00:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/21-premi-per-rango-e-soccorsi
head: 1fb15127
base: fb59b545
sdl_base: 1f9db973
threats_total: 48
threats_mitigated: 47
threats_accepted: 0
threats_transferred: 1
threats_operational: 1
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
accepted_ids: []
transferred_ids: [T-21-47]
operational_ids: [T-21-47]
unregistered_ids: [N-21-01, N-21-02, N-21-03, N-21-04, N-21-05, N-21-06]
updated: 2026-11-13T00:00:00Z
---

# Audit di sicurezza — Phase 21 «Premi per rango e soccorsi» (BE)

Audit in sola lettura dei blocchi threat model dei piani `21-01`…`21-14` sul codice FINALE di `feat/21-premi-per-rango-e-soccorsi` a `1fb15127` (base della fase `fb59b545`, base dello SDL `1f9db973`), dopo i fix di `21-REVIEW-FIX.md` (22 corretti, 1 `not_needed`). Nessun file modificato oltre a questo, nessun commit, **nessun jest, tsc, build o lint lanciato** (`npm run test:cov` in corso a cura dell'orchestratore sullo stesso albero), nessuna lettura di `.env` o dell'ambiente, nessun avvio del BE, nessun accesso a database. L'evidenza di esecuzione è quella registrata in `21-REVIEW-FIX.md` (unit 281 suite / 3 745 test; integration 144 suite / 2 106 test; `tsc` 0; SDL con sole aggiunte). Qui il codice è verificato con lettura e grep; le spec sono citate per file:riga del titolo e **non sono state eseguite da questo audit**.

**Le voci sono 48 su 47 ID distinti.** `T-21-09` non esiste in nessun piano; `T-21-14` è usato due volte (piano 04 «boot» e piano 05 «sconfitta senza aid»): qui sono `T-21-14a` e `T-21-14b`. `T-21-48` è del piano 09.

| | Numero | ID |
| --- | --- | --- |
| `mitigate` chiuse dal codice | 47 | tutte tranne quella sotto |
| `accept` | 0 | — |
| `transfer` | 1 | T-21-47 (semine della UAT: all'orchestratore, da eseguire) |
| `open` | 0 | — |

Chiuse 47 / 48, accettate 0 / 48, trasferite 1 / 48, aperte 0.

Mitigazioni riscritte dai ruling della review, verificate qui nella forma finale:

- **T-21-25, T-21-28, T-21-31, T-21-33, T-21-48** (turno salvato): `rescueTurnFromStages` e `nextRescueTurnOf` non esistono più. Il turno si rilegge solo con `rescueTurnOf` (sei lettori di `rescue?.turn`, tutti passano da lì) e si scrive solo da `savedTurnOf`, che lo sanifica con la stessa funzione (C-WR-02).
- **Contratto della porta** (nessun ID nei piani, vedi N-21-03): `checkedDungeonResolution` lancia `DungeonContractViolation` e la transazione abortisce; l'unico lettore della porta è `questBattleOf`, usato sia dal percorso individuale sia dal soccorso (C-WR-01 + B-WR-01).
- **T-21-15, T-21-16** (clone dei blocchi): `clonedPrizesOf` legge i blocchi con `rankBlocksOf` (tipo di gruppo, titolo valido) e tiene il primo per titolo (B-WR-02 + A-WR-02). È più forte del piano: un blocco non valido non fa più fallire `createAid`.
- **T-21-17, T-21-19** (rilascio dei soccorritori): `archiveWithin` è stato rimosso (B-IN-02), resta solo `archiveWithinReporting`; il giro dei liberati dentro il soccorso è stato tolto perché sempre vuoto (B-IN-01, vedi N-21-04); `notifyQuestCancelled` è best-effort (B-IN-04).
- **T-21-11** (posto null): oltre al rifiuto in accettazione e all'avvio, il timeout del party scioglie il boss con un posto senza titolo (B-WR-03 + A-WR-01, vedi N-21-02).
- **T-21-12** (log del report): due nomi di violazione in più (`invalidBlock`, e `seatWithoutBlock` anche senza blocchi), stessa forma «id + nomi» (A-IN-03).

## Registro delle minacce

Stato: `CLOSED` = mitigazione presente nel codice; `CLOSED (transferred)` = trasferimento documentato, esecuzione a carico dell'orchestratore. I percorsi sono relativi a `src/` salvo dove indicato.

| ID | STRIDE | Componente | Disposizione | Evidenza (file:riga) e spec che la pinna | Stato / Nota |
| --- | --- | --- | --- | --- | --- |
| T-21-01 | Elevation of privilege (gioco) | `canLearnSpell` / `drawLearnableSpell` | mitigate | `quests/outcomes/rewards/quest-rewards.ts:303` e `:318` (`isSpellCaster` primo cancello); unico chiamante `quests/outcomes/outcome-plan.ts:445-455`. Spec `quest-rewards.spec.ts:656`, `:667`, `:673`; `outcome-plan.spec.ts:1832` (ogni percorso); int `study-spell-draw.int-spec.ts:266` | CLOSED |
| T-21-02 | Tampering | titolo usato per il cancello | mitigate | `outcome-plan.ts:421-424` (`titleAfter` dal titolo dello snapshot), snapshot letto in sessione (`resolution-loader.service.ts:385`); nessun argomento del client porta un titolo. Spec `outcome-plan.spec.ts:1848`, `:1867` | CLOSED |
| T-21-03 | Tampering (determinismo) | ordine dei tiri | mitigate | il cancello del titolo sta dopo i tiri (`quest-rewards.ts:317-318`, i tiri restano in `drawRewards` `:266-293`). Spec `quest-rewards.spec.ts:263`; int `study-spell-draw.int-spec.ts:266` | CLOSED |
| T-21-04 | Tampering (contenuto) | `prizes.rankPrizes` | mitigate | `models/quest/quest-rank-prize.model.ts:16` (enum `TitleType`); `quests/prizes/rank-prizes.ts:25-35`, `:57-61` (blocchi senza titolo valido o non oggetto scartati); `quest-rewards.ts:123-137` (`rewardItemOf`). Spec `quest-prizes.schema.spec.ts:90`; `rank-prizes.spec.ts:102` | CLOSED |
| T-21-05 | Denial of service | lista `quests` | mitigate | `quests/quest-catalog.populate.ts:24-27` (quattro percorsi di populate dei blocchi), `:83-89`, `:93-105` (`sanitizePrizeRefs` per blocco, voci non oggetto saltate). Spec `quest-catalog.populate.spec.ts:72`, `:168`; int `quest-catalog.populate.int-spec.ts:121`, `:136`; `quests.resolver.int-spec.ts:1248` | CLOSED — due bordi senza test in N-21-05 |
| T-21-06 | Tampering | scelta del blocco | mitigate | `rank-prizes.ts:92-105` (una sola funzione); tre soli chiamanti: `combatant-plan.ts:176`, `gm-completion.service.ts:318`, `quests/prizes/quest-prizes.resolver.ts:37`; nessuno riceve il titolo da un input. Spec `rank-prizes.spec.ts:119`, `:128`, `:142`, `:151` | CLOSED |
| T-21-07 | Tampering | premio di un altro titolo | mitigate | `combatant-plan.ts:174-180` e `gm-completion.service.ts:317-321` scelgono su `snapshot.status.title`; snapshot letti in sessione (`gm-completion.service.ts:284`, `rescue-resolution.service.ts:393`). Spec `combatant-plan.spec.ts:364`; int `boss-resolution.int-spec.ts:664`, `:724`; `gm-completion.service.int-spec.ts:367` | CLOSED |
| T-21-08 | Tampering (contenuto) | ref orfani nei blocchi | mitigate | `quest-rewards.ts:123-137`, `:181-186` (voce fuori catalogo scartata), `:238-247` (pet orfano: nessun tiro); catalogo sull'unione dei blocchi `resolution-loader.service.ts:566-600`, `:604-646`. Spec `quest-rewards.spec.ts:389`; `resolution-loader.service.spec.ts:247`, `:281` | CLOSED |
| T-21-10 | Tampering (determinismo) | ordine dei tiri | mitigate | nessun `chance.next()` nuovo in `drawRewards`; la quota entra come moltiplicatore di soglia (`quest-rewards.ts:188-205`, `:246`). Spec `quest-rewards.spec.ts:402`, `:414` | CLOSED |
| T-21-11 | Elevation of privilege (gioco) | posto null in un boss | mitigate | `quests/acceptance/quest-eligibility.ts:104-122` (`'invalid'`); `quest-acceptance.service.ts:444-450` (`QUEST_NOT_ACCEPTABLE` prima della transazione); `quests/party/quest-start.service.ts:173-179` (nessun avvio). Spec `quest-eligibility.spec.ts:169`, `:194`; int `quest-acceptance.service.int-spec.ts:2474` (nessuna scrittura); `quest-start.int-spec.ts:155` | CLOSED — lo scioglimento al timeout è in N-21-02 |
| T-21-12 | Information disclosure | log del report | mitigate | `quests/maintenance/group-prize.report.ts:93-98` (id esadecimale + nomi delle violazioni); `group-prize-report.service.ts:35-43` (tetto di 20 righe, chiusura con due conteggi). Spec `group-prize.report.spec.ts:179`; int `group-prize-report.service.int-spec.ts:71`, `:99`, `:118` | CLOSED |
| T-21-13 | Tampering | report che scrive | mitigate | `group-prize-report.service.ts:47-58`: una sola `find` con proiezione e `lean`, nessuna scrittura nel file (grep di `update`, `save`, `create`, `delete`, `insert`: 0). Int `group-prize-report.service.int-spec.ts:71` | CLOSED |
| T-21-14a | Denial of service | boot (piano 04) | mitigate | `quests/maintenance/quest-maintenance.boot.ts:21-23` (passo nello `step`), `:26-37` (`try/catch`, `describeError`). Spec `quest-maintenance.boot.spec.ts:48`, `:62` | CLOSED |
| T-21-14b | Denial of service (gioco) | sconfitta senza aid (piano 05) | mitigate | `combatant-plan.ts:138-154` (piano dedicato prima di `planParticipant`); `defeat-without-aid.ts:6-13`; `guard/guard-outcome.ts:24-28` (vita a `MIN_LIFE_POINTS`); `aid/aid-opening.ts:4-14`. Spec `defeat-without-aid.spec.ts:21`, `:63`; `aid-opening.spec.ts:14`; int `quest-combat.int-spec.ts:412`; `crime-guard-conclusion.int-spec.ts:210` | CLOSED |
| T-21-15 | Elevation of privilege (gioco) | cura ereditata dal soccorritore | mitigate | `quests/outcomes/aid/aid-quest.ts:100-113` (premio clonato senza `cure`), `:131-145` (`cure: null` in ogni blocco). Spec `aid-quest.spec.ts:267`, `:313`; int `boss-resolution.int-spec.ts:744` | CLOSED |
| T-21-16 | Tampering | aid di una solitaria che eredita blocchi | mitigate | `aid-quest.ts:88-97` (`rankBlocksOf` sul tipo della sorgente), `:110-112` (nessuna chiave `rankPrizes` senza blocchi validi). Spec `aid-quest.spec.ts:338`, `:353`, `:366`, `:376`, `:388` | CLOSED |
| T-21-17 | Denial of service (gioco) | soccorritore appeso a un'aid conclusa | mitigate | `characters/deletion/character-archiver.ts:268-297` (rilascio nella stessa sessione che conclude l'aid), `:306-314` (solo aid non avviate rimaste senza feriti); `quests/party/registered-release.ts:86-114`. Int `character-archiver.int-spec.ts:634`, `:681`, `:702` | CLOSED |
| T-21-18 | Tampering | `PendingQuest` già avviata cancellata | mitigate | `registered-release.ts:54-69`: `deleteOne` con `quest` dell'aid e `startDate: null`, altrimenti WARN e nessuna scrittura. Int `character-archiver.int-spec.ts:656` | CLOSED — il WARN resta dentro la transazione (B-IN-03 `not_needed`): contenuto di soli id, può ripetersi a un retry |
| T-21-19 | Repudiation / integrità | push prima del commit | mitigate | `character-deletion.service.ts:50-72` (push dopo `connection.transaction`), `:76-88`; `rescue-resolution.service.ts:306-353`; `party-timeout.service.ts:114-151`; best-effort `registered-release.ts:117-136`. Int `character-deletion.resolver.int-spec.ts:768`, `:807`, `:857` | CLOSED |
| T-21-20 | Information disclosure | push e log | mitigate | payload `questCancelled(hex)` (`registered-release.ts:127`, testo fisso in `push/push-events.ts:28-33`); log con soli id (`registered-release.ts:66`, `:133` con `describeError`; `party-timeout.service.ts:145`). Int `character-archiver.int-spec.ts:656`; `character-deletion.resolver.int-spec.ts:807` | CLOSED |
| T-21-21 | Elevation of privilege (gioco) | boss troppo facile | mitigate | `quests/generation/generation-rules.ts:118-130` (solo il titolo subito sotto, da 1 a metà dei posti); `quest-generator.service.ts:310-330`; `MIN_BOSS_SEATS = 2` (`generation-rules.ts:65`). Spec `generation-rules.spec.ts:184`, `:190`, `:202`; `generated-quest-draft.spec.ts:301`; int `quest-generator.int-spec.ts:870` | CLOSED |
| T-21-22 | Tampering (accettazione) | `minTitle` del boss misto | mitigate | `generated-quest-draft.ts:190-216` (`minTitle: mix.lower` a `:199`, posti `[rango, inferiore]`). Spec `generated-quest-draft.spec.ts:301`; int `quest-generator.int-spec.ts:870` | CLOSED |
| T-21-23 | Tampering (determinismo) | ordine dei tiri | mitigate | `quest-generator.service.ts:284-296` (tiri del misto dopo la bozza), `:310-330` (solo per i boss). Int `quest-generator.int-spec.ts:834`, `:918`, `:937` (A-IN-02) | CLOSED |
| T-21-24 | Tampering (contenuto) | quest scritte a mano | mitigate | l'unica scrittura del generatore sulle quest è `questModel.create(draft)` (`quest-generator.service.ts:298`); nessun update. Int `quest-generator.int-spec.ts:1006` | CLOSED |
| T-21-25 | Tampering (contenuto) | turno salvato ritoccato a mano | mitigate | `quests/outcomes/dungeon/dungeon-turns.ts:48-58` (interi, totale pari e positivo, indice nel totale, tipo coerente con la parità). Spec `dungeon-turns.spec.ts:38` | CLOSED |
| T-21-26 | Tampering (determinismo) | tiri della dungeon | mitigate | `dungeon/placeholder-dungeon-resolver.ts:142-146` (esplorazione senza tiri). Spec `placeholder-dungeon-resolver.spec.ts:261`, `:290` | CLOSED |
| T-21-27 | Information disclosure | `rescue` sul filo | mitigate | `models/quest/quest-rescue.model.ts:1-46` (solo `@Schema`/`@Prop`, nessun import da `@nestjs/graphql`); `quest.model.ts:56-58` (solo `@Prop`); grep di `QuestRescue`, `rescue`, `spellDraw`, `QuestRankPrize` (singolare) su `src/schema.gql`: 0. SDL pinnato in `test/app.int-spec.ts:705`, `:713` | CLOSED — i quattro contatori dei turni sono sul filo dal piano 12, come previsto (D-21) |
| T-21-28 | Tampering (contenuto) | `rescue.turn` malformato | mitigate | `quests/outcomes/quest-battle.ts:54-61` (turno non valido = combattimento unico, nessuna eccezione), `:86-99` (WARN di soli id e conteggi dopo il commit: `rescue-resolution.service.ts:247`, `quest-resolution.service.ts:172-176`). Int `dungeon-aid.int-spec.ts:450`, `:512` | CLOSED |
| T-21-29 | Tampering (determinismo) | tiri del soccorso | mitigate | `quest-battle.ts:55-60` (senza turno: `combat.resolve` come prima), `:62-75` (la porta si ferma a `lastTurnIndex`). Int `dungeon-aid.int-spec.ts:236`, `:512` | CLOSED |
| T-21-30 | Elevation of privilege (gioco) | xp di nemici mai affrontati | mitigate | `quest-battle.ts:102-112` + `dungeon-turns.ts:108-110`; applicato in `rescue-resolution.service.ts:420`, `:432` e `quest-resolution.service.ts:122`. Int `dungeon-aid.int-spec.ts:376`, `:499`, `:565` | CLOSED |
| T-21-31 | Tampering | catena di aid | mitigate | `rescue-resolution.service.ts:474` (`nextTurn` dalla battaglia), `:488-496` (clone da `context.original`, turno della caduta); `dungeon-turns.ts:123-134`. Int `dungeon-aid.int-spec.ts:306`, `:351`, `:590` | CLOSED |
| T-21-32 | Elevation of privilege (gioco) | quota applicata due volte o mai | mitigate | `aid-quest.ts:117-128` (quota sull'originale; sorgente già scalata riscalata col rapporto delle quote); soglie scalate solo con turno valido (`combatant-plan.ts:179`). Spec `aid-quest.spec.ts:447`, `:465`, `:484`, `:504`; int `dungeon-aid.int-spec.ts:590`, `:654`, `:683` | CLOSED |
| T-21-33 | Tampering (contenuto) | `rescue.turn` gonfiato a mano | mitigate | `dungeon-turns.ts:54-55` (indice < totale → quota ≤ 1); `aid/rescue-share.ts:21-24`, `:68` (una quota ≥ 1 non tocca il premio, mai lo aumenta); monete, xp e oggetto fisso già scritti alla nascita. Spec `dungeon-turns.spec.ts:38`; `rescue-share.spec.ts:35`, `:70`, `:117` | CLOSED |
| T-21-34 | Tampering (determinismo) | tiri della risoluzione | mitigate | `quest-rewards.ts:188-205`, `:238-247` (stessi `next()` con e senza quota). Spec `quest-rewards.spec.ts:402`, `:414`; `combatant-plan.spec.ts:447`; int `dungeon-aid.int-spec.ts:713` | CLOSED |
| T-21-35 | Information disclosure | memo per viewer sul WS | mitigate | `quests/no-effect/viewer-vitals.service.ts:55-75` (memo per `ruolo:userId` dentro la chiave dell'evento, `lore/viewer-knowledge.service.ts:30-36`); `quest-prizes.resolver.ts:30-38` (nessuna scrittura sul parent). Int `quest-updated.subscription.int-spec.ts:651` (due subscriber, due blocchi diversi, payload riletto identico a `:705-718`); spec `viewer-vitals.service.spec.ts:114` | CLOSED |
| T-21-36 | Spoofing | titolo del viewer | mitigate | `viewer-vitals.service.ts:78-102` (utente dal bearer → `currentCharacter` → personaggio attivo); `quests/quests.resolver.ts:20-23` (nessun argomento su `quests`). Int `quests.resolver.int-spec.ts:1090`, `:1177`; spec `viewer-vitals.service.spec.ts:36`, `:47`, `:63`, `:88` | CLOSED |
| T-21-37 | Tampering | scelta del blocco sul filo | mitigate | `quest-prizes.resolver.ts:37`: stessa `prizeBlockFor` della risoluzione, sola lettura. Int `quests.resolver.int-spec.ts:1197`, `:1262` | CLOSED |
| T-21-38 | Denial of service | lista `quests` | mitigate | come T-21-05; premio vuoto per un parent senza premi (`quest-prizes.resolver.ts:13-21`, `:37`). Int `quests.resolver.int-spec.ts:1116`, `:1248`, `:1294` | CLOSED |
| T-21-39 | Tampering (contratto) | `src/schema.gql` | mitigate | `git diff 1f9db973 1fb15127 -- src/schema.gql`: 15 righe aggiunte, 0 tolte (`DungeonTurnKind`, `Quest.rankPrizes`, `QuestRankPrizes`, quattro campi nullable di `QuestResult`). Pin `test/app.int-spec.ts:705`, `:713` | CLOSED |
| T-21-40 | Tampering (contratto) | `src/schema.gql` | mitigate | come T-21-39; `type QuestPrizes` senza diff, `QuestRescue` assente dallo SDL, nessun `input` né argomento nuovo (grep di `@InputType`, `@Args`, `@Mutation`, `@Query`, `@Subscription` aggiunti nel diff: 0) | CLOSED (prova del boot reale = gate di `21-REVIEW-FIX.md`) |
| T-21-41 | Information disclosure | codice, log e documenti | mitigate | file fuori da `src/`, `test/`, `.planning/` nel diff: 0 (nessun `.env`, `.env.example` e `package.json` senza diff); `process.env.` aggiunto: 0; `process.env.` in `src/` fuori da `src/config/`: 0; URI nel diff: 0; `Math.random` e `Date.now` aggiunti: 0 | CLOSED |
| T-21-42 | Tampering | premi scelti fuori dalla regola unica | mitigate | `drawRewards(` ha due soli chiamanti di produzione (`combatant-plan.ts:175`, `gm-completion.service.ts:317`), entrambi con `prizeBlockFor(quest, snapshot.status.title)`; grep di `drawRewards(quest.prizes`: 0 | CLOSED |
| T-21-43 | Repudiation | commit | mitigate | `git log fb59b545..1fb15127`: 92 commit, trailer vietati 0, subject oltre 72 caratteri 0 | CLOSED |
| T-21-44 | Denial of service (qualità) | coverage | mitigate | `package.json` senza diff; coverage per cartella in `21-REVIEW-FIX.md` (`src/quests/acceptance/` 99,08 / 92,87 / 99,74; `src/quests/generation/` 98,9 / 88,73 / 99,68) | CLOSED — `test:cov` completo in corso a cura dell'orchestratore, esito non letto da questo audit |
| T-21-45 | Information disclosure | `BACKEND-NOTES.md` | mitigate | grep di URI, host e chiavi sul file: 0; identità come segnaposto (`<twitchId di test>`, `<characterId>`, `<questId>`); operatori fuori dai code span: 0 | CLOSED |
| T-21-46 | Tampering (processo) | requisiti chiusi senza gate | mitigate | `REQUIREMENTS.md` toccato da un solo commit della fase (`df0a0e36`, piano 14), dopo il report dei fix (`ba6d946b`) | CLOSED (evidenza di processo) |
| T-21-47 | Tampering | semine della UAT sul DB reale | transfer | `BACKEND-NOTES.md` §6 (righe 183-200): UAT e semine all'orchestratore con script fuori repo, stato «da eseguire», nessun esecutore tocca il DB reale, nessun migratore né seeder (D-28) | CLOSED (transferred) — da eseguire a cura dell'orchestratore |
| T-21-48 | Tampering (contenuto) | `rescue.turn` a DB | mitigate | `quest-rescue.model.ts:8-19` (enum del tipo, `min: 0` e `min: 1`); sei lettori di `rescue?.turn` in produzione, tutti tramite `rescueTurnOf` (`quest-battle.ts:54`, `:90-93`, `:106`; `combatant-plan.ts:179`; `aid-quest.ts:123`; `rescue-resolution.service.ts:601`). Spec `dungeon-turns.spec.ts:38`; int `quest-dungeon.int-spec.ts:263`, `:282` (scrittura dal modello reale) | CLOSED — nessuna spec di schema dedicata ai rifiuti di enum e minimi: la difesa effettiva è la rilettura sanificata, che copre anche le scritture a mano |

## Controlli trasversali

| Tema | Esito |
| --- | --- |
| Nessun client sceglie o influenza il blocco | `rankPrizes` e `rescue.turn` non sono in nessun `input` dello SDL (grep sui 19 `input`: 0); `QuestPrizesInput` senza diff; `src/models/request`, `src/authz`, `src/auth`, `src/config` senza diff; l'unico resolver nel diff è quello nuovo di sola lettura dei premi |
| Autorizzazione delle mutation esistenti | `acceptQuest` `@OwnsCharacter` (`quest-acceptance.resolver.ts:18-22`), completamento dell'oste `@Roles(RoleType.innkeeper)` (`pending-requests.resolver.ts:46-51`), `deleteCharacter` senza argomenti sul `currentCharacter` del bearer (`character-deletion.resolver.ts:13-17`): tutti senza diff. Guardia globale `APP_GUARD` invariata |
| Per-viewer sul WS condiviso | un solo payload per evento (`quests.publisher.ts:52-53`), sanificato prima della pubblicazione; il resolver sceglie il blocco senza scrivere sul parent; memo per viewer dentro la chiave dell'evento. Caso a due subscriber con payload riletto intatto |
| Parent `Quest` non popolati | sotto `Character.quests` la quest ha solo `_id` (`character-quests.populate.ts:7-20`): `prizes` risponde il premio vuoto e `rankPrizes` la lista vuota, nessun errore |
| Magia solo ai caster | un solo cancello per magia fissa e sorteggio, col titolo dopo l'esito; il generatore non scrive magie nei blocchi (`generated-quest-draft.ts:110-125`); il report del boot segnala le magie sotto mage |
| Posti null fail-closed | accettazione (rifiuto prima della transazione), avvio (`stale`), timeout (scioglimento, N-21-02) |
| Atomicità | aid, quota, turno e rilascio dei soccorritori dentro `connection.transaction`, con letture in sessione; lo stato raccolto nel callback è azzerato a ogni riesecuzione (`character-deletion.service.ts:52`, `party-timeout.service.ts:116`, `rescue-resolution.service.ts:230-231`, `:308-310`) |
| Push | solo dopo il commit, best-effort: un errore diventa un WARN con id della quest, nome e codice |
| Doppio premio o doppia quota | la catena clona l'originale; se l'originale non c'è più si clona l'aid e la quota è il rapporto delle quote; `checkedDungeonResolution` vieta una caduta oltre il turno salvato, quindi il rapporto non supera mai 1 |
| Dati malformati a DB | blocco senza titolo valido, voce non oggetto, doppione, `rescue.turn` malformato o incoerente coi gruppi: nessuno blocca la risoluzione; bordi residui sul filo in N-21-05 |
| Log | sette righe nuove: id esadecimali, nomi delle violazioni, conteggi, `describeError` (solo nome e codice). Nessun titolo di quest, nessun premio, nessun messaggio grezzo |
| Variabili d'ambiente | nessuna nuova; `src/config` e `.env.example` senza diff; nessun `process.env.` fuori dai provider di config |
| Report del boot | sola lettura, quest di gruppo aperte, proiezione di tre campi, 20 righe al massimo più il riepilogo, mai bloccante |

## Minacce nuove non dichiarate da alcun piano

| ID | STRIDE | Origine | Descrizione | Mitigazione presente | Valutazione |
| --- | --- | --- | --- | --- | --- |
| N-21-01 | Information disclosure (gioco) | D-22, piano 12 | `Quest.rankPrizes` serve **tutti** i blocchi a qualunque utente autenticato, senza distinzione di ruolo: un paladin legge il premio del blocco mage. Vale anche per `quest(id)` e `questUpdated(questId)`, leggibili per id da ogni autenticato (13.1 D-05), quindi anche per quest fuori dalla propria area. I piani coprono solo `Quest.prizes` (T-21-35…37) | voluto: l'elenco serve all'oste nella Phase 22 / FE 21; nei blocchi non c'è nulla di personale né di segreto (monete, xp, oggetti, pet, magia, cura); `rescue` e `spellDraw` restano fuori dallo SDL | informativa, non bloccante. **Vincolo per la Phase 22:** se i premi degli altri titoli devono restare nascosti ai giocatori, il campo va limitato all'oste (`@Roles`) o filtrato sul titolo del viewer |
| N-21-02 | Denial of service (gioco) / Tampering | B-WR-03 + A-WR-01 | Percorso nuovo che scrive: `PartyTimeoutService.disband` scioglie dopo 24 ore un boss con un posto senza titolo anche a posti pieni (`party-timeout.service.ts:102-111`) | stessa transazione e stesso claim del timeout di sempre (`:114-138`), WARN col solo id dopo il commit (`:143-147`), finestra non scaduta → `waiting`. Int `party-timeout.int-spec.ts:196`, `:235` | bassa, mitigata; è la chiusura del party appeso, non una superficie d'attacco |
| N-21-03 | Denial of service (gioco) | C-WR-02 | `DungeonContractViolation` abortisce la transazione: con un motore che rompe il contratto la stessa missione fallisce a ogni sweep (`quest-resolution.sweeper.ts:216-226` logga nome e codice e passa oltre) e il personaggio resta nella corsia finché il motore non è corretto. Il contratto è imposto solo sulle sconfitte: i contatori di una vittoria (`turnsCompleted`, `stagesCleared`) sono scritti come arrivano | fail-closed per scelta del ruling (mai un turno spostato o perso in silenzio); l'errore non ferma le altre missioni; il motore arriva via DI, è codice fidato. Spec `quest-battle.spec.ts:81-114` (sette rifiuti) | bassa oggi (segnaposto conforme). **Vincolo per il motore dell'utente:** rispettare il contratto di `dungeon-resolver.ts`; valutare un controllo dei contatori anche sul successo |
| N-21-04 | Denial of service (gioco) | B-IN-01 | `dieWithin` scarta `released` di `archiveWithinReporting` (`rescue-resolution.service.ts:584`), sull'invariante «un ferito attende una sola aid ed è già conclusa dal claim». Se un dato a mano mettesse lo stesso ferito in due aid aperte, i soccorritori non partiti della seconda verrebbero liberati a DB senza push `questCancelled` | il rilascio a DB avviene comunque nella stessa transazione; manca solo la notifica; l'invariante è provato in `21-REVIEW-FIX.md` | bassa, accettabile |
| N-21-05 | Denial of service | piano 02, lettura del codice | Due bordi di `dropOrphanCatalogRefs` senza test: (a) la guardia sulle voci non oggetto dei blocchi (`quest-catalog.populate.ts:86-88`) non ha un caso dedicato; (b) una voce `null` dentro `randomLoot` di un blocco (o del premio di oggi) arriva a `isResolvedItemEntry` (`:63-64`, `entry.item`) e lancerebbe, facendo fallire `quests` e `quest(id)` per quella board. Dedotto dalla lettura, non riprodotto: dipende da come Mongoose idrata la voce | lo schema non produce voci null; servono modifiche a mano del database. Lo schema del premio di oggi ha lo stesso bordo da prima della fase: la fase lo estende ai blocchi | bassa, non bloccante; correzione eventuale: `entry?.item` e due casi di test |
| N-21-06 | Information disclosure | B-IN-03 (`not_needed`) | Il WARN del membro legacy di `releaseMembersWithin` è scritto dentro la transazione (`registered-release.ts:64-68`): può ripetersi a un retry o comparire per una transazione poi abortita | contenuto di soli id esadecimali, entro `21-REPO-RULES.md` «Log» | informativa; dichiarata fra i limiti noti di `21-REVIEW-FIX.md` |

Nessuna delle sei è bloccante (`block_on: high`).

## Aperte

Nessuna.

## Differite

Nessuna. Residuo operativo, non una minaccia aperta: T-21-47 (semine e UAT su device) resta da eseguire a cura dell'orchestratore, e l'esito di `npm run test:cov` completo (T-21-44) va letto dall'orchestratore prima della PR.

## Flag di minaccia non registrati

Dai SUMMARY: `21-04-SUMMARY.md`, `21-05-SUMMARY.md` e `21-12-SUMMARY.md` hanno la sezione «Threat Flags» e dichiarano «nessuna superficie nuova»; gli altri undici non hanno la sezione. Le sole voci non registrate sono N-21-01…N-21-06, nate dai ruling della review o dalla lettura del codice finale. La dichiarazione di `21-12-SUMMARY.md` non considera `Quest.rankPrizes` come superficie di esposizione: è registrata qui come N-21-01.
