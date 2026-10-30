# BACKEND-NOTES — Phase 9.1 Spell State and Recovery Contract (handoff per la FE Phase 8 e la BE Phase 10)

- **Fase BE:** 09.1-spell-state-and-recovery-contract (requisiti BE-SPELL-01, BE-SPELL-02, BE-SPELL-03, BE-SPELL-04; decisioni D-01..D-13 in `09.1-CONTEXT.md`, emendato dopo la ricerca con i flag F1–F11 di `09.1-RESEARCH.md`).
- **Data:** 2026-10-27. Documento di fine fase, scritto prima della UAT su device (manual-only: appartiene alla FE Phase 8, con i dati di §7).
- **Risponde a:** `Klimmeck-Guide/.planning/phases/08-spells-section-journal-tab/BACKEND-NOTES.md` (richiesta FE: §2 contratto, §4 migrazione, §5 codici, §6 le 5 domande).
- **Branch:** `feat/09.1-spell-state-and-recovery-contract` → PR verso `develop` **prima** del piano finale della FE Phase 8 (08-12), che legge questo file da `origin/develop`. La BE Phase 10 (`feat/10-hardening`) parte da questo branch e si rebasa dopo la merge.
- **Schema:** `src/schema.gql` è **solo additivo** rispetto a `origin/develop`: 0 righe `-`, aggiunte solo `type SpellState` e `CharacterStatus.spellStates`. Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate di fine fase (09.1-10): unit **132 suite / 1949 test** (~6 s), integration **78 suite / 1023 test** (replica set + Redis effimero, `--runInBand`, ~179 s), `npm run build` exit 0, `eslint` (0 errori) e `prettier --check` puliti sui 66 `.ts` toccati dalla fase, nessuna dipendenza nuova. Baseline di inizio fase: unit 124 / 1841, integration 76 / 984. Dopo i fix della code review (`09.1-REVIEW-FIX.md`): unit **133 / 1974**, integration **78 / 1029**.
- **Fonte:** ogni nome, codice, messaggio e riga di SDL qui sotto è copiato dal codice (`src/schema.gql`, `src/gameRules/game-rule-error-code.enum.ts`, `src/gameRules/game-rule.exception.ts`, `src/authz/resource-not-found.exception.ts`, `src/authz/authorization.exception.ts`, `src/characters/**`, `src/config/spell-recovery-config.ts`). **Lo schema generato `src/schema.gql` vince su questo documento.**

---

## 0. TL;DR per il FE

1. **La regola dell'utente (D-01, verbatim):** *«Il recupero vale sempre, che la magia venga equipaggiata o disequipaggiata. Il timer di recupero non si interrompe mai. Se io disequipaggio la magia e 10 secondi dopo dovrebbe recuperare un utilizzo, 10 secondi dopo recupererà un utilizzo».* Usi e recuperi appartengono alla **magia conosciuta**, non allo slot. La Phase 4 D-11 («equip riporta gli usi a `maxUsages`») è superata.
2. **Un solo campo nuovo:** `CharacterStatus.spellStates: [SpellState!]!`, con `SpellState { spell: Spell!, usages: Int!, recoveries: [DateTime!]! }`. È esattamente la proposta del §2 della richiesta FE.
3. **`recoveries` è crescente:** il primo istante è il prossimo uso che torna (ora server, UTC, ISO con millisecondi). Due usi nello stesso istante danno due istanti uguali.
4. **`ActiveSpell.usages` resta sul filo** e vale sempre quanto la voce di stato della stessa magia, in ogni emissione. Il FE può ignorarlo e leggere usi e recuperi solo da `spellStates`.
5. **Equip e unequip non toccano usi né istanti.** Un uso torna anche quando la magia è fuori dagli slot.
6. **Selezionare `spellStates` solo su `character(id)` e `characterUpdated(id)`.** Sulla lista `characters` (innkeeper) e su `User.currentCharacter` lo stato non è popolato (§1).
7. **Codici:** quelli di oggi; il codice del recupero non disponibile della Phase 4 è rimosso; `BAD_USER_INPUT` arriva con la BE Phase 10 (§5).

---

## 1. Contratto GraphQL (additivo)

SDL verbatim da `src/schema.gql` (blocchi rilevanti; gli altri campi di `Character`, `Mutation` e `Subscription` sono invariati):

