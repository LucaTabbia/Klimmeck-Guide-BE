---
quick: 261113-aql
reviewed: 2026-11-13
depth: deep
status: issues_found
findings:
  critical: 0
  warning: 2
  info: 8
  total: 10
---

---
phase: quick-261113-aql
reviewed: 2026-11-13
depth: deep
repo: /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE
branch: feat/quick-aid-locks-source-quest
diff: develop..HEAD (14 commit, 32 file sotto src/ e test/)
files_reviewed: 32
findings:
  critical: 0
  warning: 2
  info: 8
  total: 10
status: issues_found
---

# Quick 261113-aql (BE): revisione del codice

**Metodo:** sola lettura (`git diff develop..HEAD -- src test`, lettura dei file e dei loro chiamanti). Nessun jest/tsc/build/lint lanciato, nessun file del repo toccato, `.env` mai letto. L'unica esecuzione è stata un one-liner `node -e` di pura aritmetica (fuori dal repo) per IN-04.

**Esito in breve:** nessun difetto critico. Le quattro regole sono implementate come dichiarato e le ho ritrovate nel codice riga per riga. Restano due warning (un caso di bordo del publisher che colpisce le modifiche a mano del DB, tipiche della UAT; un contratto dichiarato nel handoff ma non provato da alcuna spec) e otto note.

Legenda: **VERIFICATO** = letto nel codice (o calcolato); **IPOTETICO** = scenario plausibile non raggiungibile dai percorsi di codice di oggi.

---

## Warning

### WR-01: il publisher ripubblica la quest d'origine solo quando `concludedAt` diventa una data, non quando torna nullo o viene rimosso

