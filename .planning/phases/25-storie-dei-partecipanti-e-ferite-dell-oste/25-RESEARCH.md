# Phase 25: Storie dei partecipanti e ferite dell'oste - Research

**Ricercato:** 2026-11-21
**Dominio:** NestJS 11 + Mongoose 8 + Apollo code-first — esiti delle quest, correzioni dell'oste, bozza del flusso guidato, cure
**Confidenza:** HIGH sul codice letto (ogni affermazione porta file:riga); MEDIUM sulle forme raccomandate (scelte di progetto, non fatti); un'assunzione sui dati reali (A1)

<user_constraints>
## User Constraints (from CONTEXT.md)

Fonte: `25-CONTEXT.md` (lato BE) e, autorevole, `Klimmeck-Guide/.planning/phases/24-participants-stories-and-innkeeper-wounds/24-CONTEXT.md` (stessa numerazione D-01..D-17).

### Locked Decisions

**Lettura dei background**
- **D-01/D-02 (utente):** l'oste legge il background di ogni partecipante **prima** di avviare la missione, coi giocatori ancora liberi; la lettura non crea la bozza. Serve quindi una lettura riservata all'oste dei background dei partecipanti di una richiesta in sospeso, disponibile senza bozza (forma a discrezione: campo su `missionParticipants` o query dedicata).

**Aggiunte ai background**
- **D-05 (utente):** le aggiunte si scrivono nell'ultimo passo, dopo il riepilogo; vivono nella bozza (salvate e riservite come il resto) e la chiusura le scrive nella **stessa transazione** del completamento.
- **D-06 (utente, verbatim):** «Le aggiunte sono per partecipante, non una sola per tutti»: una per partecipante, facoltativa; vuota = nessuna scrittura.
- **D-07 (utente):** al massimo 1000 caratteri per aggiunta, stessa regola di conteggio del background della creazione (che resta a 400); validazione sul BE, codice d'errore proprio.
- **D-08:** l'aggiunta diventa una voce nuova in coda a `infos.background`; le voci esistenti non si toccano.
- **D-09 (utente):** il `QuestResult` del partecipante dice se il suo background ha ricevuto un'aggiunta (nome del campo nel plan): il FE ne ricava la riga del foglio del risultato. Nessuna push dedicata.
- **D-10:** solo flusso guidato (`story`, `worldMission`).