```graphql
type SpellState {
  recoveries: [DateTime!]!
  spell: Spell!
  usages: Int!
}

type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  coins: Coins!
  currentLifePoints: Int!
  injuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  spellStates: [SpellState!]!
  spells: [Spell!]!
  title: String!
  xp: Int!
}

type ActiveSpell {
  spell: Spell
  usages: Int!
}

type Spell {
  description: String!
  energyDamage: EnergyDamage!
  id: ID!
  maxUsages: Int!
  minXpToLearn: Int!
  name: String!
  recoveryTime: Int!
  requiredLearnTime: Int!
  useType: String!
}

input EquipSpellRequest {
  id: String!
  spellId: String!
  usages: Int
}

input UseSpellRequest {
  characterId: String!
  spellId: String!
}

# type Mutation
  equipSpell(request: EquipSpellRequest!): CommonResponse!
  unequipSpell(request: EquipSpellRequest!): CommonResponse!
  useSpell(request: UseSpellRequest!): CommonResponse!

# type Subscription
  characterUpdated(id: String!): Character!
```

Diff dello SDL contro `origin/develop` (righe `+`, nessuna riga `-`):

```
+  spellStates: [SpellState!]!
+type SpellState {
+  recoveries: [DateTime!]!
+  spell: Spell!
+  usages: Int!
+}
```

**Frammento d'esempio per il FE** (query `character(id)` e subscription `characterUpdated(id)`):

```graphql
status {
  spells { ...SpellFields }
  spellStates { spell { id } usages recoveries }
}
assets {
  activeSpells { usages spell { ...SpellFields } }
}
```

- `EquipSpellRequest.usages` resta nello schema ma è **ignorato** dal BE (deprecato, il FE non lo invia).
- `recoveryTime` è in **millisecondi**: il BE calcola `dueAt = ora server + recoveryTime`. Il FE non calcola `dueAt` da solo.
- `requiredLearnTime`: **nessun codice del BE lo legge** (Phase 9 D-17: il tempo dello studio è `timeToComplete` della quest). È un numero del catalogo scritto a mano, senza un'unità imposta dal codice; l'ipotesi del FE (millisecondi, come `recoveryTime`) è coerente con il catalogo ma resta solo informativa: non derivarne timer.
- **Pitfall 4 (solo `character` e `characterUpdated`):** la lista `characters` dell'innkeeper e `User.currentCharacter` (`me`, `users`, `userUpdated`) non passano dal mapper che popola lo stato. Selezionare `spellStates { spell { … } }` lì dà ancora `ID cannot represent value: Buffer`. **Non selezionare `spellStates` su quei percorsi.**

---

## 2. Invarianti

Valgono per ogni emissione di `character(id)` e `characterUpdated(id)` (snapshot alla sottoscrizione compreso):

