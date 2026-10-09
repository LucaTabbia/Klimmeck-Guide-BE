# BACKEND-NOTES — Phase 2.1 Character Creation Contract (handoff per il FE)

- **Fase BE:** 02.1-character-creation-contract (requisiti BE-CHAR-01..05, decisioni D-01..D-21 in `02.1-CONTEXT.md`)
- **Data:** 2026-10-09
- **Branch:** `feat/02.1-character-creation-contract` (PR verso `develop`)
- **Stato:** contratto implementato, montato in `AppModule` e coperto da integration test sul replica set (18 test sul wire per `createCharacter`/`raceTraits`, incluso il test di concorrenza; boot reale in `test/app.int-spec.ts`).
- **Consumatori:** FE Phase 2 (`02-character-creation`, pagina di creazione); indirettamente FE Phase 3 (il personaggio creato entra nel flusso `character(id)` + subscription `characterUpdated`).
- **Fonte:** ogni nome qui sotto (operazioni, argomenti, campi, enum, codici, messaggi, path) è copiato dal codice: `src/schema.gql`, `src/characters/creation/**`, `src/rest/cloudinary/**`. Se questo documento e lo schema divergono, **vince `src/schema.gql`**.

---

## 0. TL;DR per il FE

- **Mutation `createCharacter(input: CreateCharacterInput!): User!`**, solo con bearer. Nessun `userId`/`twitchId` nell'input: l'identità arriva esclusivamente dal token. Crea il `Character`, imposta `User.currentCharacter` e restituisce lo `User` aggiornato.
- **Query `raceTraits: [RaceTraits!]!`** autenticata (nessun `@Public()`): per ogni razza `minAge`/`maxAge`. È la stessa tabella che il BE usa per validare: **nessuna copia nel FE**.
- **Enum GraphQL nell'input** (`SexType`, `PronounType`, `RaceType`, `ClassType`): i nomi coincidono con gli enum Dart. Inviare `enum.name` **tramite variabili** (stringhe JSON `"female"`, `"wizard"`, …).
- **Codici stabili** in `errors[0].extensions.code`: `CHARACTER_NAME_INVALID`, `CHARACTER_NAME_TAKEN`, `CHARACTER_AGE_OUT_OF_RANGE`, `CHARACTER_ALREADY_EXISTS`, `STARTING_LOCATION_UNAVAILABLE`, `BAD_USER_INPUT`, `UNAUTHENTICATED`. Il FE mappa i codici, mai i messaggi.
- **Sullo `User` restituito selezionare solo `currentCharacter { id }`** (più, se servono, gli scalari di `currentCharacter.infos`), poi caricare il personaggio completo con `character(id)` come oggi. Il populate è a un solo livello (§7).
- **Un secondo submit** (o un doppio tap) risponde `CHARACTER_ALREADY_EXISTS`: il FE si riallinea con `me` ed entra nella shell.
- **Nessun nome diverge dalla proposta FE** (§11): il BACKEND-NOTES FE resta valido, la fonte diventa questo documento.

---

## 1. Flusso

`{BE}` = base URL del backend (es. `http://localhost:3000`). GraphQL su `{BE}/api/graphql`, REST senza prefisso.