**File:** `src/quests/quests.publisher.ts:47-49` (`concludes`), usato a `:79`
**Stato:** VERIFICATO il comportamento; lo scenario passa solo da scritture a mano (nessun percorso del codice riapre un'aid: i soli writer di `concludedAt` sono `quest-outcome-plan.ts:39`, `rescue-resolution.service.ts:315`, `character-archiver.ts:264`, tutti `$set` di una data).

```ts
function concludes(change: ChangeStreamEvent): boolean {
    return change.updateDescription?.updatedFields?.concludedAt != null;
}
```

**Scenario di guasto:** durante la UAT l'orchestratore riapre un'aid a DB (`$set: { concludedAt: null }`, oppure `$unset`, che finisce in `removedFields`) per riprovare il blocco. Il blocco torna subito vero per `acceptQuest` e per `Quest.awaitingRescue`, ma nessun `questUpdated` raggiunge la quest d'origine: la FE resta col foglio integro finché non rilegge. Il SUMMARY e il handoff dichiarano il solo caso «aid cancellata a mano»; questo è il suo gemello, non dichiarato, ed è il più probabile in una UAT guidata da script DB. Vale anche per un `replace` dell'aid (nessun `updateDescription`).

**Fix proposto:** ripubblicare a ogni cambio del campo, qualunque sia il valore (costa la stessa lettura proiettata):

```ts
function touchesConclusion(change: ChangeStreamEvent): boolean {
    const { updatedFields, removedFields } = change.updateDescription ?? {};
    return (
        (updatedFields != null && 'concludedAt' in updatedFields) ||
        (removedFields ?? []).includes('concludedAt')
    );
}
```

(con `removedFields?: string[]` aggiunto a `ChangeStreamEvent`), più un caso in `quests.publisher.spec.ts` «republishes the source quest when its aid is reopened». In alternativa minima: aggiungere il caso ai «Limiti noti» di `BACKEND-NOTES.md` accanto alla cancellazione a mano.

### WR-02: il contratto «soccorso perso → l'ultimo evento porta `awaitingRescue: true`» non è provato da nessuna spec

**File:** `src/quests/quests.publisher.spec.ts:227` e `src/quests/quest-updated.subscription.int-spec.ts:785`
**Stato:** VERIFICATO (letti tutti i casi nuovi delle due spec).

Il handoff promette alla FE (`BACKEND-NOTES.md`, «Quando arriva `questUpdated`», punto 2): chiusura per soccorso perso = chiusura della vecchia aid + nascita della nuova nella stessa transazione, e «l'ultimo evento porta allora `awaitingRescue: true`». Le spec provano i due eventi solo separati: nascita → `true`, chiusura → `false`. La raffica (update che conclude A + insert di B con lo stesso `rescue.failedQuest`) non compare né nella unit del publisher né sul filo; `dungeon-aid.int-spec.ts` «keeps the dungeon locked on the next aid of a lost rescue» prova lo stato derivato a DB, non l'evento.

Leggendo il codice il comportamento è corretto (i due eventi arrivano dopo il commit, `republishSourceOf` e l'insert passano dallo stesso `KeyedSingleFlight`, e `awaitingRescue` è risolto alla consegna, quindi su uno stato già committato). Ma è proprio il caso in cui una regressione darebbe alla FE un foglio integro su una quest bloccata, e oggi resterebbe verde: ad esempio se un domani il valore venisse calcolato nel publisher prima della `findOne`, o se l'insert smettesse di passare dal single-flight.

**Fix proposto:** un caso in `quest-updated.subscription.int-spec.ts`: hunt con aid A aperta, subscriber sullo snapshot (`true`), poi in una `connection.transaction` `$set concludedAt` su A e `insertOne` di B dalla stessa quest; attendere gli eventi fino al silenzio e pretendere che l'ultimo sia `{ id, awaitingRescue: true }` (uno o due eventi, come dichiara il handoff). Nella unit: `aidUpdated({ concludedAt })` + `aidBornFrom(QUEST_ID)` nello stesso tick → al più due `findOne` di `QUEST_ID`.

---

## Info

### IN-01: `Quest.awaitingRescue` (e `infos`) sulle quest annidate servite col solo `_id` rispondono `false` senza errore

**File:** `src/quests/awaiting-rescue/quest-awaiting-rescue.resolver.ts:20`; popolamento in `src/characters/character-quests.populate.ts:7-11,19`
**Stato:** VERIFICATO.

Le quest annidate nel personaggio (`quests.<corsia>.quest`, `quests.completedQuests`) sono popolate con `select: '_id'`; `PendingQuestsService.findOne/findAll` non popolano affatto (il parent è un ObjectId). In entrambi i casi `quest.infos` è `undefined`, quindi `locksWhileRescued(undefined)` → `false`: per una hunt bloccata il campo `Boolean!` dice il falso invece di fallire. È lo stesso comportamento di `noEffect` (Phase 18) e oggi la FE non può selezionare il campo lì senza rompersi su `infos: QuestInfos!`, quindi non è un guasto vivo; ma «uguale per tutti e senza N+1» vale solo per `quests`, `quest(id)` e `questUpdated`.

**Fix proposto:** una riga nel handoff («`awaitingRescue` è affidabile solo su `quests`, `quest(id)`, `questUpdated`; sulle quest annidate nel personaggio e nel PendingQuest arriva solo l'id»). Nessun cambio di codice necessario.

### IN-02: chi aveva già accettato la quest prima della nascita dell'aid la vede «strappata» mentre la sta giocando; il limite non è nel handoff

**File:** `src/quests/acceptance/quest-acceptance.service.ts:240,397-408`; tabellone in `src/quests/quest-board.ts:60`
**Stato:** VERIFICATO.

Il blocco agisce solo su `acceptQuest`. Hunt e dungeon non hanno registrazione, quindi più personaggi possono averla già in corsia (in viaggio o in attesa) quando un altro la perde: proseguono e la risolvono normalmente. Il tabellone del viewer include le quest delle sue corsie (`laneQuestIds`), quindi quel giocatore riceve la propria quest in corso con `awaitingRescue: true`. Conseguenze, tutte gestite dal codice: se perde anche lui nascono due aid aperte dalla stessa quest e il blocco dura finché entrambe si chiudono (la `distinct` lo copre); la chiusura della prima ripubblica la quest ancora con `true`.

**Fix proposto:** documentarlo nei «Limiti noti» e nella semantica per la FE («una quest in corso nelle corsie del viewer può avere `awaitingRescue: true`: lo stato "in corso" ha la precedenza sul foglio strappato»).

### IN-03: la corsa residua è accettabile, ma la frase che la descrive è imprecisa

**File:** `.planning/quick/261113-aql-aid-locks-source-quest/261113-aql-SUMMARY.md:112`, `BACKEND-NOTES.md:302`
**Stato:** VERIFICATO (analisi dell'isolamento).

La lettura in sessione fissa lo snapshot della transazione dell'accettazione; l'aid è un altro documento, nessuna delle due transazioni scrive sulla quest d'origine, quindi non c'è conflitto e la finestra è l'intera durata della transazione (qualche ms, riletta a ogni retry). Il documento dice «chi accetta in quell'istante ha accettato prima che l'aid esistesse»: non è esatto, perché l'accettazione può fare commit **dopo** il commit dell'aid (la FE può ricevere prima `questUpdated { awaitingRescue: true }` e poi l'esito positivo di `acceptQuest`). L'effetto resta quello di IN-02 (un giocatore in più sulla quest bloccata), quindi la corsa è accettabile; chiuderla richiederebbe una scrittura sulla quest d'origine in entrambe le transazioni, cioè il campo a DB che il design esclude.

**Fix proposto:** riformulare: «un'aid committata dopo lo snapshot della transazione dell'accettazione non la blocca, anche se l'accettazione fa commit dopo; l'effetto è lo stesso di chi aveva già la quest in corsia».

### IN-04: l'epsilon dei premi non basta per i millisecondi: durate lunghe possono perdere 1 ms

**File:** `src/quests/outcomes/aid/rescue-share.ts:8,26-27,33-39`
**Stato:** VERIFICATO con un calcolo (`Math.floor(t * s + 1e-9)` contro la divisione intera esatta).

`SHARE_EPSILON = 1e-9` è tarato su monete e xp (commento: «mai un'unità intera»). Sui millisecondi l'errore di rappresentazione supera l'epsilon sopra le ~2,5 ore: `86 400 000 × 7/10` → `60 479 999` invece di `60 480 000`; sulla catena `28 800 000` atteso → `28 799 999`. Per 1 h e 2 h (tutte le quote con totale fino a 40 turni) il risultato è esatto, compresa la catena. Effetto pratico nullo (1 ms di attesa in meno), ma il commento a riga 7 non vale per `sharedTimeOf`.

**Fix proposto:** nessuno necessario; se si vuole l'esattezza, in `sharedTimeOf` usare un arrotondamento sull'intero (`Math.floor(Math.round(time * share * 1e3) / 1e3)`) oppure annotare nel commento di `sharedTimeOf` che la tolleranza copre le durate fino a qualche ora.

### IN-05: `isPositiveInteger` è definito due volte

**File:** `src/quests/outcomes/aid/rescue-share.ts:29-30`
**Stato:** VERIFICATO.

La funzione nuova è equivalente a quella già esportata da `src/quests/outcomes/outcome-numbers.ts:1-2` (`Number.isSafeInteger(value) && value > 0`), già usata da `quest-enemies.ts`. Micro-duplicazione di una regola (Clean Code / zero duplicazione del CLAUDE.md).

**Fix proposto:** `import { isPositiveInteger } from '../outcome-numbers';` e togliere la copia locale.

### IN-06: l'oggetto `infos` ricostruito non è protetto da una spec sui campi che non sono `enemies`

**File:** `src/quests/aid-enemies/quest-faced-enemies.resolver.ts:17-25`; spec in `src/quests/quests.resolver.int-spec.ts:1498-1501` e `src/quests/quest-updated.subscription.int-spec.ts:40`
**Stato:** VERIFICATO.

Oggi i sette campi di `QuestInfos` sono copiati tutti (`timeToComplete`, `title`, `enemies`, `type`, `markerLocation`, `relatedLore`, `description`) e i valori sono gli stessi del sottodocumento, quindi nessun campo si perde e nessun ref cambia forma. Però le query delle spec nuove selezionano solo `infos { type enemies { quantity enemy { name } } }`: una copia sbagliata di `title`, `markerLocation` o `relatedLore` solo per le aid di dungeon resterebbe verde. Il tipo di ritorno protegge i campi obbligatori (tsc fallisce se ne manca uno), non quelli opzionali: un futuro campo nullable aggiunto a `QuestInfos` arriverebbe `null` solo sulle aid di dungeon, in silenzio.

**Fix proposto:** nel caso «serves only the groups faced…» selezionare anche `title timeToComplete description markerLocation { id } relatedLore { id }` e confrontarli con la stessa aid letta senza turno (o con i valori persistiti).

### IN-07: la prova «letta nella transazione» non distingue la lettura in sessione da una fuori sessione

**File:** `src/quests/acceptance/quest-acceptance.service.int-spec.ts:1378`
**Stato:** VERIFICATO.

`interleaveBeforeTransaction` inserisce l'aid appena prima di `connection.transaction`: prova che il controllo non è una pre-verifica, ma resterebbe verde anche se `questsAwaitingRescue` fosse chiamata senza `session` dentro il callback. Non è un difetto del codice (`session` è passata, `rescue-lock.ts:36`); è il limite della prova rispetto al titolo.

**Fix proposto:** uno spy su `questModel.distinct` (o sulla `Query.prototype.session`) che pretenda la sessione della transazione, oppure rinominare il caso in «…an aid born after the pre-reads».

### IN-08: commenti rimasti indietro e una divergenza teorica fra le due letture della regola

**File:** `src/models/quest/quest.model.ts:71`; `src/quests/quests.resolver.ts:30`; `src/quests/outcomes/aid/rescue-lock.ts:25`
**Stato:** VERIFICATO (commenti); IPOTETICO (divergenza).

- L'indice `quest_forming_parties` è commentato «serve lo sweep dei party in formazione (D-17b)»: ora regge anche la lettura del blocco (accettazione e filo) e il report al boot. Chi lo toccasse per lo sweep non saprebbe di degradare `acceptQuest` a una scansione. Aggiungere il rimando nel commento.
- `quests.resolver.ts:30` dice «poi un evento a ogni update»: ora anche alla nascita e alla chiusura di un'aid nata dalla quest.
- L'accettazione filtra con `'rescue.failedQuest': { $in: [id] }` (solo forma ObjectId), il filo legge tutte le fonti e passa da `refIdOf` (accetta anche la stringa esadecimale). Un'aid scritta a mano col ref come stringa darebbe `awaitingRescue: true` sul filo e accettazione riuscita. Le aid del codice nascono sempre con un ObjectId (`aid-quest.ts:189`, path tipizzato nello schema), quindi è solo teorico: basta saperlo se si seminano aid a mano in UAT.

---

## Controllato e trovato corretto

**Regola 1 — blocco e `awaitingRescue`**
- `notAwaitingRescueOrReject` è il primo passo del callback della transazione (`quest-acceptance.service.ts:240`), prima di dispensa, claim, registrazione, PendingQuest e punti: un rifiuto non scrive nulla; viene rieseguito sui retry; solo hunt e dungeon leggono. Codice `QUEST_NOT_ACCEPTABLE` esistente. `acceptQuest` è l'unico percorso che crea un PendingQuest (`pendingQuestModel.create` compare solo lì).
- Catena: `buildAidQuest` scrive `failedQuest = original.rescue.failedQuest ?? original._id`; `readOriginal` proietta l'originale senza `rescue`, quindi dall'originale si ottiene il suo `_id`, dall'aid clonata (originale cancellato) il ref ereditato: il blocco continua sulla stessa quest. Più aid aperte dalla stessa quest: la `distinct` le fonde. Aid con la quest d'origine cancellata o di tipo non bloccabile: ref innocuo (`awaitsRescue` richiede hunt/dungeon; il publisher riceve NOT_FOUND e logga a debug). Aid di boss (di gruppo) e di enemy: nessun blocco. Aid fatta a mano senza `rescue`: nessuna fonte, nessuna ripubblicazione.
- Tutti e tre i percorsi di chiusura scrivono `concludedAt` con `$set` di una data; hunt e dungeon non si concludono mai da sole (`isRegistered` falso), quindi restano leggibili da `findOne`.
- Indice: il filtro `{ 'infos.type': 'aid', concludedAt: null [, 'rescue.failedQuest' ] }` usa il prefisso di `quest_forming_parties` (`infos.type`, `concludedAt`, `startedAt`); `concludedAt: null` copre anche il campo assente. Sufficiente. `distinct` in transazione è ammessa su collection non sharded (vale per questo deployment).
- Memo: `WeakMap` sulla chiave di `viewerCacheKeyOf` (context HTTP per richiesta, `rootValue` = payload dell'evento WS, oggetto nuovo a ogni publish e per lo snapshot): nessuna fuga fra richieste o fra eventi, una lettura per evento condivisa da tutti i subscriber, nessuna chiave per viewer perché il valore è globale. I tipi non bloccabili rispondono senza leggere. La spec dell'N+1 spia la `distinct` del modello vero e pretende esattamente 1 chiamata: non è vacua.
- SDL: `git diff develop..HEAD -- src/schema.gql` = una sola riga (`awaitingRescue: Boolean!`); `test/app.int-spec.ts` pinna le due stringhe intere di `type Quest`.

**Change stream**
- Il filtro degli insert è lato server (`fullDocument.infos.type = 'aid'`): gli insert del generatore non arrivano al processo. Gli eventi partono solo dopo il commit; nessun publish dentro la transazione né nei servizi.
- Costo: nascita = 0 letture se nessuno ascolta la quest d'origine (controllo `hasSubscribers` prima della `findOne`); ogni update che scrive `concludedAt` (di qualunque quest) = 1 `findOne` per `_id` con proiezione; raffiche fuse dal `KeyedSingleFlight` (al più due letture per quest).
- Errori: `onChange` non può lanciare in modo sincrono (`refIdOf`, `documentIdOf`, `concludes` sono totali); `republishSourceOf` ha il suo try/catch e logga solo id e `describeError`; lo stream non si ferma. `refIdOf` riconosce l'ObjectId del driver (stesso bson di Mongoose; provato sul filo con un insert reale).

**Regola 2 — nemici dell'aid di dungeon**
- `facedEnemiesOf` usa `slice` (copia): il payload condiviso e il documento non si mutano; `rescueTurnOf` sanifica il turno (indice, totale pari, tipo coerente), un turno malformato o assente → elenco intero; tipi diversi da `aid` restituiscono il sottodocumento originale (identico al resolver di default, quindi nessun impatto sulle altre query né sulle quest annidate, che restano com'erano).
- Filo e risoluzione tagliano la stessa lista: entrambe scartano prima le voci orfane mantenendo l'ordine, poi prendono i primi `floor((index+1)/2)`; le aid nate dal codice portano solo voci valide (`validQuestEnemiesOf`). `facedCatalogOf` riusa la stessa funzione: una sola regola.
- Nessun altro resolver dipende dall'identità del sottodocumento `infos` (`QuestPrizesResolver`, `noEffect`, `known` leggono dal parent `Quest` o dalla voce del nemico).

**Regola 3 — durata**
- `aidShareOf` è l'unica quota per premio e durata; senza turno 1; dall'originale denominatore 1; dall'aid già scalata rapporto delle quote (mai due volte). Il rapporto non supera 1 (`checkedDungeonResolution` vieta un turno oltre quello salvato). `sharedTimeOf`: per difetto, minimo 1 ms solo se il tempo è un intero positivo; null/0/non valido invariati. `AID_TIMEOUT_MS` non toccato. `waitingTime` del soccorritore deriva da `infos.timeToComplete` dell'aid (provato in integrazione).

**Regola 4 — report al boot**
- Due `find` lean proiettati (dungeon aperte sul prefisso dell'indice esistente, poi gli `xp` in un solo `$in`), nessuna scrittura (la spec confronta la collection prima e dopo), tetto di 20 righe + riga riassuntiva, muto se in ordine, errore assorbito da `step` (il boot prosegue). Nemici mancanti dal catalogo saltati, `xp` nullo = 0, parità ammessa, meno di due gruppi = in ordine: come dichiarato. Log con soli id e conteggi.

**Trasversali**
- Nessun `Date.now`, `Math.random`, `process.env`, `console.*`, TODO nel diff di produzione. Nessun dato sensibile nei log nuovi. Nessun codice morto (tutte le esportazioni nuove hanno un chiamante). La spec D-15 rimossa è sostituita da prove sui percorsi reali di chiusura. `git status --short` del repo vuoto a fine revisione.

---

_Revisore: Claude (gsd-code-reviewer) — profondità deep, sola lettura_


## Ruling dell'orchestratore (2026-11-13)

| Id | Ruling |
|----|--------|
| WR-01 | **FIX.** Il publisher ripubblica la quest d'origine a ogni cambio di `concludedAt` di un'aid (data, ritorno a nullo, rimozione del campo) e sul `replace` del documento dell'aid; test per i casi nuovi. La cancellazione a mano resta un limite dichiarato. |
| WR-02 | **FIX (test).** Una spec prova il contratto intero del soccorso perso: l'aid vecchia si chiude, la nuova nasce, e l'ultimo evento della quest d'origine porta `awaitingRescue: true`; verifica che diventi rossa rompendo l'ordine o il single-flight. |
| IN-01, IN-02, IN-03 | **FIX documentale** nel SUMMARY del quick task e nella sezione dell'aggiornamento di `BACKEND-NOTES.md`: `awaitingRescue` vale `false` sulle quest annidate servite col solo `_id`; chi ha già la quest in corsia la gioca comunque e la riceve con `awaitingRescue: true`; la frase sulla corsa residua riscritta in modo esatto (un'accettazione può fare commit dopo la nascita dell'aid se la sua lettura in sessione l'ha preceduta). |
| IN-04 | **FIX.** La durata in proporzione si calcola in aritmetica intera sui millisecondi (numeratore e denominatore della quota, divisione intera per difetto), senza epsilon: nessun millisecondo perso su durate lunghe. Se la quota è disponibile solo come frazione decimale, esponi numeratore e denominatore dalla stessa sorgente (una sola quota). Casi: 86 400 000 ms con 7/10 → 60 480 000; 3 600 000 con 2/8 → 900 000. I premi restano come sono salvo che la stessa via li renda più semplici senza cambiarne i valori pinnati. |
| IN-05 | **FIX**: riusa `isPositiveInteger` esistente. |
| IN-06 | **FIX (test)**: la spec dell'aid di dungeon sul filo seleziona e asserisce TUTTI i campi di `infos` (uguali all'originale salvo `enemies`). |
| IN-07 | **FIX (test)** se praticabile in modo deterministico (spy sulla lettura con la sessione attesa); altrimenti `not_needed` motivato. |
| IN-08 | **FIX**: commenti riallineati; per `rescue.failedQuest` scritto come stringa, `not_needed` (dato non valido per lo schema). |