- **Una voce per ogni magia di `status.spells`, nello stesso ordine.** Il FE può comunque fare il join per `spell.id`.
- **`0 ≤ usages ≤ spell.maxUsages`.**
- **`recoveries` crescente**, con duplicati possibili (più usi spesi nello stesso istante, ad esempio un esito che spende 2 usi).
- **`recoveries.length == maxUsages − usages`** quando ogni recupero è tracciato. La lista è più corta solo per gli usi spesi prima del deploy (job legacy senza istante): il FE mostra «in recupero» senza tempo finché la magia non torna al massimo. Mai più lunga: la migrazione taglia gli istanti che nessun credito può consumare.
- **Magie orfane fuori dal filo:** una voce di stato o uno slot la cui magia è stata cancellata dal catalogo o non è in `status.spells` non viene servita (la query risponde senza `errors`; anche `status.spells` scarta l'orfano). Nel DB la voce resta con i suoi usi.
- **`ActiveSpell.usages` uguale alla voce di stato in ogni emissione:** stato e mirror (`assets.activeSpells[].usages`) cambiano nello **stesso update**, e `findOne` serve comunque gli usi dello slot leggendoli dallo stato. `activeSpells` segue l'ordine degli slot.
- **Personaggio senza magie:** `spellStates: []`. Ogni personaggio nuovo nasce con `spellStates: []`.

---

## 3. Esempio di payload

`characterUpdated` con due magie conosciute: `a` attiva (`maxUsages: 3`, 1 uso, due istanti futuri) e `b` non attiva (`maxUsages: 2`, 1 uso, un istante futuro). Gli id sono placeholder.

```json
{
  "data": {
    "characterUpdated": {
      "id": "<characterId>",
      "status": {
        "maxActiveSpells": 1,
        "spells": [
          { "id": "<spellAId>", "name": "<nome A>", "maxUsages": 3, "recoveryTime": 1800000 },
          { "id": "<spellBId>", "name": "<nome B>", "maxUsages": 2, "recoveryTime": 600000 }
        ],
        "spellStates": [
          {
            "spell": { "id": "<spellAId>" },
            "usages": 1,
            "recoveries": ["2026-10-27T10:02:00.000Z", "2026-10-27T10:30:00.000Z"]
          },
          {
            "spell": { "id": "<spellBId>" },
            "usages": 1,
            "recoveries": ["2026-10-27T10:10:00.000Z"]
          }
        ]
      },
      "assets": {
        "activeSpells": [{ "usages": 1, "spell": { "id": "<spellAId>" } }]
      }
    }
  }
}
```

Payload reale registrato dal test `carries the spell states with their future instants in every emission` (09.1-07; magia con `maxUsages` 3 e `recoveryTime` 10 min; id sostituito):

```json
// snapshot alla sottoscrizione
{"status":{"spellStates":[{"spell":{"id":"<spellId>"},"usages":1,
  "recoveries":["2026-10-27T14:28:26.330Z","2026-10-27T14:56:26.330Z"]}]},
 "assets":{"activeSpells":[{"usages":1,"spell":{"id":"<spellId>"}}]}}
// emissione dopo useSpell: il nuovo istante (now + 10 min) entra in ordine fra i due esistenti
{"status":{"spellStates":[{"spell":{"id":"<spellId>"},"usages":0,
  "recoveries":["2026-10-27T14:28:26.330Z","2026-10-27T14:36:26.381Z","2026-10-27T14:56:26.330Z"]}]},
 "assets":{"activeSpells":[{"usages":0,"spell":{"id":"<spellId>"}}]}}
```

---

## 4. Regole di gioco

- **`equipSpell`:** guard invariate (magia conosciuta, non già attiva, capacità sull'xp vivo con la tabella di `active-spell-slots.ts`: < 20000 → 0 slot, ≥ 20000 → 1, ≥ 25000 → 2, ≥ 30000 → 3, ≥ 40000 → 4; dal titolo `mage` in su). Un solo `updateOne` condizionale con **update pipeline** aggiunge lo slot `{ spell, usages: <usi della voce di stato> }` (fallback `maxUsages` del catalogo solo se la voce manca). Lo stato non cambia; `request.usages` è ignorato. Il ciclo disequip → equip **non ricarica** gli usi.
- **`unequipSpell`:** `$pull` dello slot, stato intatto (usi e istanti continuano).
- **`useSpell`:** chiamata solo dal BE/combattimento (il FE non ha un documento). La magia deve essere **attiva** (negli slot) con `usages ≥ 1` nella voce di stato. Un solo `updateOne` condizionale toglie un uso a stato e mirror e inserisce `dueAt = ora server + recoveryTime` in `recoveries` (ordinato). Poi accoda un trigger best-effort (§8): se Redis non risponde la mutation risponde comunque `{ successful: true, response: 'Magia utilizzata con successo' }` e l'uso torna con lo sweep. Nessuna compensazione.
- **Recupero:** ogni istante scaduto (`recoveries[0] ≤ ora server`) di un personaggio attivo restituisce un uso (`+1` su stato e mirror, `$pop` dell'istante più vecchio), **anche fuori dagli slot**, mai oltre `maxUsages`. Lo fanno il trigger Bull (puntuale) e lo sweep (entro un intervallo, 60 s di default). Personaggi archiviati e magie assenti dal catalogo (o con `maxUsages` non valido) vengono saltati: un WARN con soli id una volta per coppia personaggio/magia per processo (`… assente dal catalogo …` oppure `… con maxUsages non valido nel catalogo …`), poi lo sweep smette di chiederne il credito fino al riavvio (la voce resta nel DB con i suoi usi; una magia ripristinata nel catalogo torna a recuperare dal boot successivo o al suo trigger Bull).
- **Esiti della Phase 9** (combattimento, boss, rescue, override del GM): spendono sullo stato dallo snapshot letto nella transazione, `taken = min(richiesti, usi dello stato)`, solo magie negli slot; un istante `now + recoveryTime` per ogni uso speso, un trigger per coppia (magia, istante).
- **Apprendimento** (esito `study` con `spellLearned`): la magia entra in `status.spells` e, nello stesso `$set`, in `status.spellStates` come `{ spell, usages: maxUsages, recoveries: [] }`. Una magia premio senza `maxUsages` intero ≥ 0 nel catalogo non si insegna.
- **Phase 4 D-11 superata** per gli usi (gli slot e le soglie restano quelli della Phase 4).

---

## 5. Codici di rifiuto

> **Emendato dalla Phase 10 (2026-10-29):** in `equipSpell`/`unequipSpell`/`useSpell` uno `spellId` (o l'id del personaggio) malformato risponde `BAD_USER_INPUT` (`Input non valido: spellId` / `id`), non più `SPELL_NOT_KNOWN`/`SPELL_NOT_ACTIVE`/`NOT_FOUND`; i codici per gli id ben formati sono invariati. Il campo deprecato `EquipSpellRequest.usages` resta nello schema ma viene scartato in silenzio dalla pipe prima del service. Vedi `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §3.

| Codice | Messaggio | Mutation | Quando |
|---|---|---|---|
| `SPELL_NOT_KNOWN` | `Magia non conosciuta` | `equipSpell` | la magia non è in `status.spells` |
| `SPELL_ALREADY_ACTIVE` | `Magia già attiva` | `equipSpell` | la magia è già in uno slot |
| `MAX_ACTIVE_SPELLS_REACHED` | `Hai raggiunto il numero massimo di magie attive` | `equipSpell` | slot pieni sull'xp vivo (anche `maxActiveSpells == 0`); è anche il fallback dopo due riletture di contesa |
| `SPELL_NOT_ACTIVE` | `Magia non attiva` | `unequipSpell`, `useSpell` | la magia non è in uno slot (anche se conosciuta e con usi nello stato); per `useSpell` anche un `spellId` malformato |
| `SPELL_NO_USAGES_LEFT` | `Magia senza utilizzi rimasti` | `useSpell` | zero usi nella voce di stato (fallback dopo due riletture) |
| `NOT_FOUND` | `Personaggio non trovato` / `Magia non trovata` | tutte e tre | personaggio assente o archiviato; magia assente dal catalogo; per `useSpell` anche `recoveryTime` non numerico nel catalogo; per `equipSpell` anche `maxUsages` non intero ≥ 0 nel catalogo (nulla viene scritto) |
| `FORBIDDEN` | `Questo personaggio non ti appartiene` | tutte e tre | `@OwnsCharacter`: il personaggio non è dell'utente (l'innkeeper agisce per conto del proprietario) |
| `UNAUTHENTICATED` | (invariato, Phase 2) | tutte e tre | token assente o scaduto: agisce il flusso di sessione |

- **`SPELL_RECOVERY_UNAVAILABLE` è rimosso** (enum, factory e test). Non era nello SDL: la coda giù non fa più fallire `useSpell`. Il FE non lo mappava: nessun cambiamento.
- **`BAD_USER_INPUT`** arriverà con la BE Phase 10 (ValidationPipe, `@IsMongoId` sugli input delle magie): il FE lo tratta già come rollback + banner generico.
- Risposte di successo invariate: `Magia equipaggiata con successo`, `Magia disequipaggiata con successo`, `Magia utilizzata con successo` (`successful: true`).

---

## 6. Risposte alle domande della FE (§6)

### Domanda 1

**`ActiveSpell.usages`: mirror atomico o risoluzione dallo stato?** Entrambe le cose (D-04a). `assets.activeSpells[].usages` è un mirror scritto nello **stesso `updateOne`** di ogni variazione dello stato (`arrayFilters` `s`/`a`: uso, credito, equip, esiti). In più `CharactersService.findOne` (query `character`, publisher di `characterUpdated`, snapshot alla sottoscrizione) prende comunque gli usi dello slot dalla voce di stato. Il test della subscription verifica `activeSpells[0].usages === spellStates[0].usages` in ogni emissione dopo `useSpell`.

### Domanda 2

**Il recupero di una magia non attiva avviene lo stesso?** Confermato. Il processor (`src/characters/spells/spell-recovery.processor.ts`) e lo sweep (`spell-recovery.sweeper.ts`) passano entrambi da `SpellRecoveryService`, il cui filtro non guarda gli slot (0 riferimenti ad `activeSpells` nei due file). I test che lo provano citano la regola nel titolo: `«Il recupero vale sempre…»: an unequipped spell recovers…` (service), `«Il timer di recupero non si interrompe mai»: a job whose instant is due gives the usage back to an unequipped spell` (processor), `«Il timer di recupero non si interrompe mai»: the sweep gives back every due instant within one pass, equipped or not` (sweep). Il vecchio processor che saltava le magie non attive non esiste più.

### Domanda 3

**Intervallo dello sweep?** 60 s di default: `SPELL_RECOVERY_SWEEP_INTERVAL_MS` vuota = 60 000 ms (§8). Al boot gira anche un reconciler (un giro dello sweep subito). Il trigger Bull di solito restituisce l'uso puntualmente; se il job è perso, in anticipo di oltre 5 s o Redis è giù, l'uso torna al giro successivo dello sweep (un anticipo fino a 5 s viene atteso dal job stesso). Quindi «prossimo tra 0 min» / «in arrivo…» dura al più un intervallo (~60 s).

### Domanda 4

**`SPELL_RECOVERY_UNAVAILABLE` resta?** No, è rimosso. L'accodamento del recupero è best-effort (`enqueueTrigger` con timeout di 2 s e WARN `… lo restituirà lo sweep`): `useSpell` risponde con successo anche con Redis giù. Il FE non deve mapparlo.

### Domanda 5

**Dati UAT:** script e comandi in §7 (un `mage` con 2 magie conosciute, una attiva con `usages < maxUsages` e istanti a ~2 min e ~30 min, una non attiva in recupero; un `adventurer` con una magia conosciuta). Checklist in §9.

---

## 7. Dati UAT (script da eseguire dalla root del BE)

Nessuna migrazione da preparare a mano: dopo il deploy il boot migra da solo (§8). Per la UAT servono due personaggi esistenti (id letti dall'app o con una `find`). Lo script va salvato **nello scratchpad della sessione, mai nel repo**, e lanciato dalla root del BE: `cd <root BE> && node <percorso dello script> <mageCharacterId> <adventurerCharacterId>`. Legge `MONGO_URI` e `DB_NAME` da `.env` senza stamparli; stampa solo id e conteggi.

```js
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFromBe = createRequire(path.join(process.cwd(), 'package.json'));
requireFromBe('dotenv').config({ path: path.join(process.cwd(), '.env'), quiet: true }); // la URI non viene mai stampata
const { MongoClient, ObjectId } = requireFromBe('mongodb');

const MINUTE = 60 * 1000;

async function main([mageArg, adventurerArg]) {
  if (!ObjectId.isValid(mageArg ?? '') || !ObjectId.isValid(adventurerArg ?? '')) {
    console.log('uso: node <script> <mageCharacterId> <adventurerCharacterId>');
    process.exitCode = 1;
    return;
  }
  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    // 1. due magie del catalogo con maxUsages >= 3 (altrimenti crearle con insertOne e annotarne gli id)
    const [a, b] = await db.collection('spells')
      .find({ maxUsages: { $gte: 3 } }, { projection: { maxUsages: 1 } })
      .limit(2).toArray();
    if (!a || !b) {
      console.log('servono due magie con maxUsages >= 3 nel catalogo');
      process.exitCode = 1;
      return;
    }
    const now = Date.now();
    // 2. mage: 1 slot (xp 20000), a attiva con due istanti, b non attiva in recupero
    const mage = await db.collection('characters').updateOne(
      { _id: new ObjectId(mageArg), deletedAt: null },
      { $set: {
        'status.title': 'mage',
        'status.xp': 20000,
        'status.spells': [a._id, b._id],
        'status.spellStates': [
          { spell: a._id, usages: a.maxUsages - 2, recoveries: [new Date(now + 2 * MINUTE), new Date(now + 30 * MINUTE)] },
          { spell: b._id, usages: b.maxUsages - 1, recoveries: [new Date(now + 10 * MINUTE)] },
        ],
        'assets.activeSpells': [{ spell: a._id, usages: a.maxUsages - 2 }],
      } },
    );
    // 3. adventurer (sotto mage): una magia conosciuta a usi pieni, nessuno slot
    const adventurer = await db.collection('characters').updateOne(
      { _id: new ObjectId(adventurerArg), deletedAt: null },
      { $set: {
        'status.title': 'adventurer',
        'status.spells': [a._id],
        'status.spellStates': [{ spell: a._id, usages: a.maxUsages, recoveries: [] }],
        'assets.activeSpells': [],
      } },
    );
    // 4. solo id e conteggi
    console.log('magie', a._id.toHexString(), b._id.toHexString());
    console.log('mage', mage.matchedCount, mage.modifiedCount);
    console.log('adventurer', adventurer.matchedCount, adventurer.modifiedCount);
  } finally {
    await client.close();
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.log('errore', error?.name, error?.code); // mai il messaggio: può contenere la URI
  process.exitCode = 1;
});
```

- `matchedCount` 0 = id sbagliato o personaggio archiviato.
- **Nessun job Bull serve:** l'istante a +2 min torna con lo sweep entro 60 s (è la prova di D-09 sul device: «in arrivo…» poi l'uso). Anche `b`, fuori dagli slot, recupera a +10 min (prova di D-01).
- L'`adventurer` vede la magia conosciuta ma `maxActiveSpells == 0`: nessuna chiamata, banner (prova del ramo «slot pieni / zero slot» del FE).
- Il `mage` ha 1 slot: tentare di equipaggiare `b` con `a` attiva dà `MAX_ACTIVE_SPELLS_REACHED`; disequipaggiare `a` e riequipaggiarla non cambia usi né istanti.

Equivalente `mongosh` (soli placeholder, RESEARCH §Q11):

```js
const now = Date.now(), min = 60 * 1000;
const [a, b] = db.spells.find({ maxUsages: { $gte: 3 } }, { maxUsages: 1 }).limit(2).toArray();
db.characters.updateOne({ _id: ObjectId('<mageId>'), deletedAt: null }, { $set: {
  'status.title': 'mage', 'status.xp': 20000,
  'status.spells': [a._id, b._id],
  'status.spellStates': [
    { spell: a._id, usages: a.maxUsages - 2, recoveries: [new Date(now + 2 * min), new Date(now + 30 * min)] },
    { spell: b._id, usages: b.maxUsages - 1, recoveries: [new Date(now + 10 * min)] },
  ],
  'assets.activeSpells': [{ spell: a._id, usages: a.maxUsages - 2 }],
} });
db.characters.updateOne({ _id: ObjectId('<adventurerId>'), deletedAt: null }, { $set: {
  'status.title': 'adventurer', 'status.spells': [a._id],
  'status.spellStates': [{ spell: a._id, usages: a.maxUsages, recoveries: [] }],
  'assets.activeSpells': [],
} });
```

Se il DB ha meno di due magie con `maxUsages ≥ 3`, crearle a mano con `db.spells.insertOne` (stessi campi di `type Spell`, `recoveryTime` in ms).

---

## 8. Deploy

- **Variabile nuova, opzionale:** `SPELL_RECOVERY_SWEEP_INTERVAL_MS` (già in `.env.example`, vuota). Vuota = 60 000 ms; `0` spegne lo sweep periodico (reconciler e migrazione al boot girano sempre); valore malformato → boot rifiutato senza eco del valore. Non è un segreto. **Con `0` non resta alcuna rete di sicurezza fino al boot successivo:** un job perso, evictato o in anticipo di oltre 5 s non viene restituito finché il reconciler non rigira. In produzione tenere lo sweep attivo.
- **Coda invariata:** `bull:spell-recovery:*`, job `recover`. Il job ora porta `{ characterId, spellId, dueAt }` (`dueAt` in epoch ms) con `jobId` deterministico `spell-<characterId>-<spellId>-<dueAtMs>`, `delay = max(0, dueAt − now)`, `removeOnComplete: true`, `removeOnFail: false`. Due usi nello stesso millisecondo collassano in un solo job, che restituisce tutti gli istanti scaduti. Il job è solo un trigger: il credito parte dal DB. Un job che scatta in anticipo di al più 5 s (`EARLY_RECOVERY_TOLERANCE_MS`, skew tra l'orologio di Redis e quello dell'app) attende il tempo restante e poi restituisce l'uso; oltre i 5 s non può venire da `dueAt` e resta allo sweep (LOG `Job di recupero <jobId> in anticipo: lo restituirà lo sweep`).
- **Job legacy** già in Redis al deploy (senza `dueAt`): restituiscono solo il deficit non tracciato (`usages + recoveries.length < maxUsages`), senza toccare gli istanti.
- **Migrazione al boot** (`SpellStateMigrator`, attesa ma mai bloccante): ogni personaggio attivo senza `status.spellStates` riceve una voce per ogni magia di `status.spells` (usi dello slot se attiva, altrimenti `maxUsages`; `recoveries: []`); le voci incoerenti vengono riparate e gli istanti in eccesso tagliati (una voce malformata scritta a mano, con `usages` non intero o `recoveries` non lista, non è mai tagliata né riparata: resta com'è e non interrompe il batch né `migrateOne`; operatori del filtro e del taglio tutti ≤ 4.2: `$isArray`, `$type`, `$trunc`, `$cond`). Log con soli id e conteggi: LOG `Stati delle magie: migrati N personaggi`, WARN `Stati delle magie riparati per N personaggi`, WARN per voce `Stato della magia <spellId> del personaggio <characterId> fuori dai limiti del catalogo: istanti in eccesso scartati, usi invariati`, WARN `… incoerenti ma non riparabili per N personaggi: slot di magie non conosciute`. In errore: ERROR `Migrazione degli stati delle magie fallita (<nome e codice>): i recuperi migrano per personaggio al primo credito`. Inoltre ogni credito (processor e sweep) migra il singolo personaggio prima di scrivere (`migrateOne`). Gli archiviati non vengono toccati.
- **MongoDB di produzione ≥ 4.2 da confermare prima del deploy:** l'update pipeline di `equipSpell` e la migrazione la richiedono (`$arrayElemAt` + `$let`, nessun operatore 4.4+). Con una versione inferiore equip e migrazione falliscono.
- **Redis in produzione:** verificare la **`maxmemory-policy`** (blocker in STATE): con una policy di eviction i delayed job possono sparire; lo sweep li copre. Consigliata `noeviction`.
- **Nessuna dipendenza nuova, nessun indice nuovo** (l'indice su `status.spellStates.recoveries` è rinviato alla Phase 10). Moduli: `SpellRecoveryModule` (migrator, servizio di credito, processor, sweeper) montato in `AppModule` dopo `CharactersModule`.

---

## 9. Checklist UAT differita (FE Phase 8)

Con i dati di §7, sul device:

- [ ] La riga della magia `a` mostra «Usi: `usages`/`maxUsages` · prossimo tra X» con X calcolato dal **tempo server** sul primo istante di `recoveries` (~2 min).
- [ ] Allo scadere: «in arrivo…» finché lo sweep non emette (entro ~60 s), poi l'uso torna e il countdown passa al secondo istante (~30 min).
- [ ] La magia `b`, non attiva, recupera a ~10 min senza essere equipaggiata.
- [ ] Equip/unequip di `a` non resettano né usi né istanti (nessuna scorciatoia disequip → equip).
- [ ] Slot pieni (`mage` con `a` attiva, tap su `b`) → nessuna chiamata o `MAX_ACTIVE_SPELLS_REACHED` + banner; `adventurer` con `maxActiveSpells == 0` → nessuna chiamata, banner.
- [ ] Il contatore sulla carta nello slot è uguale agli usi della voce di stato in ogni emissione.

---

## 10. Note per la BE Phase 10

> **Emendato dalla Phase 10 (2026-10-29):** chiusi dalla Phase 10: indice `character_spell_recoveries` (costruito al boot), validazione degli id (`BAD_USER_INPUT`), ritipizzazione di `status.spells` e `ActiveSpell.spell` con migrazione, test di drift di `.env.example` su tutti gli `*_ENV_KEYS`; i job falliti della coda `spell-recovery` sono tenuti al massimo 7 giorni o 1 000 (`removeOnFail` limitato). `usages` non è stato rimosso né marcato deprecato nello schema (schema invariato): scartato dalla whitelist. Vedi `.planning/phases/10-hardening-trasversale/BACKEND-NOTES.md` §3, §10, §13.

- **Indice** su `status.spellStates.recoveries` per la query dello sweep (`{ deletedAt: null, 'status.spellStates.recoveries': { $lte: now } }`), insieme agli altri indici.
- **`@IsMongoId`** su `EquipSpellRequest` (`id`, `spellId`) e `UseSpellRequest` (`characterId`, `spellId`): oggi un id malformato dà `SPELL_NOT_ACTIVE`/`NOT_FOUND`, con la ValidationPipe darà `BAD_USER_INPUT`.
- **Ritipizzazione dei ref `Mixed`** (`status.spells`, `ActiveSpell.spell`): i filtri confrontano ancora entrambe le forme (`ObjectId` e hex). `SpellState.spell` è già castato a ObjectId.
- **Test di drift** di `SPELL_RECOVERY_ENV_KEYS` contro `.env.example` (oggi la riga è fissata da `env.validation.spec.ts`).
- **`EquipSpellRequest.usages`** è deprecato e ignorato: rimuoverlo o marcarlo `@deprecated` nello schema (cambio non additivo: coordinare con il FE).

---

## 11. Deviazioni e punti aperti

**Deviazioni dai piani (dettagli nei SUMMARY 09.1-01..09):**

- 09.1-02: il massimo del catalogo è avvolto in `$ifNull [..., null]` (una magia fuori catalogo non viene più segnalata né tagliata); input del `$map` del taglio con `$ifNull`; il controllo letterale sulle righe `SIGHTENGINE_*` di `.env.example` sostituito dalla sua intenzione (le righe dell'utente erano già committate sul branch con `chore(env)`).
- 09.1-03: nomi univoci negli insert grezzi delle int-spec (indice unico sul nome); `migrateOne` con `{ ...inconsistentFilter(), _id }`; WARN dedicato ai personaggi incoerenti non riparabili (slot di una magia non conosciuta); `isUsageCount` condiviso.
- 09.1-04: helper `recoverSafely`/`isDue` nello sweeper; la coda resta registrata sia in `CharactersModule` sia in `SpellRecoveryModule` (stessa istanza Bull).
- 09.1-05: il test unequip con la frase della regola era già verde in RED (comportamento già corretto, resta come regressione).
- 09.1-06: fixture dei test di classificazione con `status.spellStates` coerente; `recoveryTime` non numerico nel catalogo → `NOT_FOUND` senza scrivere.
- 09.1-07: `activeSpells` sul filo segue l'ordine degli slot (prima seguiva `status.spells`); slot senza voce di stato → usi dello slot.
- 09.1-08: `CombatCharacterSnapshot.status` riceve anche `spells`; `isUsageCount` riusato nel catalogo premi.
- 09.1-09: un trigger per coppia (magia, istante); `Clock` come ultimo parametro di `OutcomeWriter`.

**Punti tecnici:**

- **`$arrayElemAt [..., 0]` al posto dell'operatore array del RESEARCH:** la soglia resta MongoDB 4.2 (A1 del RESEARCH ipotizzava 4.4).
- **Open Question 13 del RESEARCH superata** (revisione 2026-10-27): migrazione e verifier **tagliano** gli istanti non più consumabili (usi al massimo, oppure più istanti del deficit), con WARN per voce e usi invariati.
- **Esiti su personaggi non ancora migrati:** calcolati dalla base migrata in memoria (`spellStatesOrMigrated`, usi presi dal mirror), così il `$set` dell'esito scrive la lista completa.
- **A1:** versione MongoDB di produzione ≥ 4.2 da confermare prima del deploy (§8).
- **A2:** Bull può far scattare un delayed job con qualche ms di anticipo: entro 5 s il processor attende l'istante e restituisce l'uso (fix WR-01 della review); oltre lo lascia allo sweep (al più un intervallo di ritardo, «in arrivo…»).
- **A3:** i job legacy in Redis al deploy restituiscono solo il deficit non tracciato; un job legacy perso lascia un deficit permanente (come prima della fase), rimediabile solo a mano.
- **UAT su device:** manual-only, rinviata alla FE Phase 8 (§9). La verifica di questa fase non richiede interventi umani.
