---
phase: 18
slug: quest-heal-per-taglia
audited: 2026-11-10T12:45:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/18-quest-heal-per-taglia
head: d00c6857
base: origin/develop (86095d89)
threats_total: 56
threats_mitigated: 43
threats_accepted: 11
threats_transferred: 2
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
transferred_ids: [T-18-15, T-18-56]
updated: 2026-11-10T12:45:00Z
---

# Audit di sicurezza — Phase 18 «Quest heal per taglia» (BE)

Audit in sola lettura dei blocchi threat model dei piani `18-01`…`18-11` (56 ID `T-18-01`…`T-18-56`, tutti distinti) sul codice FINALE di `feat/18-quest-heal-per-taglia` a `d00c6857`, dopo i fix di `18-REVIEW-FIX.md` (11 corretti, 3 saltati per ruling o verifica). Nessun file modificato oltre a questo, nessun commit, nessun jest lanciato, nessuna lettura di `.env` o dell'ambiente. L'evidenza di esecuzione è quella registrata in `18-REVIEW-FIX.md` (gate finali: tsc 0; unit 254 suite / 3239 test; integration 34 + 47 + 11 + 45 suite; boot reale 84/84; SDL invariato). Qui le spec sono citate per titolo tramite i piani e il report dei fix; il codice è verificato con grep e lettura.

Disposizioni: `mitigated` 43, `accepted` 11 (T-18-06, 08, 12, 18, 21, 24, 26, 37, 43, 44, 46), `transferred` 2 (T-18-15, T-18-56), `deferred` 0, `open` 0. Nota: T-18-44 era `transfer` nel piano 18-09; per ruling dell'orchestratore è registrato come `accepted` (fail-safe voluto D-01, finestra scritta nel handoff).

## Registro delle minacce