1. **Apertura della pagina di creazione** (`me.currentCharacter == null`): `query { raceTraits { race minAge maxAge } }` una volta. Se fallisce, il campo età resta disabilitato finché non arriva la tabella.
2. **Upload facoltativo del ritratto, al submit:** `POST {BE}/cloudinary/uploadImage` con `Authorization: Bearer <accessToken>`, body `multipart/form-data` con il file nel campo **`file`**. Il BE carica nella cartella Cloudinary `characters_profile` e risponde `{ "url": "<secure_url https>" }`.
   - Attenzione (comportamento storico dell'endpoint, non toccato in questa fase, D-08): in caso di errore Cloudinary la risposta è comunque 2xx con `{ "message": "Failed to upload image", "error": "…" }`. Il FE considera riuscito l'upload **solo se** il body contiene `url`.
   - Senza bearer: 401 JSON `{ statusCode: 401, code: "UNAUTHENTICATED", … }` (pipeline auth Phase 2).
3. **`createCharacter`** con `imagePath = url` dell'upload, oppure con la chiave **omessa** (o `null`/`""`) se non c'è ritratto.
4. **Risposta `User`** → il FE sostituisce l'utente di sessione, poi `character(id: currentCharacter.id)` per il personaggio completo e la subscription `characterUpdated` come oggi.

Errori: upload fallito → nessuna mutation, dati del form conservati. Mutation fallita → errore inline per codice, dati conservati; l'URL già caricato si riusa al retry (gli upload orfani su Cloudinary sono accettati, §9).

---

## 2. Contratto

SDL esatto da `src/schema.gql` (schema ordinato alfabeticamente, `sortSchema: true`):

```graphql
enum ClassType {
  barbarian
  bard
  cleric
  druid
  fighter
  monk
  paladin
  ranger
  rogue
  sorcerer
  warlock
  wizard
}

input CreateCharacterInput {
  age: Int!
  background: String
  classType: ClassType!
  imagePath: String
  name: String!
  pronoun: PronounType!
  race: RaceType!
  sex: SexType!
}

enum PronounType {
  he
  she
  them
}

type RaceTraits {
  maxAge: Int!
  minAge: Int!
  race: RaceType!
}

enum RaceType {
  aarakocra
  dragonborn
  dwarf
  elf
  gnome
  halfelf
  halfling
  human
  tiefling
}

enum SexType {
  female
  male
}

type Mutation {
  createCharacter(input: CreateCharacterInput!): User!   # autenticata
}

type Query {
  raceTraits: [RaceTraits!]!                             # autenticata
}
```

Nota sull'output: `CharacterInfos` (`sex`, `pronoun`, `race`, `classType`) resta `String!` nello schema di lettura per non rompere i consumer esistenti. I valori salvati sono esattamente i nomi degli enum (`"female"`, `"she"`, `"human"`, `"wizard"`), quindi `values.byName` lato Dart continua a funzionare.

### Esempio `createCharacter`

```graphql
mutation CreateCharacter($input: CreateCharacterInput!) {
  createCharacter(input: $input) {
    id
    twitchId
    role
    twitchPoints
    currentCharacter { id }
  }
}
```

Variabili:

```json
{
  "input": {
    "name": "Aria",
    "sex": "female",
    "pronoun": "she",
    "race": "human",
    "classType": "wizard",
    "age": 25,
    "background": "Nata a Drustea.",
    "imagePath": "https://res.cloudinary.com/…/characters_profile/….png"
  }
}
```

Risposta:

```json
{ "data": { "createCharacter": { "id": "…", "twitchId": "…", "role": "adventurer", "twitchPoints": 0, "currentCharacter": { "id": "…" } } } }
```

### Esempio `raceTraits`

```graphql
query RaceTraits { raceTraits { race minAge maxAge } }
```

```json
{ "data": { "raceTraits": [
  { "race": "dragonborn", "minAge": 16, "maxAge": 180 },
  { "race": "elf", "minAge": 100, "maxAge": 9999 },
  { "race": "gnome", "minAge": 16, "maxAge": 60 },
  "…una riga per ogni RaceType (9 in totale)"
] } }
```

L'ordine delle righe segue la dichiarazione dell'enum TS `RaceType`, non l'ordine alfabetico: il FE non deve dipendere dall'ordine.

---

## 3. Regole di validazione (autoritative: il FE le replica solo come UX)

Ordine dei controlli: nome → età → background → immagine (il primo che fallisce determina il codice). Gli enum sono validati prima, da GraphQL.

- **Nome** (`src/characters/creation/character-name.ts`):
  1. normalizzato in **NFC**;
  2. l'apostrofo tipografico `’` diventa `'` (e viene **salvato così**: "D’Arcy" è salvato come "D'Arcy");
  3. trim, spazi interni compressi in uno spazio singolo;
  4. lunghezza **2–20 caratteri** contati in grafemi (stessa unità dei caratteri visibili);
  5. solo lettere Unicode (`\p{L}`), spazio, `'` e `-`, con **almeno una lettera** ("--" è rifiutato);
  6. **unico ignorando maiuscole/minuscole ma NON gli accenti**: `Élan` ed `Elan` convivono, `Élan` ed `ÉLAN` no; "D'Arcy" e "D’Arcy" collidono. L'unicità è garantita dal database (§10), non da un pre-check.
- **Età:** intera, nel range della razza **estremi inclusi** (tabella §6). Fuori range → `CHARACTER_AGE_OUT_OF_RANGE`.
- **Background:** facoltativo; trim; massimo **500 grafemi** (stessa unità del `maxLength` Flutter); assente, `null` o vuoto → salvato come stringa vuota `""` (`infos.background` resta `String!`).
- **imagePath:** facoltativo; trim; assente, `null` o vuoto → salvato come `null`; se presente deve essere un URL **`https`** di al massimo **2048** caratteri.

---

## 4. Codici d'errore

Sempre in `errors[0].extensions.code`. Messaggi copiati dalle factory di `src/characters/creation/character-creation.exception.ts`. In nessun caso d'errore resta un documento parziale (§8).

| code | quando | messaggio (italiano, dal BE) | azione FE suggerita |
|---|---|---|---|
| `CHARACTER_NAME_INVALID` | Nome che non rispetta §3 dopo la normalizzazione | `Nome non valido: da 2 a 20 caratteri tra lettere, spazi, apostrofi e trattini, con almeno una lettera` | Errore inline sul campo nome |
| `CHARACTER_NAME_TAKEN` | Esiste già un personaggio con lo stesso nome ignorando maiuscole/minuscole | `Nome già in uso` | Errore inline sul campo nome |
| `CHARACTER_AGE_OUT_OF_RANGE` | Età fuori dal range della razza | `Età non valida per la razza scelta` | Errore inline sul campo età (di norma impossibile se il campo è limitato da `raceTraits`) |
| `CHARACTER_ALREADY_EXISTS` | L'utente ha già un personaggio (secondo submit, doppio tap, altro device) | `Hai già un personaggio` | Riallinearsi con `me` ed entrare nella shell |
| `STARTING_LOCATION_UNAVAILABLE` | Nessuna città patria per la razza nei dati di gioco (§6) | `Città di partenza non disponibile per la razza scelta` | Errore generico ("riprova più tardi"): sono dati mancanti lato BE, non un errore dell'utente |
| `BAD_USER_INPUT` | (a) dal BE: background troppo lungo o imagePath non valido; (b) nativo GraphQL: enum sconosciuto, tipo errato, campo obbligatorio mancante | (a) `La storia del personaggio può contenere al massimo 500 caratteri` / `L'immagine deve essere un URL https valido`; (b) messaggio **inglese** di graphql-js, da **NON** mostrare | (a) errore inline sul campo; (b) bug lato app: errore generico |
| `UNAUTHENTICATED` | Bearer assente, scaduto o falsificato | (pipeline auth Phase 2) | Refresh single-flight e retry, come per ogni operazione autenticata |

Il body d'errore non contiene mai dettagli Mongo (`E11000`, `keyValue`, indici).

---

## 5. Stato iniziale del personaggio (D-09)

Deciso dal BE, il client non lo invia e non lo calcola:

- `status`: `level` 1, `title` `rookie`, `xp` 0 (quindi `maxActiveSpells` = 0: nessuno slot magia, si sbloccano più avanti per design), `currentLifePoints` 100, `maxLifePoints` 100, `coins` `{ gold: 0, silver: 5, copper: 0 }`, `injuries` `[]`, `spells` `[]`, `location` = POI `markerLocation` della città patria (§6).
- `quests`: `completedQuests` `[]`, `pendingQuest` `null`.
- `assets`: `ownedEquipments` `[]`, `ownedItems` `[]`, `activeSpells` `[]`, `pet` `null`, `wearedEquipment` con **tutti i 9 slot `null`** (`head`, `chest`, `arms`, `legs`, `foots`, `leftHand`, `rightHand`, `firstAccessory`, `secondAccessory`).
- **Nessun equipaggiamento iniziale** (decisione utente).
- `infos`: i valori normalizzati di §3.

---

## 6. Razze: età e città patria

### Età per razza (D-06, da `RACE_TRAITS` in `src/characters/creation/race-traits.ts`)

| race | minAge | maxAge |
|---|---|---|
| human | 16 | 200 |
| elf | 100 | 9999 |
| halfelf | 16 | 130 |
| dwarf | 40 | 140 |
| gnome | 16 | 60 |
| halfling | 16 | 70 |
| dragonborn | 16 | 180 |
| tiefling | 16 | 120 |
| aarakocra | 3 | 40 |

### Città patria (D-10, da `RACE_HOME_CITY_TYPES`)

| race | città patria (`CityType`) |
|---|---|
| elf | `elfCapital` |
| gnome | `motherCapital` |
| dwarf | `motherCapital` |
| tiefling | `motherCapital` |
| halfling | `liberiaCapital` |
| aarakocra | `aarakocraVillage` |
| dragonborn | `mountainVillage` |
| human | a caso tra `drusteaCapital`, `valanCapital`, `mirwaCapital`, `liberiaCapital` |
| halfelf | a caso tra `drusteaCapital`, `valanCapital`, `mirwaCapital`, `liberiaCapital` |

- human e halfelf nascono in una capitale scelta a caso tra quelle **esistenti** a DB.
- Più città dello stesso tipo → una a caso.
- Nessuna città dei tipi previsti → `STARTING_LOCATION_UNAVAILABLE` e nulla viene creato.
- Le patrie **non** sono esposte da `raceTraits` (il FE non ne ha bisogno; aggiungerle in futuro sarebbe additivo).

---

## 7. Selezione raccomandata sullo `User` restituito

`createCharacter` restituisce lo `User` letto con `UsersService.findOne`, che fa il populate di `currentCharacter` **a un solo livello**: il `Character` è presente, ma i suoi riferimenti interni (POI, spell, item) restano id non popolati.

Selezione raccomandata (stessa forma di `me`):

```graphql
createCharacter(input: $input) {
  id
  twitchId
  role
  twitchPoints
  currentCharacter { id }
}
```

Se serve mostrare subito qualcosa, si possono aggiungere gli scalari di `infos`: `currentCharacter { id infos { name sex pronoun race classType age background imagePath } }`.

**NON selezionare** sullo `User` restituito `currentCharacter { status { location { … } } }`, `status { spells { … } }`, `assets { … { item … } }` o `wearedEquipment` con i sotto-campi: il populate è a un livello e quei campi non-null fallirebbero con un errore GraphQL. Il personaggio completo si carica con `character(id)`, come già fa `CharacterCubit.loadCharacter`.

---

## 8. Concorrenza e idempotenza

- **Un solo personaggio per utente**, garantito da una transazione Mongo: prima il claim condizionato dello `User` (`currentCharacter: null` → id pre-generato), poi l'insert del `Character`.
- **Doppio tap / due device:** una chiamata riesce, l'altra riceve `CHARACTER_ALREADY_EXISTS`. Verificato con chiamate concorrenti negli integration test.
- **Nessun documento parziale** in nessun caso d'errore: un nome duplicato annulla anche il claim dello `User`, quindi l'utente può ritentare con un altro nome.
- **Change stream:** il personaggio appena creato **non** emette `characterUpdated` finché non viene modificato (il change stream osserva update/replace, non insert). Il FE carica lo stato iniziale con `character(id)` e poi si iscrive, come oggi.

---

## 9. Limiti noti (by design in questa fase)

- **Nessuna moderazione NSFW** del ritratto, né on-device né server (decisione utente 2026-10-08) → debito BE-HARD (Phase 10, candidata la moderazione AI di Cloudinary).
- **Nessun allowlist dell'host** per `imagePath`: qualsiasi URL `https` passa → BE-HARD.
- **Nessun reset/cancellazione del personaggio.** In dev, per ri-testare la creazione: azzerare `currentCharacter` sullo `User` e cancellare il `Character` a mano in Mongo.
- **Omografi cross-script** (`A` latina vs `А` cirillica) non sono unificati: due nomi visivamente identici possono coesistere.
- **`CHARACTER_NAME_TAKEN` rivela se un nome esiste:** accettato (i nomi dei personaggi sono pubblici); rate limiting in BE-HARD.
- **Upload orfani su Cloudinary** se la mutation fallisce dopo l'upload: accettati per ora.

---

## 10. Note di deploy

- **Indice unico `character_name_ci_unique`** su `characters.infos.name` con collation `{ locale: 'en', strength: 2 }` (ignora maiuscole, non accenti). Viene costruito al boot da `CharacterNameIndexVerifier`. Se a DB esistono nomi legacy che collidono ignorando le maiuscole, il boot **prosegue** con un log ERROR e l'unicità **non è garantita** finché i personaggi in collisione non vengono rinominati e il servizio riavviato.
- **`StartingCitiesReporter`** logga un WARN al boot per ogni razza senza città patria: finché la città non viene caricata, `createCharacter` risponde `STARTING_LOCATION_UNAVAILABLE` per quella razza.
- **Le transazioni richiedono il replica set** (già necessario per il change stream delle subscription): nessun nuovo requisito infrastrutturale.
- **Nessuna nuova variabile d'ambiente.**
- `src/schema.gql` è rigenerato e committato; la modifica è **solo additiva** (nuovi enum, input, type e due campi: nessun contratto esistente cambia).

---

## 11. Impatto sul FE e divergenze dalla proposta

Confronto con `Klimmeck-Guide/.planning/phases/02-character-creation/BACKEND-NOTES.md` (proposta FE del 2026-10-08), nome per nome:

| elemento | proposta FE | BE finale | esito |
|---|---|---|---|
| mutation | `createCharacter(input: CreateCharacterInput!): User!` | identico | ✔ |
| input | `CreateCharacterInput` | identico | ✔ |
| campi input | `name`, `sex`, `pronoun`, `race`, `classType`, `age`, `background`, `imagePath` | identici (8 campi, nessun campo di identità) | ✔ |
| tipi campi | `SexType!`, `PronounType!`, `RaceType!`, `ClassType!`, `Int!`, `String`, `String` | identici, enum GraphQL registrati | ✔ |
| type | `RaceTraits { race minAge maxAge }` | identico | ✔ |
| query | `raceTraits: [RaceTraits!]!` | identica | ✔ |
| codici | `CHARACTER_NAME_INVALID`, `CHARACTER_NAME_TAKEN`, `CHARACTER_AGE_OUT_OF_RANGE`, `CHARACTER_ALREADY_EXISTS`, `STARTING_LOCATION_UNAVAILABLE`, "generico di validazione" | identici; il generico è `BAD_USER_INPUT` | ✔ |
| tabella età | 9 razze, tabella lore | identica | ✔ |
| stato iniziale e patrie | D-09/D-10 | identici | ✔ |

**Nessuna divergenza di nomi:** il BACKEND-NOTES FE resta valido e non è stato modificato; da ora la fonte per il FE è questo documento (e, sopra tutto, `src/schema.gql`).

Precisazioni rispetto alla proposta FE (non divergenze, ma dettagli da recepire):

1. **`background` vuoto → `""`** (domanda aperta 1 risolta, D-07).
2. **Enum GraphQL nell'input** (domanda aperta 2, D-02): inviare i valori via variabili; in lettura `CharacterInfos` resta `String!` con gli stessi nomi.
3. **Patrie non esposte** da `raceTraits` (domanda aperta 3, D-11).
4. **Nome:** `’` → `'` salvato così; almeno una lettera; unicità case-insensitive ma sensibile agli accenti (§3).
5. **Lunghezze in grafemi** sia per il nome sia per il background (allineate al conteggio Flutter).
6. **Sullo `User` restituito:** selezionare `currentCharacter { id }` (+ eventuali scalari di `infos`), non l'intero personaggio (§7). La proposta FE diceva "`currentCharacter { id … }`": il "…" va limitato a `infos`.
7. **`BAD_USER_INPUT` nativo** di GraphQL ha messaggio inglese: non mostrarlo (§4).
8. **Upload:** considerare riuscito l'upload solo se il body contiene `url` (§1.2).