**Ferite dell'oste**
- **D-11 (utente, verbatim):** «Le ferite applicate dall'innkeeper sono rimuovibili solo dall'innkeeper, non sono influenzabili da quest heal, pozioni o premi».
- **D-12 (utente):** è dell'oste la ferita aggiunta a mano nelle correzioni di una risoluzione, di qualunque tipo di quest (flusso guidato o richiesta in sospeso semplice). Nel flusso guidato: le ferite dell'esito corretto che la simulazione non ha prodotto. Le ferite simulate lasciate come sono restano normali.
- **D-13 (utente; emendata il 2026-11-21, verbatim: «Le correzioni possono rimuovere qualsiasi tipo di ferita, quelle dell'oste e non»):** le correzioni di ogni risoluzione (flusso guidato e richieste in sospeso semplici) possono togliere qualunque ferita del partecipante, dell'oste o normale: l'input delle correzioni impara a togliere (oggi porta solo aggiunte) e la lettura dell'oste dice quali ferite del partecipante sono dell'oste.
- **D-14:** nessuna cura raggiunge una ferita dell'oste: cura della quest heal, pozione dal Diario, cura dentro un premio (blocco del titolo, premio guidato `cure`) e ogni altra via trovata dalla ricerca. `injuriesHealed` non la elenca mai; una cura che troverebbe solo ferite dell'oste è senza effetto, e gli avvisi e i rifiuti «senza effetto» esistenti la trattano così.
- **D-15 (utente):** il giocatore la riconosce («Troppo grave per essere curata»): il personaggio servito dice quali sue ferite sono dell'oste.
- **D-16 (default tecnico):** il personaggio conserva l'origine delle ferite; forma nel plan, additiva sul filo se possibile (per esempio una seconda lista col sottoinsieme dell'oste: le ferite già a DB restano normali, nessuna migrazione). I malus non dipendono dall'origine. **Emendata il 2026-11-21 (utente, verbatim: «l'oste per rendere non curabile una ferita curabile già presente deve prima rimuoverla e poi aggiungerla di nuovo»):** una ferita già presente non si aggiunge di nuovo e non cambia origine da sola; per farla diventare dell'oste la si toglie e la si riaggiunge nella stessa correzione.
- **D-17 (superata il 2026-11-21 dall'emendamento di D-13):** l'assunzione è ritirata: ogni ferita si toglie dalle correzioni.

**Portate avanti (24-CONTEXT, non richieste di nuovo):** il backend è fonte di verità; le modifiche SDL non additive si dichiarano nel handoff; i migratori one-off escono dal repo dopo il boot reale; nessun file di contenuto nei repo.

### Claude's Discretion
- Nomi di campi e tipi sul filo, forma della bozza per le aggiunte, la query che serve i background all'oste (l'oste legge i personaggi di altri giocatori: solo admin, come il resto del flusso).
- (Lato FE, non di questa fase: layout delle due pagine, segno della ferita dell'oste.)

### Deferred Ideas (OUT OF SCOPE)
Nessuna emersa nel discuss. Fuori ambito dichiarato: modifica o cancellazione delle voci di background esistenti, editor del background per il giocatore, malus delle ferite, motore di combattimento vero, iOS.
</user_constraints>

## Summary

Le ferite oggi sono una lista piatta `status.injuries: InjuryType[]` (`src/models/character/character-status.model.ts:47-49`) senza origine. Ogni via che le **aggiunge** passa da un'unica funzione pura, `woundsAfter` (`src/quests/outcomes/outcome-plan.ts:281-289`), che scarta i doppioni e non toglie mai nulla; ogni via che le **cura** passa da un'unica funzione pura, `cureInjuries` (`src/quests/outcomes/injuries/cure-injuries.ts:5-16`), con tre soli chiamanti (piano dell'esito, pozione, predicato «senza effetto»). Nessuna via oggi **toglie** una ferita fuori da una cura: le correzioni dell'oste portano solo aggiunte, in entrambi i flussi. [VERIFIED: grep su `src/` di ogni occorrenza di `njur`, 2026-11-21]

Questa concentrazione rende la fase piccola nel perimetro e delicata in tre punti: (1) la cura dentro il piano dell'esito gira **dopo** le ferite del combattimento nello stesso piano, quindi una ferita dell'oste appena inflitta verrebbe curata dal premio dello stesso completamento se la protezione non entra in `planParticipant`; (2) l'aggregato multi-scontro del flusso guidato **unisce** le ferite aggiunte (`src/quests/guided/guided-outcome.ts:87-91`) e con le rimozioni un'unione non basta più: serve una piega in ordine sugli scontri; (3) il confronto «correzione invariata» della bozza (`src/quests/guided/mission-draft-save.service.ts:94-104`) non vedrebbe una correzione che cambia solo le rimozioni.

Per i background non serve **nessuna lettura nuova**: `character(id)` è già aperta all'oste (`src/characters/characters.resolver.ts:42-46`, esenzione in `src/authz/ownership/character-access.policy.ts:105-106`) e serve `infos.background` e `status.injuries`; la FE la usa già per i partecipanti del flusso (`MissionParticipantsCubit` → `readCharacter`). Le aggiunte sono una sezione nuova della bozza, con un passo nuovo dopo `recap`, validate con la regola di conteggio della creazione (grafemi + tetto in unità UTF-16) e scritte nella transazione del completamento.

**Primary recommendation:** origine come seconda lista additiva `status.innkeeperInjuries` (sottoinsieme per **tipo** di `injuries`); un solo modulo puro nuovo `src/quests/outcomes/injuries/innkeeper-injuries.ts` che possiede (a) la protezione delle cure e (b) l'applicazione di una correzione (togli, poi aggiungi, con origine); `ParticipantOverrideInput.injuriesRemoved` additivo; nessuna query nuova per i background; sezione `backgroundAdditions` e passo `stories` nella bozza; `QuestResult.backgroundEntryAdded` e `QuestResult.injuriesRemoved`.

## Project Constraints (from CLAUDE.md)

Da `CLAUDE.md` del repo BE e da `22-REPO-RULES.md` (regole degli esecutori, valide anche qui salvo ruling diverso dell'orchestratore):

- **TDD obbligatorio**: RED → `test(<scope>): …`, GREEN → `feat|fix(<scope>): …`; ogni regola nuova ha un test il cui titolo nomina la decisione (`(D-14)`).
- **Compatibilità FE**: i contratti GraphQL consumati dal FE non si rompono; SDL solo additivo salvo dichiarazione nel handoff.
- **Branch + PR verso `develop`**, Conventional Commits in inglese, subject ≤ 72 caratteri, **nessun trailer** `Co-Authored-By` / `Generated with`.
- **Mai `npm run lint`** (esegue `eslint --fix` su tutto il repo) né `npm run format`: solo `npx prettier --write <file>` e `npx eslint <file>` sui file toccati.
- **Jest**: percorsi **prima** di `--selectProjects`; integration sempre `--runInBand`; mai in background; `pgrep -fl 'bin/jest'` vuoto a fine task.
- **Mai `npm run build` / `nest build`** dagli esecutori (`deleteOutDir: true`, il BE dell'utente gira da `dist/`).
- **Segreti**: mai leggere né stampare `.env`; il database reale non si tocca dagli esecutori; nessuna variabile d'ambiente nuova; nessun `process.env.` fuori dai provider di config.
- **Nessun file di contenuto nel repo**; migratori one-off fuori dal repo dopo il boot.
- `src/schema.gql` si rigenera solo con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e si committa nel piano che cambia i decoratori; i blocchi pinnati in `test/app.int-spec.ts` si aggiornano **prima** (RED).
- Nessun `Math.random` / `Date.now`: porte `ChanceSource` e `Clock`. Nessun tiro nuovo prima di quelli esistenti (questa fase non ne aggiunge).
- Nessuna intersezione di interfacce di dominio negli update di Mongoose.
- Stile: Prettier (apici singoli, virgole finali, 4 spazi), import assoluti `src/…`, messaggi utente in italiano, commenti minimi in italiano.
- Documenti `.md` in italiano; gli operatori Mongo solo in code span.
- Handoff per fase: `BACKEND-NOTES.md` nella cartella della fase.

<phase_requirements>
## Phase Requirements

La ROADMAP dice «Requirements: TBD (nel plan)» (`.planning/ROADMAP.md:303-308`). Proposta di ID per il planner (da confermare):

| ID proposto | Descrizione | Supporto della ricerca |
|----|-------------|------------------|
| BE-WOUND-01 | Il personaggio conserva e serve l'origine delle ferite (`innkeeperInjuries`), additivo, senza migrazione (D-15, D-16) | §Q2 |
| BE-WOUND-02 | Nessuna cura tocca una ferita dell'oste né la elenca in `injuriesHealed`: premio del titolo, premio guidato, pozione (D-11, D-14) | §Q1 righe C1–C3 |
| BE-WOUND-03 | «Senza effetto» ignora le ferite dell'oste: `acceptQuest`, `Quest.noEffect`, `ITEM_NO_EFFECT` (D-14) | §Q1 righe C3–C5 |
| BE-WOUND-04 | Le correzioni tolgono qualunque ferita (`injuriesRemoved`) in entrambi i flussi (D-13) | §Q3 |
| BE-WOUND-05 | La ferita aggiunta a mano è dell'oste: tutte nel flusso semplice, corretto meno simulato nel guidato; togli-e-riaggiungi cambia origine (D-12, D-16) | §Q3 |
| BE-WOUND-06 | Origine e rimozioni scorrono fra gli scontri di una missione guidata e la bozza le serve all'oste (D-13) | §Q3 «Multi-scontro» |
| BE-STORY-01 | L'oste legge i background dei partecipanti senza bozza (D-01, D-02) | §Q4 «Lettura» |
| BE-STORY-02 | Aggiunte per partecipante nella bozza, passo dopo `recap`, salvate e riservite (D-05, D-06) | §Q4 «Aggiunte» |
| BE-STORY-03 | Tetto di 1000 con la regola di conteggio della creazione, codice proprio (D-07) | §Q4 «Validazione» |
| BE-STORY-04 | Scrittura in coda a `infos.background` nella transazione del completamento (D-05, D-08) | §Q4 «Scrittura» |
| BE-STORY-05 | `QuestResult` dice se il background ha ricevuto un'aggiunta (D-09) | §Q4 «Risultato» |
| BE-STORY-06 | SDL additivo, handoff `BACKEND-NOTES.md` con SDL verbatim e selezioni per la FE | §Q5 |
</phase_requirements>

## Standard Stack

Nessuna libreria nuova. Tutto con ciò che è già installato. [VERIFIED: `node_modules/*/package.json`]

| Libreria | Versione installata | Uso nella fase |
|---------|---------|---------|
| @nestjs/graphql | 13.2.0 | campi e input additivi code-first |
| mongoose | 8.18.1 | `@Prop` nuovi con default, update in sessione |
| class-validator / class-transformer | già in uso | forma degli input nuovi (`IsEnum`, `ArrayMaxSize`, `MaxLength`) |
| jest | 30.1.3 | progetti `unit` e `integration` |
| `Intl.Segmenter` (Node 22.12.0) | runtime | conteggio dei grafemi, già in `src/characters/creation/grapheme-count.ts:1-8` |

**Installazione:** nessuna. Nessun pacchetto esterno da verificare.

## Q1 — Inventario: ogni via che legge, aggiunge, cura o toglie ferite

[VERIFIED: grep completo di `njur` sui `.ts` non di test di `src/`, poi lettura dei file]

### Vie che CURANO (le sole da proteggere)

| # | Dove | Cosa fa oggi | Cosa cambia |
|---|------|--------------|-------------|
| C0 | `src/quests/outcomes/injuries/cure-injuries.ts:5-16` | toglie ogni copia dei tipi in `canHeal`, li riporta una volta in `healed` | terzo parametro `untouchable` (le ferite dell'oste): un tipo protetto resta in `injuries` e non entra in `healed`. È l'unico punto dove vive la regola D-14 |
| C1 | `src/quests/outcomes/outcome-plan.ts:465-470` (`planParticipant`) | `fought = woundsAfter(...)`, poi `cured = cureInjuries(fought.injuries, cure?.canHeal ?? [])`; scrive `'status.injuries': cured.injuries` (`:590`) e `injuriesHealed: cured.healed` (`:633`) | la cura riceve le ferite dell'oste **dopo** il combattimento (quelle a DB meno le tolte, più quelle inflitte a mano in questo esito). Copre: cura del blocco del titolo nel flusso semplice (`gm-completion.service.ts:138-145`), premio guidato `cure` (`guided/chosen-rewards.ts:67`), quest heal e ogni quest vinta con `prizes.cure` (risoluzione standard, stessa funzione) |
| C2 | `src/characters/items/item-use.plan.ts:235` (`drinkEffectOf`) | `cureInjuries(snapshot.status.injuries ?? [], potion.canHeal)` | passa `innkeeperInjuriesOf(snapshot.status)`; `status.innkeeperInjuries` arriva già (proiezione `status: 1`, `:43`); aggiungere il campo al tipo `ItemUseCharacterSnapshot.status` (`:66-79`) |
| C3 | `src/characters/items/item-use.plan.ts` `refuseWithoutEffect` (chiamata `:284` circa, corpo sopra `drinkEffectOf`) | `ITEM_NO_EFFECT` se vita invariata e `cured.healed` vuoto | nessuna modifica propria: legge `healed`, che C2 rende già corretto. Va provato con un test (pozione che curerebbe solo una ferita dell'oste, vita piena → `ITEM_NO_EFFECT`) |
| C4 | `src/quests/outcomes/injuries/heal-no-effect.ts:6-28` | `HealSubject { currentLifePoints, maxLifePoints, injuries }`; `healed.length === 0` | `HealSubject` guadagna `innkeeperInjuries` e lo passa a `cureInjuries` |
| C5a | `src/quests/acceptance/quest-acceptance.service.ts:395-407` (`effectiveOrReject`), proiezione `:139` | costruisce il soggetto da `status.injuries` | aggiungere `'status.innkeeperInjuries': 1` alla proiezione e il campo al soggetto (rifiuto `QUEST_NO_EFFECT`) |
| C5b | `src/quests/no-effect/viewer-vitals.service.ts:17-23` (proiezione), `:96-101` (soggetto) → `quest-no-effect.resolver.ts:16-27` (`Quest.noEffect`) | idem per il foglio strappato | stessa aggiunta a proiezione, tipo `VitalsCharacter` e soggetto |

Non esistono altre cure: la pozione del compagno risponde `injuriesHealed: []` (`item-use.plan.ts:459`) e non tocca il personaggio; riposo e recupero della Phase 23 non leggono le ferite; il soccorso (`rescue-plan.ts:71-72`) e la fine dell'apprendimento (`learning/learning-end-plan.ts:99-100`) scrivono liste vuote sul foglio e nessuna ferita. [VERIFIED: grep]

### Vie che AGGIUNGONO

| # | Dove | Natura | Cosa cambia |
|---|------|--------|-------------|
| A0 | `outcome-plan.ts:281-289` `woundsAfter(existing, added)` | funzione comune: aggiunge solo i tipi noti non già presenti, in coda | **resta com'è** per le vie automatiche: aggiungendo in coda senza togliere, non può rompere il sottoinsieme dell'oste |
| A1 | `outcome-plan.ts:465-469` (`planParticipant`, `battle?.injuriesAdded`) | combattimento vero, dungeon, boss **e** correzioni dell'oste (flusso semplice e guidato arrivano qui da `gm-completion.service.ts:211-228`) | qui entra `applyWoundCorrection` (§Q3) al posto di `woundsAfter` quando `battle` porta rimozioni o origine; scrive anche `'status.innkeeperInjuries'` |
| A2 | `unrewarded-plan.ts:70-73`, `:107`, `:132-133` | esiti senza premio della corsia standard (arresto, guardia) | nessuna: mai dell'oste, mai rimozioni |
| A3 | `guard/guard-outcome.ts:95-102` (`foughtSnapshotOf`), `:120` (`mergedEffects`) | scontro di guardia dopo una crime | nessuna |
| A4 | `travel/ambush/ambush-plan.ts:215-218`, `:254`, `:286` | imboscata in viaggio | nessuna |
| A5 | `combat/placeholder-combat-resolver.ts:84-91` (`newInjuryOf`) | il motore segnaposto tira una ferita fra quelle **non** possedute | nessuna (i malus non dipendono dall'origine, D-16) |
| A6 | `dungeon/placeholder-dungeon-resolver.ts:102`, `:127` | unione delle ferite fra le tappe | nessuna |
| A7 | `gm-overrides.ts:139-144` (`injuriesOf`), `:192` | override dell'oste → `injuriesAdded` | §Q3 |
| A8 | `guided/fight-state.ts:45-87` (`afterFight`), `guided/guided-outcome.ts:75-110` (`aggregateEffectsOf`) | sovrapposizione fra scontri e aggregato della missione guidata | §Q3 «Multi-scontro» |

### Vie che LEGGONO soltanto (nessuna modifica)

| Dove | Lettura |
|------|---------|
| `combat/combat-context.ts:235` | ferite del partecipante per i malus del motore |
| `combat/placeholder-combat-resolver.ts:53`, `:154`; `injuries/injury-rules.ts:97-121` | malus di danno, vita e velocità: indipendenti dall'origine (D-16) |
| `travel/travel-planner.service.ts:83`, `:140`, `:228`; `ambush-plan.ts:351-352`, `:378` | velocità di viaggio |
| `quest-acceptance.service.ts:449` | ferite passate al piano del viaggio automatico |
| `characters/creation/starting-character.ts:64` | `injuries: []` alla creazione (il default del nuovo `@Prop` copre `innkeeperInjuries`) |
| `guided/fight-state.ts:132` (`fightStartOf`) | `injuriesBefore` di ogni scontro → §Q3 aggiunge `innkeeperInjuriesBefore` |

### Guardia di scrittura da allargare

`item-use.plan.ts:256-270` (`writeGuardOf`) pinna `'status.injuries': injuries ?? null`. Un togli-e-riaggiungi dell'oste sull'**ultima** ferita della lista lascia `injuries` identica (`[A, X]` → `[A]` → `[A, X]`) e cambia solo l'origine: una pozione pianificata sullo snapshot vecchio la curerebbe. Aggiungere `'status.innkeeperInjuries': innkeeperInjuries ?? null` alla guardia (stessa forma «assente = null» già usata per `injuries`). Probabilità bassa (nel flusso guidato i partecipanti sono già bloccati da `MISSION_IN_PROGRESS`; nel flusso semplice no), costo nullo. [VERIFIED: lettura del codice; la corsa è un ragionamento, non un test]

## Q2 — Forma dell'origine (D-16)

**Raccomandazione: seconda lista `status.innkeeperInjuries: InjuryType[]`, sottoinsieme per tipo di `status.injuries`.**

```typescript
// src/models/character/character-status.model.ts, accanto a injuries (:47-49)
@Field(() => [InjuryType])
@Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
innkeeperInjuries: InjuryType[];
```

Perché questa e non una lista di oggetti `{ type, origin }`:

| Criterio | Seconda lista | Lista di oggetti |
|----------|---------------|------------------|
| SDL | **additivo**: `CharacterStatus.innkeeperInjuries: [InjuryType!]!` | breaking (`injuries` cambia tipo) o campo parallelo da tenere allineato |
| DB | nessuna migrazione: campo assente = nessuna ferita dell'oste | migrazione di ogni personaggio |
| Chiamanti di `status.injuries` | invariati (≈ 20 punti di lettura, §Q1) | tutti da riscrivere |
| Guardie di scrittura sull'uguaglianza della lista (`item-use.plan.ts:266`) | restano valide | da riscrivere |
| Spec che pinnano l'intero `$set` (`outcome-plan.spec.ts`, `item-use.plan.spec.ts`) | toccate solo dove la chiave nuova compare | tutte |

**Invarianti e loro custode** (un solo modulo: `src/quests/outcomes/injuries/innkeeper-injuries.ts`):

1. **L'origine è per tipo, non per copia.** `injuries` può contenere doppioni e stringhe legacy sconosciute (lo provano i casi «reports a duplicated injury once and removes every copy» e «leaves a legacy unknown injury of the character where it is» di `cure-injuries.spec.ts:25,38`). `woundsAfter` non aggiunge un tipo già presente, quindi un tipo ha una sola origine; se è protetto, **tutte** le sue copie restano.
2. **Lettura normalizzata.** `innkeeperInjuriesOf(status)` = tipi noti (`isInjuryType`), senza doppioni, presenti in `status.injuries`; campo assente o `null` = `[]`. Ogni lettura di dominio passa da qui: le letture `lean` non applicano i default di Mongoose (snapshot degli esiti, della pozione, dell'accettazione, bozza) quindi il campo **è** `undefined` sui personaggi di oggi.
3. **Sottoinsieme garantito alla scrittura.** Le cure non tolgono mai un tipo protetto (C0); le rimozioni dell'oste tolgono da entrambe le liste (§Q3); le aggiunte automatiche aggiungono solo in coda a `injuries`. Nessun'altra via scrive `status.injuries` (verificato: le sole chiavi `'status.injuries'` in `src/` sono `outcome-plan.ts:590`, `unrewarded-plan.ts:107`, `ambush-plan.ts:254`, `item-use.plan.ts:299`).
4. **Si scrive solo se cambia.** `planParticipant` aggiunge `'status.innkeeperInjuries'` al `$set` solo quando la lista finale differisce da quella letta (spread condizionale, come `titleAfter` a `outcome-plan.ts:596`): gli esiti standard non scrivono la chiave e le spec che pinnano l'update intero restano verdi.

**Sul filo:** campo semplice con `@Field` + `@Prop` (nessun `@ResolveField`): `character(id)`, `characters`, `me.currentCharacter` e `characterUpdated` servono documenti idratati (`characters.service.ts:124-145`, `character-updates.publisher.ts:52-56`), sui quali il default `[]` vale anche per i personaggi senza il campo. Da provare al boot reale con un personaggio legacy scritto col driver nativo senza il campo (stile «keeps legacy characters without the deletedAt field visible», `archived-character-visibility.int-spec.ts:374`).

**`CharacterStatusInput`** (`character-status.model.ts:99-124`) non è usato da nessuna mutation (`CharacterInput` compare solo nella sua definizione, `character.model.ts:132`): nessun client può scrivere l'origine. Non aggiungervi il campo. [VERIFIED: grep]

## Q3 — Le correzioni: cosa significano oggi e cosa diventano

### Oggi

| Flusso | Dove | Significato di `injuries` |
|--------|------|---------------------------|
| Semplice (`completePendingRequest`) | `ParticipantOverrideInput.injuries` (`src/models/request/complete-pending-request.model.ts:64-69`) → `gm-overrides.ts:139-144` → `injuriesAdded` (`:192`) → `planParticipant` → `woundsAfter` | **sole aggiunte**. Non c'è simulazione: `GmCompletionService.complete` valida gli override e li usa come esito (`gm-completion.service.ts:104-109`, `:121-133`), nessuna chiamata al `CombatResolver`; «nessun override = nessun combattimento» (`gm-overrides.ts:202`). Una ferita già posseduta è ignorata in silenzio da `woundsAfter`. Nessun modo di togliere |
| Guidato (`saveMissionDraft`) | `MissionFightInput.corrections: [ParticipantOverrideInput!]` (`guided/mission-draft.inputs.ts:79-96`) | **lista completa delle ferite che lo scontro aggiunge dopo la correzione**: sostituisce `simulated.injuriesAdded`; omessa o `null` = quelle simulate (`guided-outcome.ts:209-224`, riga `:219`). Una ferita presente in `injuriesBefore` dichiarata fra le aggiunte è rifiutata con `OUTCOME_OVERRIDE_INVALID` (`fight-state.ts:145-151`, chiamata in `mission-draft-save.service.ts:383-386` e, al completamento, `guided-completion.service.ts:99-103`). Nessun modo di togliere una ferita di prima (era la D-14 della Phase 22: «le ferite di prima della missione non si toccano; guarirle è il premio cure») |
| Bozza servita | `MissionFightOutcome { injuriesBefore, simulated { injuriesAdded }, corrected { injuriesAdded } }` (`guided/mission-draft.wire.ts:38-55`, `:82-108`) | `injuriesBefore` = ferite all'inizio di quello scontro (stato reale + effetti effettivi degli scontri precedenti, `fight-state.ts:125-142`), fotografate alla simulazione |

La D-14 della Phase 22 è **superata** dalla D-13 emendata di questa fase: il test «refuses a correction that adds an injury the character already had (D-14)» resta valido (una ferita presente non si riaggiunge, salvo toglierla nella stessa correzione), mentre il divieto di togliere cade.

### Modello raccomandato

**Input (additivo):** `ParticipantOverrideInput.injuriesRemoved: [InjuryType!]` nullable, con gli stessi decoratori di `injuries` (`@IsOptional @IsArray @ArrayMaxSize(MAX_OVERRIDE_ENTRIES) @IsEnum(InjuryType, { each: true })`). `injuries` conserva il significato di oggi in ciascun flusso. Un solo input serve entrambi i flussi perché `corrections` riusa già `ParticipantOverrideInput`.

**Effetti (interni):** `ParticipantEffects` (`combat/combat-resolver.ts:89-99`) guadagna due campi **opzionali** che il motore non valorizza mai:

```typescript
// tolte dall'oste prima delle aggiunte di questo esito (D-13)
injuriesRemoved?: InjuryType[];
// sottoinsieme di injuriesAdded inflitto a mano (D-12)
innkeeperInjuries?: InjuryType[];
```

**Una sola funzione applica una correzione** (nuova, pura, in `innkeeper-injuries.ts`), usata da `planParticipant` e da `afterFight`:

```typescript
// stato S (injuries) e K (innkeeperInjuries); R = tolte, A = aggiunte, H ⊆ A = a mano
// 1. S' = S senza i tipi di R;  K' = K senza R
// 2. fresh = tipi noti di A non in S' (senza doppioni);  S'' = S' + fresh;  K'' = K' ∪ (H ∩ fresh)
export function applyWoundCorrection(
    status: { injuries?: readonly unknown[] | null; innkeeperInjuries?: readonly unknown[] | null },
    effects: Pick<ParticipantEffects, 'injuriesAdded' | 'injuriesRemoved' | 'innkeeperInjuries'> | null,
): { injuries: InjuryType[]; innkeeperInjuries: InjuryType[] };
```

Con `R` e `H` vuoti coincide con `woundsAfter` (stesso ordine, stessi scarti): la sostituzione in `planParticipant` non cambia nessun esito esistente. Da provare con un test di equivalenza.

**(a) «Aggiunta a mano» = ferita dell'oste (D-12)**

- *Flusso semplice:* non esiste una base simulata, quindi **ogni** ferita dell'override è a mano. `validateOverrides` è condivisa col flusso guidato e non deve decidere l'origine: la marca il chiamante, in `gm-completion.service.ts:132-133` (`innkeeperInjuries = injuriesAdded` degli effetti dell'override).
- *Flusso guidato, per scontro:* `H = (corretto.injuriesAdded − simulato.injuriesAdded) ∪ (corretto.injuriesAdded ∩ corretto.injuriesRemoved)`. Il primo termine è la D-12 alla lettera; il secondo copre il togli-e-riaggiungi anche nel caso limite in cui il simulato contenga una ferita già posseduta (caso reale: «passes through a simulated injury the character already owns (D-14)» in `guided-completion.service.int-spec.ts`). Uno scontro non corretto ha `H = []`: le ferite simulate restano normali. L'origine **non si salva** nella bozza: si deriva da `simulated` e `corrected` dello stesso `MissionFightOutcomeRecord`, quindi non può divergere.

**(b) Le correzioni tolgono qualunque ferita (D-13)**

- Validazione, in un solo predicato che sostituisce `assertAddsOnlyNewInjuries` (`fight-state.ts:145-151`): `R ⊆ ferite all'inizio` e `A ∩ (ferite all'inizio − R) = ∅`; violazione → `OUTCOME_OVERRIDE_INVALID`. Nel guidato l'«inizio» è `injuriesBefore` dello scontro (al salvataggio) e lo stato sovrapposto riletto in sessione (al completamento). Togliere una ferita aggiunta dalla simulazione di **questo** scontro resta ciò che è oggi: non elencarla in `injuries`.
- Nel flusso semplice `validateOverrides` non conosce le ferite del partecipante: `OverrideParticipant` (`gm-overrides.ts:25-33`) guadagna `injuries`, letto dallo snapshot in `overrideParticipantOf` (`:77-103`); `R` non posseduta → `OUTCOME_OVERRIDE_INVALID` (l'oste ha agito su una vista vecchia). Una ferita già posseduta dichiarata in `injuries` senza toglierla resta **ignorata in silenzio**, come oggi: non cambia origine (D-16) e non rompe la FE pre-merge.
- Il tetto `overrideWithinCap` (`gm-overrides.ts:46-49`) deve contare anche `injuriesRemoved`.

**(c) Togli-e-riaggiungi nella stessa correzione (D-16 emendata)**

`X ∈ R` e `X ∈ A`: il passo 1 la toglie (e la toglie da `K`), il passo 2 la riaggiunge come `fresh` e, essendo a mano, entra in `K''`. Vale in entrambi i flussi con la stessa funzione. Sul foglio del risultato non compare (era presente prima ed è presente dopo: vedi «Risultato» sotto).

**(d) Cosa legge l'oste**

| Flusso | Lettura | Campo |
|--------|---------|-------|
| Semplice | `character(id) { status { injuries innkeeperInjuries } }` (già aperta all'oste) | `CharacterStatus.innkeeperInjuries` (nuovo) |
| Guidato | la bozza | `MissionFightOutcome.innkeeperInjuriesBefore: [InjuryType!]!` (nuovo, sottoinsieme di `injuriesBefore`), `MissionFightEffects.injuriesRemoved: [InjuryType!]!` e `MissionFightEffects.innkeeperInjuries: [InjuryType!]!` (nuovi; su `simulated` sempre vuoti) |

`MissionFightEffects.innkeeperInjuries` evita che la FE ricalcoli la regola di (a): regola 4, la FE non deduce.

### Multi-scontro: come origine e rimozioni scorrono in fight-state

1. **`effectsRecordOf` / `participantEffectsOf`** (`fight-state.ts:153-195`) e lo schema `MissionFightEffectsRecord` (`mission-draft.model.ts:91-107`) guadagnano `injuriesRemoved` (`@Prop` con default `[]`). La bozza si legge `lean` (`mission-draft.service.ts:238-245`): sulle bozze aperte prima del deploy il campo è `undefined`, quindi `?? []` nel mapper e in `participantEffectsOf`.
2. **Effetto effettivo con origine.** `effectiveEffectsOf` (`draft-invalidation.ts:13-17`) restituisce il record corretto o simulato. Serve una funzione sorella che produce il `ParticipantEffects` effettivo **già marcato** (`injuriesRemoved` dal corretto, `innkeeperInjuries = H` di (a)); la usano `previousEffectsOf` (`draft-invalidation.ts:19-33`) ed `effectiveSequenceOf` (`guided-outcome.ts:37-52`). Così ogni consumatore della sequenza vede la stessa origine.
3. **`afterFight`** (`fight-state.ts:45-87`): `woundsAfter` (`:50-53`) diventa `applyWoundCorrection`; lo stato sovrapposto porta anche `status.innkeeperInjuries`. Da qui `stateBeforeFight` propaga a ogni scontro successivo: una ferita inflitta a mano allo scontro 1 è nell'`injuriesBefore` **e** nell'`innkeeperInjuriesBefore` dello scontro 2, una ferita tolta allo scontro 1 non c'è più allo scontro 2.
4. **`fightStartOf`** (`fight-state.ts:125-142`) e `FightStart` (`:33-39`) guadagnano `innkeeperInjuriesBefore`, salvato in `MissionFightOutcomeRecord` (`mission-draft.model.ts:138-167`) come `injuriesBefore`, quindi fotografato alla simulazione (`mission-simulation.service.ts:64-75`).
5. **Aggregato della missione** (`guided-outcome.ts:75-110`): l'unione di `injuriesAdded` (`:87-91`) è sbagliata appena esistono rimozioni (lo scontro 2 toglie ciò che lo scontro 1 ha aggiunto; lo scontro 1 toglie una ferita di prima e lo scontro 2 la riaggiunge a mano). Va sostituita da una **piega in ordine**: si parte dallo stato reale `(S0, K0)`, si applica `applyWoundCorrection` scontro per scontro fino a `(Sn, Kn)`, e si esprime il netto rispetto allo snapshot: `R = S0 − Sn` più i tipi rimasti la cui origine è cambiata; `A = Sn − (S0 − R)`; `H = A ∩ Kn`. Il netto così costruito, applicato a `(S0, K0)`, ridà esattamente `(Sn, Kn)` — è la proprietà da provare. `guidedBattleOf` (`:143-156`) deve quindi ricevere lo stato del partecipante riletto in sessione (ce l'ha il chiamante: `guided-completion.service.ts:204-238`); `spellsUsedBy` (`:240-252`) usa solo le magie e può restare sull'aggregato senza ferite.
6. **Rivalidazione al completamento** (`guided-completion.service.ts:83-105`): `overrideInputOf` (`guided-outcome.ts:187-206`) deve riportare `injuriesRemoved`, altrimenti il predicato di (b) rifiuta ogni togli-e-riaggiungi; il controllo delle ferite resta sui soli effetti corretti (ruling W5 della Phase 22).
7. **Fusione col simulato** (`guided-outcome.ts:209-224`): `injuriesRemoved: correction.injuriesRemoved ?? []` (il simulato non toglie mai).
8. **Invalidazione a valle** (`mission-draft-save.service.ts:94-104`): `effectsKeyOf` serializza `participantEffectsOf('', record)`; se `injuriesRemoved` non entra nella chiave, una correzione che cambia **solo** le rimozioni è vista come invariata e scartata (`:389`), e gli scontri successivi non vengono azzerati.

### Risultato del partecipante

`planParticipant` oggi scrive `injuriesAdded: fought.added` e `injuriesHealed: cured.healed` (`outcome-plan.ts:632-633`). Con le correzioni:

- `injuriesAdded` = tipi presenti dopo il combattimento e assenti prima (`Sfought − S0`): un togli-e-riaggiungi non compare.
- `injuriesHealed` = ciò che la **cura** ha tolto, mai una ferita dell'oste (D-14).
- **Nuovo `QuestResult.injuriesRemoved: [InjuryType!]!`** (`@Prop` default `[]`) = `S0 − Sfought`: le ferite tolte dall'oste. Metterle in `injuriesHealed` violerebbe la lettera di D-14 quando l'oste toglie una **sua** ferita; non metterle da nessuna parte farebbe sparire una ferita dal Diario senza traccia sul foglio. Additivo; se la FE lo disegni è una domanda di prodotto (Open Question 1).

## Q4 — I background

### Lettura prima della bozza (D-01, D-02)

**Raccomandazione: nessun campo e nessuna query nuovi.** La FE legge `character(id) { infos { name background } status { title } }` per ogni partecipante.

- `CharactersResolver.character` è `@OwnsCharacter` (`src/characters/characters.resolver.ts:42-46`) e la policy esenta l'oste: `identity.role === RoleType.innkeeper && !options.ownerOnly → ResourceAccess.onBehalf` (`src/authz/ownership/character-access.policy.ts:105-106`). Un giocatore che chiede il personaggio di un altro riceve `notOwner` (`:107-108`): la lettura è già «solo admin».
- `infos.background: [String!]!` è già sul filo (`src/models/character/character-infos.model.ts:41-43`, PR #47).
- I partecipanti **senza bozza** sono già noti alla FE dalla coda: `pendingRequests` serve per ogni richiesta `character { id name title }` e `quest { id type }` (`src/quests/pending-requests/pending-requests.builder.ts:96-111`, `:146-160`); il gruppo di una worldMission sono le richieste con la stessa `quest.id`. `missionParticipants` come campo non esiste nel BE: `MissionDraft.participants` nasce solo con la bozza (`mission-draft.service.ts:200-208`), quindi non può servire la D-02.
- La FE usa già questa lettura dentro il flusso (`MissionParticipantsCubit.load` → `InnkeeperRepository.readCharacter`), oggi dopo l'avvio della bozza; va solo anticipata.
- La stessa lettura serve la «storia fin qui» dell'ultima pagina (D-08).

Scartato: `PendingRequestCharacter.background`. La coda intera è riemessa a ogni evento su `pendingRequestsUpdated` (`pending-requests.resolver.ts:32-43`): ogni riemissione porterebbe tutte le storie di tutti i personaggi in coda.

Lavoro BE: un solo caso d'integrazione che **pinna il contratto** («l'oste legge il background del personaggio di un altro, un giocatore no»). Probabile verde al primo colpo: annotarlo nel SUMMARY con il motivo.

### Aggiunte nella bozza (D-05, D-06)

| Pezzo | Dove | Forma raccomandata |
|-------|------|--------------------|
| Passo | `MissionDraftStep` (`guided/mission-draft.model.ts:14-19`) | valore nuovo `stories`, dopo `recap`. La pagina è la penultima azione e la D-05 vuole «uscire e tornare le ritrova»: la ripresa passa dal passo salvato |
| Schema | `MissionDraft` (`mission-draft.model.ts:289-336`) | `@Prop({ type: [MissionBackgroundAdditionRecordSchema], default: [] }) backgroundAdditions`, voce `{ character: ObjectId, text: String }` |
| Filo | `MissionDraftView` (`guided/mission-draft.wire.ts:173-204`) | `backgroundAdditions: [MissionBackgroundAddition!]!`, tipo `{ character: ID!, text: String! }` |
| Mapper | `toMissionDraftWire` (`guided/mission-draft.mapper.ts:140-156`) | `record.backgroundAdditions ?? []` (lettura `lean`, bozze di prima senza il campo) |
| Input | `SaveMissionDraftInput` (`guided/mission-draft.inputs.ts:164-195`) | sezione opzionale `backgroundAdditions: [MissionBackgroundAdditionInput!]`, voce `{ characterId: ID!, text: String! }` |
| Salvataggio | `MissionDraftSaveService.save` (`guided/mission-draft-save.service.ts:264-275`) | ramo nuovo come `prizes` (`:272-273`); tipo `MissionDraftSections` in `mission-draft.service.ts` |

Semantica, ricalcata sui premi (`mergedPrizes`, `mission-draft-save.service.ts:217-228`): sezione assente = invariata; ogni voce **sostituisce** quella del suo personaggio, gli altri restano; testo vuoto dopo `trim` = voce **tolta** (D-06: vuota = nessuna scrittura); personaggio fuori dalla bozza → `OUTCOME_NOT_PARTICIPANT` (`participantIn`, `:206-214`); lo stesso personaggio due volte → `OUTCOME_OVERRIDE_INVALID` (come `:317-318`). La scrittura resta l'unica `drafts.write` (`mission-draft.service.ts:163-180`), last-write-wins, `rev` incrementato: la protezione «bozza scritta dopo la lettura» del completamento vale anche per le aggiunte.

### Validazione a 1000 (D-07)

Regola della creazione, da `src/characters/creation/create-character-input.validator.ts:41-50`:

1. `trim()`;
2. rifiuto se `text.length > MAX × 8` (unità UTF-16: ferma i grappoli di segni combinanti, che contano un grafema qualunque sia la loro lunghezza; `:11-14`);
3. rifiuto se `countGraphemes(text) > MAX`, con `Intl.Segmenter('it', { granularity: 'grapheme' })` (`src/characters/creation/grapheme-count.ts:1-8`): **grafemi**, come il `maxLength` dei `TextField` Flutter, non unità UTF-16.

Per le aggiunte: `BACKGROUND_ADDITION_MAX_GRAPHEMES = 1000`, tetto in unità `8000`. Estrarre il predicato in `grapheme-count.ts` (per esempio `exceedsGraphemeLimit(text, max)`) e usarlo anche nella creazione: una sola regola di conteggio, come chiede la D-07 (Boy Scout, stesso commit di refactor con le spec della creazione verdi).

Due livelli, come la creazione:

- **forma, sul filo:** `@IsString() @MaxLength(8000)` sul campo `text` (precedente: `BACKGROUND_MAX_FORM_LENGTH`, `src/models/request/create-character-request.model.ts:16,50`) e `@ArrayMaxSize` sulla lista → `BAD_USER_INPUT`; l'input nuovo va registrato nel pin `src/validation/input-decorators.spec.ts:17-63`;
- **dominio:** codice proprio nello stile del flusso guidato, cioè `GameRuleException` + `GameRuleErrorCode` (`src/gameRules/game-rule-error-code.enum.ts:30-41`, fabbriche in `game-rule.exception.ts:245-250`): `BACKGROUND_ADDITION_TOO_LONG`, messaggio «L'aggiunta alla storia può contenere al massimo 1000 caratteri», `extensions` = solo `{ code }`. Il codice della creazione è un generico `BAD_USER_INPUT` dentro `CharacterCreationException` (`character-creation.exception.ts:50-55`): non è riusabile come «codice proprio».

Rivalidare al completamento (difesa in profondità, come i premi: `guided-completion.service.ts:220-228`).

### Scrittura nella transazione (D-05, D-08)

Il completamento guidato passa da `GmCompletionService.completeWith` → `commit` (`gm-completion.service.ts:169-266`): una transazione, uno snapshot per posto riletto in sessione (`:187-197`), `planParticipant` + `writer.writeParticipant` per posto (`:211-229`), poi l'aggancio `afterSeats(session)` (`:258`), che il flusso guidato usa già per cancellare la bozza (`guided-completion.service.ts:164`, `:169-182`).

**Raccomandazione:** scrivere le aggiunte dentro `afterSeats`, prima di `deleteReadRevision`, per ogni partecipante seduto con un'aggiunta non vuota:

1. leggere `infos.background` del personaggio **in sessione**;
2. normalizzarlo con una funzione pura `backgroundEntriesOf(raw)`: lista → le sole stringhe; stringa non vuota → `[stringa]`; altro → `[]`;
3. `$set` di `'infos.background'` = voci normalizzate + aggiunta.

Perché non un `$push` secco: fino al 20 novembre 2026 `infos.background` era una **stringa** (`git show f58d3268`: da `@Prop({ type: String })` a `[String]`), il commit non porta migratore, e Mongoose idrata una stringa in lista alla lettura, quindi un personaggio non migrato **si legge bene** e nessuno se ne accorge. Su una stringa, `$push` fallisce con un errore del server e abortisce l'intero completamento (per una worldMission: tutto il gruppo). La lettura in sessione costa una `find` per partecipante con aggiunta e toglie il rischio; se l'orchestratore conferma a DB che non esistono più stringhe (A1), il `$push` dentro l'update del piano resta un'alternativa più corta.

Le voci esistenti non si toccano (D-08): la normalizzazione le riscrive identiche. Un posto il cui personaggio è stato archiviato nel frattempo fa già fallire lo snapshot in sessione (`StaleResolution`), quindi non si arriva mai a scrivere metà gruppo. Un'aggiunta per un personaggio della bozza che non ha più un posto si ignora (stesso filtro di `outcomesOf`, `guided-completion.service.ts:185-202`).

### Risultato (D-09)

Precedente esatto: `spellResearchFailed` (`@Field(() => Boolean) @Prop({ type: Boolean, default: false })`, `quest-result.model.ts:287-289`; opzionale nel draft, `outcome-plan.ts:171`, `:665`; `?? false` in `quest-result.populate.ts:87`).

`QuestResult.backgroundEntryAdded: Boolean!`, default `false` sui risultati esistenti. Il valore è noto dalla bozza prima della scrittura (aggiunta non vuota per quel personaggio): viaggia come campo opzionale di `GmSeatOutcome` (`gm-completion.service.ts:43-48`) → `ParticipantPlanInput` → `result`. Il flusso semplice non lo valorizza (D-10). Nessuna push nuova: `recordParticipant` (`outcome-writer.service.ts:95-119`) resta com'è.

## Q5 — Impatto sullo SDL

Tutto **additivo**. Nessun campo tolto, nessun tipo cambiato, nessuna operazione nuova (quindi nessuna voce nuova in `EXPECTED_INNKEEPER_HANDLERS`, `test/authz/expected-handlers.ts:2`).

| Tipo | Aggiunta | Natura | Chi la seleziona (FE) |
|------|----------|--------|------------------------|
| `type CharacterStatus` | `innkeeperInjuries: [InjuryType!]!` | additivo | Diario del giocatore (D-15); carta e correzioni dell'oste nel flusso semplice; frammento del personaggio di `characterUpdated` |
| `input ParticipantOverrideInput` | `injuriesRemoved: [InjuryType!]` (nullable) | additivo | correzioni di entrambi i flussi |
| `type MissionFightEffects` | `injuriesRemoved: [InjuryType!]!`, `innkeeperInjuries: [InjuryType!]!` | additivo | passo degli scontri e riepilogo |
| `type MissionFightOutcome` | `innkeeperInjuriesBefore: [InjuryType!]!` | additivo | chip delle ferite di prima, col segno |
| `enum MissionDraftStep` | `stories` | additivo **con cautela**: un client vecchio che riceve il valore in `MissionDraft.step` non lo sa leggere; lo salva solo la FE nuova | ripresa del flusso |
| `type MissionDraft` | `backgroundAdditions: [MissionBackgroundAddition!]!` | additivo | ultima pagina |
| `type MissionBackgroundAddition` (nuovo) | `{ character: ID!, text: String! }` | nuovo | ultima pagina |
| `input SaveMissionDraftInput` | `backgroundAdditions: [MissionBackgroundAdditionInput!]` (nullable) | additivo | ultima pagina |
| `input MissionBackgroundAdditionInput` (nuovo) | `{ characterId: ID!, text: String! }` | nuovo | ultima pagina |
| `type QuestResult` | `backgroundEntryAdded: Boolean!`, `injuriesRemoved: [InjuryType!]!` | additivo | foglio del risultato (D-09) |

Codice d'errore nuovo (non è nello SDL, va nel handoff): `BACKGROUND_ADDITION_TOO_LONG`.

Lettura riusata senza modifiche: `character(id) { infos { name background } status { title injuries innkeeperInjuries } }`.

**Pin da aggiornare prima dei decoratori (RED), tutti in `test/app.int-spec.ts`:** `CHARACTER_STATUS_BLOCK` (`:88-89`, usato a `:557` e `:573`), `type MissionDraft` (`:99`), `enum MissionDraftStep` (`:101`), `type MissionFightEffects` (`:107`), `type MissionFightOutcome` (`:111`), `type QuestResult` (`:809`), `input SaveMissionDraftInput` (`:1014`), `input ParticipantOverrideInput` (`:1052`); in più due blocchi nuovi per `MissionBackgroundAddition` e `MissionBackgroundAdditionInput`. L'ordine dei campi è alfabetico (`sortSchema`).

`src/schema.gql` si rigenera con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e si committa nel piano che cambia i decoratori; prova di sola aggiunta: `git diff develop -- src/schema.gql` senza righe tolte.

## Architecture Patterns

### Struttura raccomandata

```
src/quests/outcomes/injuries/
├── cure-injuries.ts            # + terzo parametro: le ferite che nessuna cura tocca
├── heal-no-effect.ts           # HealSubject + innkeeperInjuries
└── innkeeper-injuries.ts       # NUOVO: innkeeperInjuriesOf, applyWoundCorrection, netto di una sequenza
src/quests/guided/
├── background-additions.ts     # NUOVO: normalizzazione, fusione per personaggio, backgroundEntriesOf
├── mission-draft.{model,wire,inputs,mapper}.ts   # campi nuovi
├── fight-state.ts              # afterFight, fightStartOf, predicato delle correzioni
├── guided-outcome.ts           # effetto effettivo marcato, piega al posto dell'unione
├── mission-draft-save.service.ts
└── guided-completion.service.ts
src/characters/creation/grapheme-count.ts   # + predicato condiviso del tetto
```

### Pattern 1: funzioni pure, servizi sottili
Il repo tiene ogni regola in una funzione pura con la sua spec unitaria e lascia ai servizi lettura, transazione e consegna (`cure-injuries.ts`, `woundsAfter`, `validateOverrides`, `draft-invalidation.ts`). Le regole nuove (protezione, correzione, netto della sequenza, conteggio) vanno in funzioni pure; le int-spec provano solo l'incollaggio.

### Pattern 2: campo additivo con default e lettura tollerante
`@Prop({ default: … })` per i documenti idratati, `?? []` / `?? false` per le letture `lean` e per i draft (`spellResearchFailed`, `companionLifeAfter ?? null` in `mission-draft.mapper.ts:56`). Mai una migrazione per un campo che ha un valore neutro.

### Pattern 3: sezione della bozza
Sezione opzionale dell'input → funzione che la valida e la fonde → un solo `drafts.write` (`mission-draft-save.service.ts:264-275`). Le aggiunte seguono i premi.

### Pattern 4: scritture in più nella transazione del completamento
`GmCommitPlan.afterSeats(session)` (`gm-completion.service.ts:61-62`, `:258`): già usato per cancellare la bozza. Le aggiunte ai background entrano lì.

### Anti-pattern da evitare
- **Proteggere le cure nei chiamanti** invece che in `cureInjuries`: tre chiamanti oggi, il quarto dimenticherà.
- **Salvare l'origine nella bozza**: si deriva da `simulated` e `corrected`; un campo salvato può divergere dopo un rilancio.
- **Unire le ferite fra scontri** quando esistono rimozioni: l'ordine conta.
- **Scrivere `'status.innkeeperInjuries'` in ogni esito**: rompe le spec che pinnano l'update intero e scrive `[]` su ogni personaggio.
- **`$push` su `infos.background`** senza sapere che è una lista a DB.
- **Un `@ResolveField` per `innkeeperInjuries`**: non serve (documenti idratati) e aggiunge una seconda fonte del campo.

## Don't Hand-Roll

| Problema | Non costruire | Usare | Perché |
|---------|-------------|-------------|-----|
| Conteggio dei caratteri | un contatore proprio, `text.length` | `countGraphemes` (`grapheme-count.ts`) + tetto in unità UTF-16 | emoji ZWJ e segni combinanti; deve coincidere col `maxLength` di Flutter |
| Togliere una ferita curata | un filtro locale | `cureInjuries` col parametro nuovo | doppioni, stringhe legacy, ordine e `healed` già provati |
| Aggiungere una ferita | `push` su `status.injuries` | `woundsAfter` / `applyWoundCorrection` | scarto dei doppioni e dei tipi sconosciuti |
| Limiti e forma delle correzioni | controlli nel servizio | `validateOverrides` (`gm-overrides.ts:203-228`) | stesso codice per il flusso semplice, il salvataggio e la rivalidazione |
| Partecipante della bozza | ricerca a mano | `participantIn` (`mission-draft-save.service.ts:206-214`) | `OUTCOME_NOT_PARTICIPANT` coerente |
| Errori tipizzati | `BadRequestException` nudo | `GameRuleException` + `GameRuleErrorCode` | `extensions.code` che la FE legge |
| Transazione del completamento | una transazione nuova | `afterSeats` di `completeWith` | D-05: stessa transazione |

**Key insight:** la fase non introduce meccanismi: allarga quattro funzioni pure esistenti e ne aggiunge una. Ogni scorciatoia locale duplica una regola che ha già casi limite provati.

## Runtime State Inventory

Non è una fase di rename; due stati a runtime contano comunque.

| Categoria | Trovato | Azione |
|----------|-------------|------------------|
| Dati salvati | Personaggi senza `status.innkeeperInjuries`: tutti. Valore neutro = nessuna ferita dell'oste (D-16) | nessuna migrazione; letture tolleranti |
| Dati salvati | Possibili `infos.background` ancora **stringa** (campo cambiato il 2026-11-20 senza migratore nel repo) | scrittura tollerante (§Q4); controllo a DB dell'orchestratore prima del boot (A1) |
| Dati salvati | `QuestResult` esistenti senza `backgroundEntryAdded` / `injuriesRemoved` | default dello schema; nessuna migrazione |
| Dati salvati | Bozze `missiondrafts` aperte al momento del deploy: senza `backgroundAdditions`, `injuriesRemoved`, `innkeeperInjuriesBefore` | letture `?? []`; un `innkeeperInjuriesBefore` vuoto su uno scontro simulato prima del deploy si corregge rilanciando lo scontro; il completamento ricalcola dallo stato reale |
| Config di servizi live | nessuna (nessun topic, nessuna push nuova) — verificato: D-09 «nessuna push dedicata» | nessuna |
| Stato registrato nel SO | nessuno | nessuna |
| Segreti / variabili d'ambiente | nessuna nuova (regola del repo) | nessuna |
| Artefatti di build | `src/schema.gql` rigenerato dal boot di test; `dist/` lo ricostruisce l'orchestratore | commit dello schema nel piano dei decoratori |

## Common Pitfalls

### Pitfall 1: il premio dello stesso completamento cura la ferita appena inflitta
**Cosa va storto:** l'oste aggiunge a mano `brokenLeftArm` e il blocco del titolo ha una cura che la comprende: la ferita nasce e muore nello stesso piano, `injuriesAdded` e `injuriesHealed` la elencano entrambe.
**Perché:** in `planParticipant` la cura gira sulle ferite **dopo** il combattimento (`outcome-plan.ts:465-470`).
**Come evitarlo:** la cura riceve le ferite dell'oste calcolate dopo la correzione, non quelle lette dallo snapshot.
**Segnale:** un test con override + cura nello stesso completamento, in entrambi i flussi.

### Pitfall 2: l'unione delle ferite fra scontri
**Cosa va storto:** scontro 1 simulato aggiunge X, scontro 2 corretto la toglie: l'unione di `guided-outcome.ts:87-91` la riporta e il personaggio la riceve.
**Come evitarlo:** piega in ordine (§Q3, punto 5).
**Segnale:** test a due scontri con una rimozione nel secondo.

### Pitfall 3: correzione di sole rimozioni scartata come «invariata»
**Cosa va storto:** `sameCorrections` (`mission-draft-save.service.ts:97-104`) confronta la serializzazione di `participantEffectsOf`; senza `injuriesRemoved` nella chiave il salvataggio non scrive nulla e non azzera gli scontri successivi.
**Come evitarlo:** `injuriesRemoved` in `effectsRecordOf`, `participantEffectsOf` e quindi nella chiave.

### Pitfall 4: letture `lean` senza default
**Cosa va storto:** `status.innkeeperInjuries`, `backgroundAdditions`, `injuriesRemoved` sono `undefined` su ogni documento di oggi letto `lean` (snapshot degli esiti, pozione, accettazione, bozza): `.includes` su `undefined` lancia.
**Come evitarlo:** una sola funzione di lettura normalizzata; mai accedere al campo grezzo.

### Pitfall 5: la rivalidazione al completamento perde le rimozioni
**Cosa va storto:** `overrideInputOf` (`guided-outcome.ts:187-206`) ricostruisce l'input dagli effetti senza `injuriesRemoved`: un togli-e-riaggiungi salvato bene viene rifiutato al completamento («aggiunge una ferita già posseduta»).
**Come evitarlo:** riportare `injuriesRemoved`; un caso d'integrazione che completa una bozza con togli-e-riaggiungi.

### Pitfall 6: spec che pinnano l'update intero
**Cosa va storto:** `outcome-plan.spec.ts`, `unrewarded-plan.spec.ts`, `item-use.plan.spec.ts` e varie int-spec confrontano `$set` o il filtro con `toEqual`; una chiave nuova sempre presente le rompe tutte.
**Come evitarlo:** chiave nel `$set` solo se la lista cambia. La guardia nuova della pozione (`'status.innkeeperInjuries'`) invece **cambia** il filtro atteso in `item-use.plan.spec.ts`: aggiornarlo nel RED di quel piano.

### Pitfall 7: `infos.background` stringa
Vedi §Q4 «Scrittura» e A1.

### Pitfall 8: tetti doppi dell'input
**Cosa va storto:** `@MaxLength` sul filo più basso del tetto di dominio → l'utente riceve `BAD_USER_INPUT` invece del codice proprio per un testo fra 1001 e 8000 unità.
**Come evitarlo:** il tetto di forma è **sopra** quello di dominio (`MAX × 8`), come `BACKGROUND_MAX_FORM_LENGTH` rispetto a `BACKGROUND_MAX_GRAPHEMES`.

### Pitfall 9: il log di audit cresce coi testi
`saveMissionDraft` è auditata con gli argomenti completi (nota UF-22-01 in `22-…/BACKEND-NOTES.md`): ogni salvataggio dell'ultima pagina copia nel log fino a 1000 caratteri per partecipante. Nessun segreto; dichiararlo nel handoff e nel registro di sicurezza.

### Pitfall 10: trappole operative del repo
`npm run lint` riscrive il repo; i percorsi di jest vanno **prima** di `--selectProjects`; una int-spec appesa dopo l'apertura di Mongoose non termina (kill e `--detectOpenHandles --forceExit` solo per leggere l'esito); in zsh `echo ===` e le glob non quotate (`--include=*.ts`) falliscono: quotare sempre.

## Code Examples

### Cura che non tocca le ferite dell'oste

```typescript
// src/quests/outcomes/injuries/cure-injuries.ts — estensione della funzione esistente (:5-16)
export function cureInjuries(
    injuries: readonly InjuryType[],
    canHeal: readonly unknown[],
    untouchable: readonly InjuryType[] = [],
): { injuries: InjuryType[]; healed: InjuryType[] } {
    const protectedTypes: ReadonlySet<InjuryType> = new Set(untouchable);
    const curable: ReadonlySet<InjuryType> = new Set(
        canHeal
            .filter(isInjuryType)
            .filter((injury) => !protectedTypes.has(injury)),
    );
    return {
        injuries: injuries.filter((injury) => !curable.has(injury)),
        healed: [...new Set(injuries.filter((injury) => curable.has(injury)))],
    };
}
```

### Lettura normalizzata dell'origine

```typescript
// src/quests/outcomes/injuries/innkeeper-injuries.ts
export function innkeeperInjuriesOf(status: {
    injuries?: readonly unknown[] | null;
    innkeeperInjuries?: readonly unknown[] | null;
}): InjuryType[] {
    const carried = new Set(status.injuries ?? []);
    return [...new Set(status.innkeeperInjuries ?? [])]
        .filter(isInjuryType)
        .filter((injury) => carried.has(injury));
}
```

### Origine di una ferita in uno scontro corretto (D-12, D-16)

```typescript
// a mano = aggiunta dal corretto e non dal simulato, oppure tolta e riaggiunta
const handInflicted = (
    corrected: { injuriesAdded: InjuryType[]; injuriesRemoved?: InjuryType[] | null },
    simulatedAdded: readonly InjuryType[],
): InjuryType[] => {
    const removed = new Set(corrected.injuriesRemoved ?? []);
    return corrected.injuriesAdded.filter(
        (injury) => !simulatedAdded.includes(injury) || removed.has(injury),
    );
};
```

### Regola di conteggio condivisa

```typescript
// src/characters/creation/grapheme-count.ts — accanto a countGraphemes
const CODE_UNITS_PER_GRAPHEME = 8;

export const exceedsGraphemeLimit = (text: string, max: number): boolean =>
    text.length > max * CODE_UNITS_PER_GRAPHEME || countGraphemes(text) > max;
```

Fonte di tutti gli esempi: forme derivate dal codice del repo citato accanto; sono schemi per il planner, non codice esistente.

## State of the Art

| Prima | Ora (questa fase) | Da quando | Impatto |
|--------------|------------------|--------------|--------|
| Phase 22 D-14: «una correzione non può togliere una ferita di prima; guarirla è il premio cure» | D-13 emendata: le correzioni tolgono qualunque ferita | 2026-11-21 | `assertAddsOnlyNewInjuries` diventa un predicato a due liste; il passo 5 della UAT della Phase 22 («tentativo di togliere una ferita di prima → rifiutato») non vale più |
| `infos.background` stringa | lista di voci | PR #47, 2026-11-20 | la fase aggiunge in coda |
| `completePendingRequest` «da rimuovere dopo la merge della FE Phase 21» (`22-…/BACKEND-NOTES.md` §0.6) | D-12/D-13 lo estendono: resta il completamento delle richieste semplici | 2026-11-21 | la rimozione annunciata non è più in programma per i tipi non guidati |

## Assumptions Log

| # | Affermazione | Sezione | Rischio se falsa |
|---|-------|---------|---------------|
| A1 | Nel database reale possono esistere personaggi con `infos.background` ancora stringa (il repo non contiene un migratore per la PR #47; il database non è stato interrogato) | §Q4 «Scrittura», Pitfall 7 | se invece sono tutti migrati, la lettura in sessione è una cautela superflua (un `$push` basterebbe); se esistono e si usasse `$push`, il completamento di una missione abortirebbe |
| A2 | Tutti i percorsi che servono un `Character` sul filo usano documenti idratati, quindi il default `[]` di `innkeeperInjuries` vale senza `@ResolveField` (letti `findAll`, `findOne`, il publisher; non ogni resolver che popola un personaggio) | §Q2 | un percorso `lean` risponderebbe `null` su un campo non nullo: errore GraphQL. Coperto da un caso al boot reale |
| A3 | Il motore vero di combattimento, quando arriverà, non valorizzerà `injuriesRemoved` né `innkeeperInjuries` | §Q3 | nessuno oggi: i campi sono opzionali e il segnaposto non li conosce |
| A4 | Il passo nuovo si chiama `stories` e i campi `backgroundAdditions`, `backgroundEntryAdded`, `injuriesRemoved`, `innkeeperInjuries`, `innkeeperInjuriesBefore`: nomi proposti (discrezione di Claude nel CONTEXT) | §Q5 | solo di coordinamento con la FE Phase 24: fissarli nel REPO-RULES prima dei piani |
| A5 | Gli ID di requisito `BE-WOUND-*` / `BE-STORY-*` sono una proposta | Phase Requirements | nessuno: «TBD (nel plan)» |

## Open Questions (RESOLVED)

1. **Le ferite tolte dall'oste compaiono sul foglio del risultato del giocatore?** *(domanda di prodotto, l'unica)*
   - Sappiamo: D-14 vieta che `injuriesHealed` elenchi una ferita dell'oste; le correzioni ora tolgono ogni ferita.
   - RISOLTA lato BE: campo additivo `QuestResult.injuriesRemoved`, sempre valorizzato; `injuriesHealed` resta delle sole cure. Se e come la FE lo disegni lo decide l'utente nella FE Phase 24: il BE non vincola.

2. **Serve una query nuova per i background?** RISOLTA: no. `character(id)` è già aperta all'oste e serve `infos.background`; i partecipanti senza bozza vengono da `pendingRequests`. Un solo test che pinna il contratto.

3. **Passo nuovo o campo salvato col riepilogo?** RISOLTA: passo nuovo `stories` dopo `recap` **e** sezione propria `backgroundAdditions`. Il passo serve la ripresa (D-05), la sezione tiene i testi fuori dai premi.

4. **Nel flusso semplice esiste una base simulata?** RISOLTA: no (`gm-completion.service.ts:104-133`): ogni ferita dell'override è a mano, quindi dell'oste.

5. **Togliere una ferita che il personaggio non ha: ignorare o rifiutare?** RISOLTA: rifiutare con `OUTCOME_OVERRIDE_INVALID` in entrambi i flussi (l'oste ha agito su una vista vecchia; nessun codice nuovo). Riaggiungere una ferita posseduta **senza** toglierla: rifiuto nel guidato (com'è oggi), ignorata nel semplice (com'è oggi, compatibile con la FE pre-merge).

6. **`@ResolveField` o campo semplice per `innkeeperInjuries`?** RISOLTA: campo semplice; l'invariante è custodita alla scrittura e la lettura di dominio è normalizzata.

7. **Dove si scrive l'aggiunta: nell'update del piano o in `afterSeats`?** RISOLTA: `afterSeats`, con lettura in sessione e `$set` della lista normalizzata (A1). Il flag del risultato passa invece dal piano.

8. **Il CONTEXT dice che il background della creazione «resta a 400»; il codice dice 500.** `BACKGROUND_MAX_GRAPHEMES = 500` (`create-character-input.validator.ts:11`), messaggio «al massimo 500 caratteri» (`character-creation.exception.ts:53`), e la FE usa 500 (`lib/screens/characterCreation/cubit/character_draft.dart:29`). RISOLTA per questa fase: nessun impatto, la creazione non si tocca e l'aggiunta vale 1000 comunque. Da segnalare all'utente come refuso del CONTEXT (o come intenzione di abbassare la creazione a 400, che sarebbe un lavoro a parte sui due repo).

9. **Il foglio deve dire quali ferite aggiunte sono dell'oste?** RISOLTA: no. D-15 mette il riconoscimento nel Diario (personaggio), e il personaggio lo serve. Aggiungibile dopo senza rompere nulla.

## Environment Availability

| Dipendenza | Serve a | Disponibile | Versione | Ripiego |
|------------|------------|-----------|---------|----------|
| Node.js | runtime, `Intl.Segmenter` | ✓ | v22.12.0 | — |
| jest | test | ✓ | 30.1.3 (`node_modules`) | — |
| mongoose / `MongoMemoryReplSet` | int-spec con transazioni | ✓ | 8.18.1 / mongodb-memory-server 11.x | — |
| redis-memory-server | boot reale di test | ✓ (devDependency) | 0.17.x | — |
| Rete | — | non richiesta | — | nessuna installazione prevista |

Nessuna dipendenza mancante. [VERIFIED: `node --version`, `node_modules/*/package.json`; i server in memoria non sono stati avviati in questa sessione]

## Validation Architecture

### Test Framework

| Proprietà | Valore |
|----------|-------|
| Framework | Jest 30.1.3 + ts-jest, due progetti in `package.json` (`jest.projects`) |
| Progetto `unit` | `src/**/*.spec.ts`, `test/**/*.spec.ts`; funzioni pure, nessun `AppModule` (in CI non c'è `.env`) |
| Progetto `integration` | `src/**/*.int-spec.ts`, `test/**/*.int-spec.ts`; `globalSetup` `test/setup/global-setup.ts` (replica set in memoria), `setupFilesAfterEnv` `test/setup/after-env.ts` |
| Harness | `test/authz/characters-test-app.ts`, `test/harness/real-app-boot.ts`, `test/auth/test-tokens.ts`, `test/auth/fixed-clock.ts`, `test/harness/prime-change-stream.ts`, fixture in `test/fixtures/` (`character.fixture.ts`, `quest.fixture.ts`, …) |
| Comando rapido | `npx jest <percorso della spec> --selectProjects unit` |
| Integrazione mirata | `npx jest <percorso> --selectProjects integration --runInBand` |
| Suite completa | per blocchi `--runInBand` nel piano di gate; `npm run test:cov` (≈ 630 s) lo lancia l'orchestratore in background |
| Type check | `npx tsc --noEmit -p tsconfig.json` a fine di ogni task di codice |
| Regole | nessun `jest.mock(` di moduli (override di provider); prove di assenza con `toEqual` sull'intero output; titoli coi numeri di decisione |

### Phase Requirements → Test Map

| Req | Comportamento | Tipo | Comando | File |
|--------|----------|-----------|-------------------|-------------|
| BE-WOUND-02 | `cureInjuries` lascia una ferita protetta in `injuries` e fuori da `healed`; doppioni e legacy invariati (D-14) | unit | `npx jest src/quests/outcomes/injuries/cure-injuries.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-01 | `innkeeperInjuriesOf`: assente, `null`, sconosciute, doppioni, fuori da `injuries` (D-16) | unit | `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-WOUND-04/05 | `applyWoundCorrection`: equivalenza con `woundsAfter` senza rimozioni; togli; togli-e-riaggiungi cambia origine; riaggiunta senza togliere non cambia origine (D-12, D-13, D-16) | unit | stesso file | ❌ Wave 0 |
| BE-WOUND-06 | netto di una sequenza: applicato allo stato iniziale ridà lo stato finale (proprietà, più i casi a due scontri) | unit | `npx jest src/quests/guided/guided-outcome.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-02 | `planParticipant`: cura del premio non tocca la ferita di prima né quella inflitta nello stesso esito; `injuriesHealed` senza ferite dell'oste; chiave `status.innkeeperInjuries` solo se cambia (D-14) | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-02/03 | pozione: non cura la ferita dell'oste; solo ferite dell'oste + vita piena → `ITEM_NO_EFFECT`; guardia di scrittura sull'origine (D-14) | unit | `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-03 | `healHasNoEffect` ignora le ferite dell'oste (D-14) | unit | `npx jest src/quests/outcomes/injuries/heal-no-effect.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-03 | soggetto del viewer porta l'origine | unit | `npx jest src/quests/no-effect/viewer-vitals.service.spec.ts --selectProjects unit` | ✅ esiste |
| BE-WOUND-03 | `acceptQuest` di una heal che curerebbe solo ferite dell'oste → `QUEST_NO_EFFECT`; `Quest.noEffect` vero (D-14) | integration | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-WOUND-02 | `useItem` sul filo: `injuriesHealed` senza la ferita dell'oste, che resta a DB (D-14) | integration | `npx jest src/characters/items/use-item.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-WOUND-04/05 | `validateOverrides`: `injuriesRemoved` nei limiti, non posseduta → `OUTCOME_OVERRIDE_INVALID`, tetto (D-13) | unit | `npx jest src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-04/05 | `completePendingRequest`: ferita dell'override scritta come dell'oste; rimozione di una normale e di una dell'oste; togli-e-riaggiungi; cura del blocco nello stesso esito (D-12, D-13, D-14, D-16) | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-WOUND-06 | stato a inizio scontro: `innkeeperInjuriesBefore`, propagazione di rimozioni e origine; predicato delle correzioni (D-13) | unit | `npx jest src/quests/guided/fight-state.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-06 | salvataggio: correzione di sole rimozioni scritta e scontri successivi azzerati; rimozione di una ferita di prima accettata; riaggiunta senza togliere rifiutata (D-13, D-16) | integration | `npx jest src/quests/guided/mission-draft-save.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-WOUND-06 | mapper: campi nuovi serviti, `[]` sulle bozze di prima | unit | `npx jest src/quests/guided/mission-draft.mapper.spec.ts --selectProjects unit` | ✅ esiste, casi nuovi |
| BE-WOUND-05/06 | `completeGuidedMission`: a due scontri, ferita a mano → dell'oste a DB, simulata lasciata → normale, togli-e-riaggiungi, premio `cure` che non la tocca (D-12, D-14, D-16) | integration | `npx jest src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-WOUND-01 | `character(id)` serve `innkeeperInjuries`; `[]` su un personaggio legacy senza il campo (D-15) | integration | `npx jest src/characters/characters-ownership.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-STORY-01 | l'oste legge `infos.background` del personaggio di un altro; un giocatore riceve il rifiuto (D-02) | integration | stesso file | ✅ esiste, caso nuovo (probabile verde al primo colpo) |
| BE-STORY-03 | predicato condiviso del tetto: 1000 grafemi, emoji ZWJ, grappolo di combinanti, creazione invariata (D-07) | unit | `npx jest src/characters/creation/grapheme-count.spec.ts src/characters/creation/create-character-input.validator.spec.ts --selectProjects unit` | ✅ esistono, casi nuovi |
| BE-STORY-02/03 | funzioni pure delle aggiunte: `trim`, vuota = tolta, fusione per personaggio, doppio personaggio, `backgroundEntriesOf` su lista / stringa / altro | unit | `npx jest src/quests/guided/background-additions.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-STORY-02/03 | forma dell'input nuovo e pin dei decoratori | unit | `npx jest src/quests/guided/mission-draft.inputs.spec.ts src/validation/input-decorators.spec.ts --selectProjects unit` | ✅ esistono |
| BE-STORY-02/03 | salvataggio: sezione salvata e riservita, sostituzione del solo personaggio elencato, 1001 → `BACKGROUND_ADDITION_TOO_LONG`, fuori bozza → `OUTCOME_NOT_PARTICIPANT`, passo `stories` (D-05, D-06, D-07) | integration | `npx jest src/quests/guided/mission-draft-save.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-STORY-04/05 | completamento: voce in coda, voci di prima intatte, nessuna scrittura senza aggiunta, `backgroundEntryAdded` per posto, nulla scritto se il completamento è rifiutato, `infos.background` stringa a DB tollerata (D-05, D-08, D-09) | integration | `npx jest src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, casi nuovi |
| BE-STORY-05 | `completePendingRequest` non valorizza il flag (D-10) | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste |
| BE-STORY-06 | SDL: blocchi pinnati aggiornati, sola aggiunta | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, pin da aggiornare |
| BE-STORY-06 | flusso completo sul filo con rimozione, ferita a mano e aggiunta alla storia | integration | `npx jest src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ esiste, caso nuovo |
| tutti | codice d'errore nuovo: messaggio e `extensions` | unit | `npx jest src/gameRules/game-rule.exception.spec.ts --selectProjects unit` | ✅ esiste |

### Sampling Rate
- **Per commit di task:** la spec mirata del task + `npx tsc --noEmit -p tsconfig.json`.
- **Per piano:** le spec della cartella toccata (`src/quests/outcomes/injuries`, `src/quests/guided`, `src/characters/items`).
- **Gate di fase:** unit completa; integrazione per blocchi `--runInBand` (`src/quests/outcomes`, resto di `src/quests`, `src/characters`, `src/travel`, resto); `test/app.int-spec.ts`; `git diff develop -- src/schema.gql` senza righe tolte; coverage per cartella sopra le soglie di `package.json` (`./src/quests/acceptance/` e le altre già fissate).
- **Regressioni da tenere d'occhio:** `outcome-plan.spec.ts`, `unrewarded-plan.spec.ts`, `src/travel/ambush/*`, `quest-combat.int-spec.ts`, `crime-guard-conclusion.int-spec.ts` — le vie automatiche non devono cambiare di una virgola (nessuna chiave nuova nei loro update).

### Wave 0 Gaps
- [ ] `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts` — BE-WOUND-01, -04, -05, -06 (funzioni pure nuove)
- [ ] `src/quests/guided/background-additions.spec.ts` — BE-STORY-02, -03, -04
- [ ] Pin SDL di `test/app.int-spec.ts` aggiornati **prima** dei decoratori (RED)
- [ ] Fixture: un aiuto per scrivere un personaggio con `innkeeperInjuries` e uno legacy senza il campo / con `infos.background` stringa (col driver nativo, come gli altri casi legacy)
- Framework e harness: nessuna installazione, tutto presente.

## Security Domain

`security_enforcement` non è disattivato in `.planning/config.json`: sezione dovuta.

### Categorie ASVS applicabili

| Categoria | Vale | Controllo |
|---------------|---------|-----------------|
| V2 Authentication | no (invariata) | JWT di sessione esistente |
| V3 Session Management | no (invariata) | — |
| V4 Access Control | **sì** | correzioni e bozza solo `@Roles(innkeeper)` (invariato: nessun handler nuovo); lettura dei background con `@OwnsCharacter` + esenzione dell'oste; l'origine delle ferite non è scrivibile da nessun input di giocatore |
| V5 Input Validation | **sì** | class-validator sulla forma (`IsEnum`, `ArrayMaxSize`, `MaxLength`), dominio su grafemi e unità UTF-16, `validateOverrides` |
| V6 Cryptography | no | — |

### Minacce note

| Schema | STRIDE | Mitigazione |
|---------|--------|---------------------|
| Un giocatore cura una ferita dell'oste per una via dimenticata | Tampering / Elevation | protezione dentro `cureInjuries`, non nei chiamanti; inventario §Q1; test per ogni via |
| Un giocatore scrive o cancella l'origine | Tampering | nessun input di giocatore porta `innkeeperInjuries`; `CharacterStatusInput` non è usato da alcuna mutation |
| Testo enorme o grappoli di combinanti nell'aggiunta | Denial of Service | tetto di forma sul filo + tetto in unità UTF-16 + grafemi; tetto di lista |
| Testo dell'oste mostrato ai giocatori | Tampering (contenuto) | testo semplice, nessuna interpretazione lato BE; la FE lo disegna come testo (già così per il background) |
| Un giocatore legge la storia di un altro | Information Disclosure | `character(id)` rifiuta chi non è proprietario; la bozza non è mai servita a un giocatore (D-10 della Phase 22) — `backgroundAdditions` vive solo nella bozza fino al completamento |
| Pozione bevuta in corsa con un togli-e-riaggiungi | Tampering (corsa) | guardia di scrittura allargata all'origine (§Q1) |
| Completamento parziale (ferite scritte, storia no) | Tampering (integrità) | tutto nella transazione di `completeWith`; revisione della bozza |
| Crescita del log di audit coi testi | Repudiation / operativo | dichiarato (Pitfall 9); nessun segreto nei testi |

## Sources

### Primarie (HIGH) — codice del repo BE, letto il 2026-11-21 sul ramo `feat/25-storie-dei-partecipanti-e-ferite-dell-oste`
- `src/quests/outcomes/`: `outcome-plan.ts`, `unrewarded-plan.ts`, `gm-overrides.ts`, `gm-completion.service.ts`, `gm-request.reader.ts`, `outcome-writer.service.ts`, `rescue-plan.ts`, `guard/guard-outcome.ts`, `injuries/{cure-injuries,heal-no-effect,quest-cure,injury-rules}.ts`, `combat/{combat-resolver,combat-context,placeholder-combat-resolver}.ts`, `dungeon/placeholder-dungeon-resolver.ts`
- `src/quests/guided/`: `guided-outcome.ts`, `fight-state.ts`, `draft-invalidation.ts`, `guided-completion.service.ts`, `mission-draft-save.service.ts`, `mission-draft.{model,wire,mapper,inputs,service}.ts`, `mission-simulation.service.ts`, `chosen-rewards.ts`, `guided-mission.resolver.ts`
- `src/characters/`: `items/item-use.plan.ts`, `characters.resolver.ts`, `characters.service.ts`, `character-status.resolver.ts`, `character-updates.publisher.ts`, `creation/{create-character-input.validator,grapheme-count,character-creation.exception}.ts`
- `src/quests/acceptance/quest-acceptance.service.ts`, `src/quests/no-effect/*`, `src/quests/pending-requests/*`, `src/travel/ambush/ambush-plan.ts`, `src/travel/travel-planner.service.ts`
- `src/models/`: `character/character-status.model.ts`, `character/character-infos.model.ts`, `request/complete-pending-request.model.ts`, `quest-result/quest-result.model.ts`, `pending-request.model.ts`
- `src/authz/ownership/character-access.policy.ts`, `src/gameRules/*`
- `test/app.int-spec.ts`, `test/authz/expected-handlers.ts`, `package.json` (progetti jest)
- `git show f58d3268` (background come lista), `git log`
- `.planning/phases/22-completamento-guidato-missioni/{BACKEND-NOTES.md,22-REPO-RULES.md}`, `.planning/ROADMAP.md`, `.planning/config.json`

### Secondarie (MEDIUM) — repo FE, sola lettura
- `lib/screens/innkeeper/missionCompletion/missionParticipantsCubit/mission_participants_cubit.dart`, `lib/screens/innkeeper/components/injury_chips.dart`, `lib/screens/characterCreation/cubit/character_draft.dart:29`

### Non consultate
- Context7 e web: la fase non introduce librerie né API esterne; ogni domanda aveva risposta nel codice.
- Database reale e `.env`: vietati (da qui l'assunzione A1).

## Metadata

**Confidenza per area:**
- Inventario delle vie delle ferite: HIGH — grep esaustivo più lettura di ogni file.
- Significato attuale delle correzioni: HIGH — codice e note della Phase 22 concordano.
- Forme raccomandate (lista, input, bozza, risultato): MEDIUM — scelte motivate, non uniche; i nomi sono da fissare con la FE.
- Scrittura del background: MEDIUM — dipende da A1.
- Architettura di validazione: HIGH — file e comandi esistenti verificati; i test non sono stati eseguiti in questa sessione.

**Data della ricerca:** 2026-11-21
**Valida fino a:** 2026-12-21 (codice interno stabile; da rifare se `guided/` o `outcome-plan.ts` cambiano prima del plan)