| ID | STRIDE | Componente | Disposizione | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- |
| T-18-01 | Tampering (contenuto) | `cureOf` | mitigated | `src/quests/outcomes/injuries/quest-cure.ts:15-27` (`isShare` in [0, 1], altrimenti 0, mai clamp; cura non oggetto = `null`) | piano 18-01, casi `it.each` D-23 |
| T-18-02 | Tampering (contenuto) | `cureInjuries`, `cureOf` | mitigated | `quest-cure.ts:24` `canHeal.filter(isInjuryType)`; `cure-injuries.ts`; `heal-no-effect.ts` filtra anche le ferite del personaggio con `isInjuryType` | ferita ignota scartata |
| T-18-03 | Denial of service | `lifePointsAfterCure` | mitigated | `quest-cure.ts` `lifePointsWithin(Math.max(hp, round(max*share)), max)`: mai NaN, sotto 1 o sopra il massimo | piano 18-01 |
| T-18-04 | Tampering (contenuto) | `QuestCureSchema` | mitigated | `min`/`max`/`required` sulla quota ed enum su `canHeal` (casi `create`/`validateSync` del piano 18-02); barriera sugli update = `cureOf` | piano 18-02 |
| T-18-05 | Tampering (contratto) | `src/schema.gql` | mitigated | `git diff origin/develop -- src/schema.gql \| grep -cE '^-[^-]'` = 0; boot reale 84/84 e `git diff --exit-code src/schema.gql` = 0 (REVIEW-FIX) | solo righe aggiunte |
| T-18-06 | Elevation of privilege | `QuestCureInput` | accepted | nessuna mutation usa `QuestInput` (D-24); `grep -c 'QuestCureInput\|LootRecoveryInput\|QUEST_NO_EFFECT' src/schema.gql` = 0 | classe senza superficie sul filo |
| T-18-07 | Tampering (regola) | aid clonata | mitigated | `clonedPrizesOf` invariata a sei chiavi; caso `does not clone the cure of the failed quest (D-23)` | piano 18-02 |
| T-18-08 | Information disclosure | `QuestResult.injuriesHealed` | accepted | elenco di enum del solo partecipante sul foglio già protetto dall'ownership dei risultati (Phase 9) | nessun dato altrui |
| T-18-09 | Tampering (contenuto) | `planParticipant` | mitigated | la cura passa solo da `cureOf` (`quest-cure.ts`); casi `D-23)` del piano 18-03 | quota fuori scala = 0 |
| T-18-10 | Tampering (regola) | ordine cura / combattimento | mitigated | test dedicato D-20 (ferite d'ingresso, nuove e level up nello stesso esito), piano 18-03 | |
| T-18-11 | Elevation of privilege | cura su una sconfitta | mitigated | `cure` letta solo con `won`; caso `cures nothing on a defeat (D-07)` | |
| T-18-12 | Tampering | scrittura dell'esito | accepted | filtro e transazione dell'esito invariati (Phase 9); caso sul filtro identico | piano 18-03 |
| T-18-13 | Tampering (regola) | ricarica toccata dal combattimento | mitigated | `git diff origin/develop..HEAD --name-only -- src/quests/outcomes/combat src/travel` = 0 file; lista esatta delle chiavi del set pinnata (D-16) | |
| T-18-14 | Tampering (contenuto) | `LootRecoverySchema` | mitigated | `required`, `min: 0`, intero, e dopo B-WR-02 `max` = `MAX_RECOVERY_VALUE` (2^31 − 1) in `src/models/loot-item.model.ts`; barriera sugli update = `recoveryTimeOf` (`item-use.plan.ts:87-96`) | fix B-WR-02 `4d22f6ba`/`7c76b588` |
| T-18-15 | Denial of service | `LootItem.recovery` sul filo | transferred | regola «entrambi i campi sempre presenti e interi, `time` in (0, 2^31 − 1]» nel runbook `BACKEND-NOTES.md` §3 (riga 213); ruling B-WR-02: nessuna sanificazione sul filo | a carico dell'orchestratore (script di contenuto con prova a secco) |
| T-18-16 | Information disclosure | `LootItem.relatedLore` | mitigated | campo filtrato per viewer da `LootItemRelatedLoreResolver` (`src/lore/related-lore.resolvers.ts:71-87`) | piano 18-05 |
| T-18-17 | Tampering (contratto) | `src/schema.gql` | mitigated | come T-18-05: 0 righe rimosse | |
| T-18-18 | Tampering | `potionRecoveryUntil` dal client | accepted | il campo non compare in nessun input (grep `potionRecoveryUntil` con `input` in `src` = vuoto); lo scrive solo `useItem` (`item-use.plan.ts`) | |
| T-18-19 | Information disclosure | `LootItemRelatedLoreResolver` | mitigated | `related-lore.resolvers.ts:85-87` `visibleLoreIdsOf(viewer, …)` prima del caricamento, `[]` senza id; resolver sul tipo | casi giocatore, oste, senza personaggio |
| T-18-20 | Information disclosure | cache del viewer fra subscriber | mitigated | `related-lore.resolvers.ts:85` usa `ViewerKnowledgeService.of(identity, context, info)` (Phase 16, `WeakMap` per evento e viewer in `viewer-knowledge.service.ts`); nessuna memo nuova | |
| T-18-21 | Denial of service | N+1 dell'oste su `relatedLore` | accepted | una query per oggetto con lore visibile, solo per l'oste e solo se selezionato; la FE non lo seleziona; dichiarato nel handoff | |
| T-18-22 | Tampering (contenuto) | ref malformati | mitigated | `visibleLoreIdsOf` scarta ref illeggibili; `item-use.plan.ts:111` `relatedLore.map(refIdOf).filter(isObjectId)`; orfani scartati dopo la `find` | |
| T-18-23 | Information disclosure | formatter | mitigated | `src/graphql/format-domain-error.ts:70-76` (`potionRecoveryOf`: solo `POTION_RECOVERING`, solo ISO canonico); `production-errors.ts:28` stessa funzione; nessuno spread delle extensions originali | casi `secret`, altro codice, non ISO; B-IN-03 caso graphql-ws |
| T-18-24 | Information disclosure | `recoveryUntil` sul filo | accepted | data di fine ricarica del chiamante, già leggibile in `CharacterStatus.potionRecoveryUntil` | |
| T-18-25 | Tampering (regressione) | `reason` di `SESSION_REVOKED` | mitigated | `revokeReasonOf` invariata (`format-domain-error.ts:60-68`); casi `D-13)` Phase 17 verdi (gate REVIEW-FIX) | |
| T-18-26 | Elevation of privilege | sonda di produzione | accepted | `ProductionProbeResolver` vive in `test/`, mai registrato in `src` | |
| T-18-27 | Tampering (contenuto) | lettori del catalogo | mitigated | `recoveryTimeOf` (`item-use.plan.ts:87`), `powerOf` (finita, > 0), `cureInjuries`, `refIdOf`; casi `D-23)` a tabella | |
| T-18-28 | Tampering (regola) | ricarica aggirata | mitigated | `now` dalla porta `Clock` (`item-use.service.ts` `this.clock.now()`); `refuseWhileRecovering(…, now)` (`item-use.plan.ts:240`); 0 occorrenze di `Date.now` aggiunte | caso al millisecondo |
| T-18-29 | Tampering | consumo senza effetto | mitigated | `ITEM_NO_EFFECT` sul piano prima di ogni scrittura; pila e ricarica nello stesso update (`item-use.plan.ts:254-262`) | B-IN-01: la bevuta non abbassa mai la vita |
| T-18-30 | Tampering | scrittura su stato cambiato | mitigated | `writeGuardOf` (`item-use.plan.ts:223-230`) pinna HP, ferite, quantità e ricarica sul valore grezzo letto | fix B-WR-01 `580f6848`/`98edd2f8` |
| T-18-31 | Elevation of privilege | bere in attesa di soccorso | mitigated | `item-use.plan.ts:137` rifiuto `awaitingAid`; filtro `'status.awaitingAid': null` (riga 227) | |
| T-18-32 | Elevation of privilege | IDOR su `useItem` | mitigated | `src/characters/items/item-use.resolver.ts`: solo `itemId` e `@CurrentUser()`; `item-use.service.ts:61-69` `currentCharacterOf(userId)` dal bearer; nessun `OwnsCharacter` né ramo sul ruolo (grep in `src/characters/items` vuoto) | caso `acts only on the character of the bearer, innkeeper included (D-21)` |
| T-18-33 | Spoofing | mutation senza bearer | mitigated | guard globale; `test/app.int-spec.ts:1021` `rejects useItem without a bearer (D-21)`; `useItem` assente da `EXPECTED_PUBLIC_HANDLERS` (`test/app.int-spec.ts:110`) | boot reale 84/84 |
| T-18-34 | Tampering | doppia bevuta | mitigated | `connection.transaction` con snapshot in sessione (`item-use.service.ts:52-54,76-96`); spec D-22 (una passa, l'altra `POTION_RECOVERING`) | |
| T-18-35 | Tampering | perdita di scrittura concorrente | mitigated | set dell'inventario solo in transazione; spec `keeps an inventory write that lands during the drink`; B-IN-02 `03d7990b` rende deterministica la corsa con spy su `updateOne` | |
| T-18-36 | Tampering | input malformato | mitigated | `ObjectIdPipe` su `itemId` (`item-use.resolver.ts`); valori di catalogo sanificati dal piano puro | |
| T-18-37 | Denial of service | nessun throttling | accepted | mutation di gioco fuori dalla lista dei limitati (Phase 10 D-08); la ricarica è il limite e i rifiuti non scrivono | |
| T-18-38 | Information disclosure | log del servizio | mitigated | `git diff origin/develop..HEAD -- src \| grep -E '^\+.*(logger\|Logger\|console)\.'` = vuoto; `item-use.service.ts` senza logger | |
| T-18-39 | Tampering (regola) | combattimento e ricarica | mitigated | `src/quests/outcomes/combat` e `src/travel` senza diff; `grep -rn potionRecoveryUntil` su entrambi = 0 occorrenze | D-16 |
| T-18-40 | Tampering (regola) | `acceptQuest` | mitigated | `src/quests/acceptance/quest-acceptance.service.ts:362-363` `healHasNoEffect(subject, quest.prizes?.cure)` → `GameRuleException.questNoEffect()`; casi di accettazione e rifiuto sul replica set | la FE non calcola |
| T-18-41 | Tampering | scrittura parziale su rifiuto | mitigated | il rifiuto sta prima di città, movimento, fame e transazione; «nulla scritto» provato sui documenti grezzi di quattro collection (piano 18-09) | |
| T-18-42 | Tampering (contenuto) | cura malformata | mitigated | `heal-no-effect.ts:14` `cureOf` dentro il predicato: `null` = nessun effetto per nessuno | |
| T-18-43 | Tampering | corsa pre-lettura / claim | accepted | una heal senza effetto accettata e risolta come oggi (D-25); nessun dato corrotto, heal gratuite (D-06) | |
| T-18-44 | Denial of service | heal senza `cure` fra merge e contenuto | accepted | fail-safe voluto (D-01): heal senza `cure` rifiutate (`QUEST_NO_EFFECT`) finché il contenuto non è applicato; finestra scritta nel handoff §3 e (PR in draft fino ad allora) | disposizione del piano `transfer`, ruling: accepted |
| T-18-45 | Information disclosure | `ViewerVitalsService` | mitigated | `src/quests/no-effect/viewer-vitals.service.ts`: `WeakMap` per contesto/evento con `Map` per `ruolo:userId`, nessuna cache condivisa fra viewer; casi a due subscriber e due eventi; A-IN-02 `4d1e1fe4` (la vita cambia fra due eventi) | |
| T-18-46 | Information disclosure | `Quest.noEffect` | accepted | booleano sul personaggio del chiamante; `read` senza ramo sul ruolo (commento e codice); senza personaggio → `null` → `false` | |
| T-18-47 | Tampering (regola) | campo e rifiuto in disaccordo | mitigated | un solo `healHasNoEffect` in `quest-acceptance.service.ts:362` e `quest-no-effect.resolver.ts:26`; tipo `heal` controllato in entrambi; A-IN-01 `53b42d17` (tabella di sei fatti, parità rifiuto ↔ campo) | |
| T-18-48 | Denial of service | letture per ogni quest | mitigated | `quest-no-effect.resolver.ts:22` ritorno `false` per i non heal senza lettura; una lettura per viewer per richiesta (memo) | |
| T-18-49 | Tampering (contratto) | `src/schema.gql` | mitigated | riga `noEffect: Boolean!` aggiunta, 0 rimosse; boot reale | |
| T-18-50 | Tampering (contratto) | `src/schema.gql` | mitigated | controllo trasversale 1: 0 righe rimosse, 0 occorrenze di input e codici nello SDL | |
| T-18-51 | Tampering | contenuto o migrazioni nel repo | mitigated | `git diff origin/develop..HEAD --name-only --diff-filter=A \| grep -iE 'migrat\|seed\|content/\|scripts/'` = vuoto | |
| T-18-52 | Information disclosure | codice e documenti | mitigated | 0 file `.env` nel diff, 0 `process.env.` aggiunti, 0 URI di connessione in `BACKEND-NOTES.md` | |
| T-18-53 | Repudiation | commit | mitigated | grep dei trailer vietati su 82 commit = 0 | |
| T-18-54 | Denial of service (qualità) | coverage | mitigated | `package.json` senza diff; soglia `./src/quests/acceptance/` presente in `package.json:178`; `test:cov` in carico all'orchestratore (in corso) | |
| T-18-55 | Tampering (processo) | requisiti di contenuto chiusi senza contenuto | mitigated | `.planning/REQUIREMENTS.md` righe 15 e 20: BE-HEAL-03 e BE-HEAL-08 `[ ]`, tabella righe 70 e 75 `Pending` | restano pendenti fino al contenuto |
| T-18-56 | Tampering | script di contenuto malformati | transferred | regole di forma e prova a secco nel runbook `BACKEND-NOTES.md` §3; lettori sanificanti nel codice (fail-safe D-01, D-23) | applicazione a cura dell'orchestratore dopo l'OK dell'utente |

## Controlli trasversali

```
$ git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'
0
$ grep -c 'QuestCureInput\|LootRecoveryInput\|QUEST_NO_EFFECT' src/schema.gql
0
$ git diff origin/develop..HEAD -- src | grep -cE '^\+.*(Math\.random|Date\.now)'
0
$ git diff origin/develop..HEAD -- src | grep -cE '^\+.*process\.env\.'
0
$ git diff origin/develop..HEAD --name-only | grep -cE '\.env'
0
$ git diff origin/develop..HEAD --name-only --diff-filter=A | grep -iE 'migrat|seed|content/|scripts/'
(vuoto)
$ git diff origin/develop..HEAD -- src | grep -E '^\+.*(logger|Logger|console)\.'
(vuoto)
$ git log origin/develop..HEAD --format=%B | grep -ciE "co-authored-by|generated with|claude-session"
0
$ git diff origin/develop..HEAD -- package.json package-lock.json | wc -l
0
$ git diff origin/develop..HEAD --name-only -- src/quests/outcomes/combat src/travel | wc -l
0
```

Righe SDL aggiunte (solo additive): `LootItem.recovery: LootRecovery`, `LootItem.relatedLore: [Lore!]!`, `type LootRecovery { time: Int!, turns: Int! }`, `CharacterStatus.potionRecoveryUntil: DateTime`, `Mutation.useItem(itemId: ID!): UseItemResult!`, `Quest.noEffect: Boolean!`, `type QuestCure { canHeal, lifePointsShare }`, `Quest.prizes.cure: QuestCure`, `QuestResult.injuriesHealed: [InjuryType!]!`, `type UseItemResult { hpAfter, hpBefore, injuriesHealed, loreUnlocked, quantityLeft, recoveryUntil }`.

Esame del codice:

- `useItem`: `item-use.resolver.ts` espone solo `itemId` (con `ObjectIdPipe`) e `@CurrentUser()`; nessun `OwnsCharacter`, nessuna lettura del ruolo in `src/characters/items`; una sola `updateOne` dentro `connection.transaction` (`item-use.service.ts:52,93`) con `plan.filter` che ripete le precondizioni; `matchedCount === 0` → `ITEM_NOT_OWNED`.
- `extensions.recoveryUntil`: `grep -n '\.\.\.'` su `format-domain-error.ts` e `production-errors.ts` mostra solo spread di `revokeReasonOf`, `potionRecoveryOf`, `locations`, `path`, `requestId` e del `sanitized` già ricostruito; nessuno spread delle extensions originali.
- `Quest.noEffect` e `LootItem.relatedLore`: risolti per viewer; memo `WeakMap` per contesto/evento con chiave interna per viewer; senza personaggio `noEffect` = `false` e `relatedLore` = lista vuota; nessun ramo sul ruolo per `noEffect`.
- Sanificazione in lettura: `cureOf` (quota fuori [0, 1] = 0), `recoveryTimeOf` (intero in (0, 2^31 − 1]), `cureInjuries` (ferite ignote scartate), cura sul filo da `cureOf` in `dropOrphanCatalogRefs` (`src/quests/quest-catalog.populate.ts:80`, fix A-WR-01 `74fe25bc`/`3c27c4b7`, copre `quests`, `quest(id)` e `questUpdated`).

## Aperte

Nessuna.

## Differite

Nessuna minaccia differita. Residuo operativo, non una minaccia aperta: BE-HEAL-03 e BE-HEAL-08 (contenuto a DB dopo la merge) restano `Pending` per costruzione (T-18-44, T-18-15, T-18-56); `LootItem.recovery` non è sanificata sul filo (ruling B-WR-02), quindi i valori scritti col driver nativo oltre 2^31 − 1 rompono la serializzazione delle liste che la selezionano: lo script di contenuto deve validarli.

## Flag di minaccia non registrati

Nessuno: i SUMMARY dei piani non riportano flag senza mappatura.
