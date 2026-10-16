# BACKEND-NOTES — Phase 3.1 Character Deletion Contract (handoff per il FE)

- **Fase BE:** 03.1-character-deletion-contract (requisiti BE-CHAR-06, BE-CHAR-07, BE-CHAR-08, BE-CHAR-09; decisioni D-01..D-16 in `03.1-CONTEXT.md`)
- **Data:** 2026-10-16 — documento finale di fine fase
- **Branch:** `feat/03.1-character-deletion-contract` (PR verso `develop`; **la PR BE va merge-ata prima della PR FE Phase 4**, D-16)
- **Schema:** `src/schema.gql` verificato al commit `eff8485` (ultimo commit che lo modifica; rigenerato dal boot reale in `test/app.int-spec.ts`, nessun drift). **Lo schema vince su questo documento.**
- **Stato:** contratto implementato, montato in `AppModule` (`CharacterDeletionModule`, subito dopo `CharacterCreationModule`) e coperto da integration test sul replica set (13 test sul wire per `deleteCharacter`, incluso il test con tre chiamate concorrenti; visibilità degli archiviati, real-time e job in spec dedicate).
- **Richiesta FE di riferimento:** `Klimmeck-Guide/.planning/phases/04-settings-screen/BACKEND-NOTES.md` (domande aperte 1–4 chiuse in §7).
- **Consumatori:** FE Phase 4 (SET-05, voce "Elimina personaggio" nel tab Impostazioni); BE Phase 5 (solo informativo), BE Phase 7/8 (filtro attivo), BE Phase 9 (morte: riuso della routine di archivio).
- **Fonte:** ogni nome qui sotto (operazioni, codici, messaggi, indici, export) è copiato dal codice: `src/schema.gql`, `src/characters/deletion/**`, `src/models/character/active-character.filter.ts`, `src/characters/character-changes.pipeline.ts`, `src/characters/creation/character-name-index.verifier.ts`.

---

## 0. TL;DR per il FE

1. **`mutation { deleteCharacter { ...UserFields } }` senza argomenti.** Identità solo dal bearer: agisce sul `currentCharacter` del chiamante. Qualsiasi argomento → `GRAPHQL_VALIDATION_FAILED`.
2. **Restituisce lo `User` aggiornato con `currentCharacter: null`** (stessa forma di `me` / `createCharacter`): il FE lo adotta subito, senza un secondo round trip.
3. **`CHARACTER_NOT_FOUND`** = il chiamante non ha (più) un personaggio corrente (doppio tap, chiamata concorrente perdente, stato stantio): il FE si riallinea con `me`, non mostra un errore bloccante.
4. **Il nome è riutilizzabile subito:** `createCharacter` con lo stesso nome del personaggio appena eliminato riesce.
5. **`userUpdated` emette lo scollegamento** (`currentCharacter: null`) come backup della risposta della mutation.
6. **I `characterUpdated` già aperti sul vecchio id diventano silenziosi ma NON vengono chiusi dal server:** il FE li chiude all'unmount della shell di gioco (comportamento FE Phase 3 D-08 già previsto). Una nuova subscribe su quell'id riceve `NOT_FOUND` + `complete`.
7. **`twitchPoints` invariati**, nessun cooldown sulla ricreazione.

---

## 1. Flusso

1. Tab **Impostazioni** → sezione **Account** → "Elimina personaggio" → dialog di conferma.
2. `deleteCharacter` con il bearer di sessione.
3. Risposta `User` con `currentCharacter: null` → `AuthCubit.adoptUser(user)` → la shell chiavata per `characterId` viene smontata (la subscription `characterUpdated` del vecchio id si chiude lato client).
4. `SessionHome` porta alla **pagina di creazione**.
5. `createCharacter` (anche con lo **stesso nome** del personaggio archiviato) → `User` con il nuovo `currentCharacter { id }` → **shell di gioco**.

Backup: se la risposta si perde, `userUpdated` (snapshot su subscribe + evento live) porta lo stesso `currentCharacter: null`. Il FE **non** controlla viaggi o quest attivi prima di chiamare la mutation (§7, risposta 1).

---

## 2. Contratto

SDL verbatim da `src/schema.gql` (commit `eff8485`). Riga aggiunta dentro `type Mutation` (unica modifica allo schema in questa fase, solo additiva):

```graphql
type Mutation {
  ...
  deleteCharacter: User!
  ...
}
```

Tipo restituito (invariato):

```graphql
type User {
  currentCharacter: Character
  id: ID!
  role: RoleType!
  twitchId: String!
  twitchPoints: Int!
}
```

`deletedAt`, `deletionReason` e l'enum `DeletionReason` **non** compaiono nello schema (il test di boot reale lo verifica).

### Esempio

Richiesta (fragment `UserFields` = `id twitchId twitchPoints role currentCharacter { id }`):

```graphql
mutation DeleteCharacter {
  deleteCharacter {
    id
    twitchId
    twitchPoints
    role
    currentCharacter { id }
  }
}
```

Successo:

```json
{
  "data": {
    "deleteCharacter": {
      "id": "6703f0c2a1b2c3d4e5f60718",
      "twitchId": "123456789",
      "twitchPoints": 1500,
      "role": "adventurer",
      "currentCharacter": null
    }
  }
}
```

Errore (nessun personaggio corrente):

```json
{"errors":[{"message":"Non hai un personaggio da eliminare","path":["deleteCharacter"],"extensions":{"code":"CHARACTER_NOT_FOUND"}}],"data":null}
```

`errors[0].extensions` è **esattamente** `{ "code": "CHARACTER_NOT_FOUND" }` (niente `stacktrace`, niente `originalError`). `data` è `null` perché il campo è non-null.

| Caso | Risposta |
|---|---|
| Chiamante con `currentCharacter` valorizzato | `User` con `currentCharacter: null`; `Character` archiviato (`deletedAt`, `deletionReason: user_request`) |
| Chiamante senza `currentCharacter` (doppio tap, già eliminato, mai creato) | `CHARACTER_NOT_FOUND`, nulla viene scritto |
| N chiamate concorrenti dello stesso utente | esattamente un archivio; le N−1 perdenti ricevono `CHARACTER_NOT_FOUND` |
| Bearer assente/invalido | `UNAUTHENTICATED` |
| Bearer valido di uno User cancellato da DB | `UNAUTHENTICATED` |
| Qualsiasi argomento (es. `deleteCharacter(id: "…")`) | `GRAPHQL_VALIDATION_FAILED` |

---

## 3. Codici d'errore

**Il FE mappa il codice, mai il messaggio.** I messaggi (italiano) servono solo per log/diagnostica.

| Codice | Dove | Quando | Messaggio |
|---|---|---|---|
| `CHARACTER_NOT_FOUND` | `deleteCharacter` | il chiamante non ha un personaggio corrente: doppio tap, perdente di chiamate concorrenti, stato stantio | `Non hai un personaggio da eliminare` |
| `UNAUTHENTICATED` | `deleteCharacter` | bearer assente/invalido (pipeline Phase 2) oppure bearer valido di uno User che non esiste più | pipeline auth |
| `GRAPHQL_VALIDATION_FAILED` | `deleteCharacter` | argomenti non previsti | validazione GraphQL nativa (inglese, non mostrare) |
| `NOT_FOUND` | `character(id)`, `equipment(id)`, `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`, subscribe `characterUpdated(id)` | l'id è di un personaggio **archiviato**: risposta identica a un id inesistente, **per ogni ruolo** (ex proprietario, altro adventurer, innkeeper). Nessun oracolo di esistenza `FORBIDDEN`/`NOT_FOUND` | `Personaggio non trovato` |

Sul WS il rifiuto alla subscribe ha la stessa forma della Phase 3: `next` con `errors` (`extensions.code = NOT_FOUND`), poi `complete`. Il FE **non ritenta** e non lo conta come sync degradata.

---

## 4. Semantica dell'archivio

- **Soft delete, mai purge.** Il documento `Character` resta nella collection `characters`; non esiste cancellazione fisica.
- **Campi di archivio solo a DB:** `deletedAt: Date` e `deletionReason` (`user_request` oggi; `death` riservato alla Phase 9). Default `null` su ogni nuovo documento; i documenti legacy senza il campo valgono come attivi. **Non esposti in GraphQL.**
- **Nient'altro cambia sul documento archiviato:** nome (`infos.name`), status, quests (incluso `quests.pendingQuest`), assets, equipaggiamento restano leggibili a DB per audit e meccaniche future.
- **Nome liberato** dall'indice unico parziale `character_name_active_ci_unique` su `infos.name` (collation `{ locale: 'en', strength: 2 }`, `partialFilterExpression: { deletedAt: null }`): l'unicità case-insensitive vale solo tra personaggi attivi. Il filtro `{ deletedAt: null }` copre anche i documenti legacy privi del campo, quindi **nessun backfill**. `CHARACTER_NAME_TAKEN` di `createCharacter` resta invariato tra attivi.
- **`twitchPoints` invariati** (stanno sullo `User`).
- **Nessun record in `admin_audit_logs`:** non è un'azione admin; `deletedAt` + `deletionReason` sono la traccia.
- **Lista innkeeper `characters`:** esclude gli archiviati. Nessun argomento `includeArchived`: rinviato alla Phase 9/10 insieme a un eventuale campo `deletedAt` esposto in GraphQL.
- **Subscription già aperte:** una `characterUpdated` aperta sull'id prima dell'archivio **resta aperta ma silenziosa**: il server non la completa. Il FE la chiude all'unmount della shell.
- **Riferimento pendente:** se lo `User` punta a un personaggio inesistente o già archiviato, `deleteCharacter` lo **scollega comunque** (risposta di successo, `currentCharacter: null`), non tocca il documento archiviato e logga un `warn` con il solo id utente. Così l'utente non resta bloccato (né creare né eliminare).

---

## 5. Real-time

| Evento | `userUpdated` | `characterUpdated(id)` |
|---|---|---|
| `deleteCharacter` riuscita | emette lo `User` con `currentCharacter: null` (change stream `users` esistente, **nessun publish aggiunto**) | **nessuna emissione**, nemmeno per l'update di archivio stesso, per nessun ruolo (innkeeper incluso) |
| Scritture successive sul documento archiviato (es. job in ritardo) | — | nessuna emissione |
| Nuova subscribe su un id archiviato | — | `NOT_FOUND`, poi `complete` |
| `createCharacter` successiva | emette con il nuovo `currentCharacter { id }` | il FE apre la subscription sul nuovo id |

Meccanismo: il change stream `characters` usa `CHARACTER_CHANGES_PIPELINE` con `$match` su `operationType: { $in: ['update', 'replace'] }` e `'fullDocument.deletedAt': null` (con `fullDocument: 'updateLookup'` l'update di archivio ha già `deletedAt` valorizzato e viene scartato). La race "archiviato tra l'evento e la rilettura" è uno skip silenzioso, non un errore.

---

## 6. Concorrenza e idempotenza

Una sola transazione Mongo (replica set), inverso del claim di `createCharacter`:

1. `findOneAndUpdate({ _id: userId, currentCharacter: { $ne: null } }, { $set: { currentCharacter: null } }, { returnDocument: 'before' })` — scollega lo User e cattura l'id precedente;
2. `updateOne(activeCharacterById(prev), { $set: { deletedAt, deletionReason } })` — archivia solo se ancora attivo.

Se il claim non trova un personaggio → `CHARACTER_NOT_FOUND` (o `UNAUTHENTICATED` se lo User non esiste), nulla viene scritto. Il driver ritenta i `WriteConflict`: con N chiamate concorrenti dello stesso utente **esattamente una** archivia, le altre N−1 ricevono `CHARACTER_NOT_FOUND` (testato con tre chiamate parallele). Lo stato finale è idempotente: `currentCharacter: null`, un solo documento archiviato. Lo `User` restituito è riletto dopo il commit.

---

## 7. Risposte alle domande aperte del FE

1. **Viaggio/quest in corso:** si archivia **comunque**, nessun codice di rifiuto dedicato. Oggi non esiste `activeTravel`; `quests.pendingQuest` resta sul documento archiviato (testato). Le Phase 7 (quest) e 8 (viaggi) trattano gli archiviati come assenti tramite il filtro attivo (§8).
2. **Riferimenti incrociati:** il documento archiviato resta referenziabile per id **solo internamente** (a DB). Nessun resolver né job lo "resuscita": ogni percorso di gioco legge con il filtro attivo (`character`, `equipment`, le 5 mutation sotto ownership, la policy di ownership, la lista innkeeper, il change stream, il processor `SpellRecoveryProcessor`, che salta gli archiviati con un `warn` contenente solo l'id). Le fasi future devono rispettare la stessa regola (§8).
3. **Cooldown o limite di ricreazione:** nessuno in v1. Il nome archiviato è riutilizzabile subito, da chiunque (squatting del nome accettato by design, D-11).
4. **Punti canale:** `twitchPoints` è sullo `User` e la cancellazione **non** lo tocca; il FE li mostra invariati.

---

## 8. Note per le fasi BE successive

- **Phase 5 (notifiche):** nessun lavoro BE per le preferenze: i toggle restano solo sul device (FE §4). Il contratto Phase 5 deve inviare **data message** con il tipo dell'evento (`travelEnd` / `streamerLive` / `questEnd`) oltre all'id, così il background handler FE applica la preferenza anche ad app uccisa.
- **Phase 7/8 (quest, viaggi):** ogni job Bull e ogni resolver che legge `characters` usa `ACTIVE_CHARACTER_FILTER` / `activeCharacterById(id)` da `src/models/character/active-character.filter.ts` — **mai `findById`** su `characterModel`. Un job accodato prima dell'archivio deve trovare "nessun personaggio" e uscire con un `warn` (modello: `SpellRecoveryProcessor`).
- **Phase 9 (morte):** riusare `CharacterDeletionService.archiveCurrentCharacter(userId, DeletionReason.death)` (pubblico, esportato da `CharacterDeletionModule`): stessa transazione, stesso scollegamento, stesse garanzie di concorrenza e real-time. Delete/restore admin di personaggi altrui restano Phase 9/10, con `@Roles(innkeeper)` + audit in `admin_audit_logs`; eventuale `includeArchived` sulla lista innkeeper e `deletedAt` in GraphQL insieme.

---

## 9. Note di deploy

- **Migrazione dell'indice al primo boot:** `CharacterNameIndexVerifier` costruisce prima `character_name_active_ci_unique`, poi (solo se la costruzione è riuscita) elimina una volta il legacy `character_name_ci_unique`. Log atteso: `Dropped legacy index character_name_ci_unique: archived character names are reusable`. Ai boot successivi l'indice legacy è già assente (`IndexNotFound`, code 27, tollerato in silenzio). Il verifier **non lancia mai**: il boot non si blocca.
- **Privilegio richiesto:** l'utente Mongo di produzione deve avere il privilegio **`dropIndex`** sulla collection `characters`. Senza: l'app parte comunque, logga un errore, e **i nomi archiviati restano riservati** finché non si esegue a mano `db.characters.dropIndex('character_name_ci_unique')`.
- **Nessun backfill:** i documenti esistenti senza `deletedAt` valgono attivi e restano protetti dal nuovo indice.
- **Transazioni:** richiedono il replica set, già necessario: nessun nuovo requisito infrastrutturale.
- **Nessuna nuova variabile d'ambiente.**
- `src/schema.gql` rigenerato e committato; modifica **solo additiva** (una riga in `type Mutation`).

---

## 10. Impatto sul FE e divergenze dalla proposta

Confronto con `Klimmeck-Guide/.planning/phases/04-settings-screen/BACKEND-NOTES.md` (proposta FE del 2026-10-15):

| elemento | proposta FE | BE finale | esito |
|---|---|---|---|
| mutation | `deleteCharacter: User!` senza argomenti | identica | ✔ |
| codice | `CHARACTER_NOT_FOUND` | identico | ✔ |
| auth | `UNAUTHENTICATED` | identico (anche per User cancellato) | ✔ |
| real-time | `userUpdated` con `currentCharacter: null`, nessun `characterUpdated` per archiviati | identico | ✔ |
| nome riutilizzabile | sì | sì (indice parziale) | ✔ |

**Nessuna divergenza di nomi:** il BACKEND-NOTES FE resta valido e **non è stato modificato**; da ora la fonte per il FE è questo documento (e, sopra tutto, `src/schema.gql`).

Precisazioni (nessun impatto sul wire):

1. **Claim:** la proposta FE descriveva il filtro `currentCharacter: <id>`; il BE usa `currentCharacter: { $ne: null }` con `returnDocument: 'before'` (l'id non serve in input). Comportamento osservabile identico.
2. **Subscribe su id archiviato:** rifiuto con `NOT_FOUND` (non `FORBIDDEN`), per ogni ruolo: un archiviato è indistinguibile da un id inesistente.
3. **Subscription già aperte:** silenziose, non completate dal server (§4): la chiusura è a carico del FE all'unmount.
4. **Lista innkeeper:** esclude gli archiviati, senza flag (la proposta lasciava la scelta al BE).

---

## 11. Checklist di verifica per il FE

- [ ] Documenti GraphQL verificati con `tool/schema_check` contro `Klimmeck-Guide-BE/src/schema.gql` rigenerato da questa fase (commit `eff8485` o successivo).
- [ ] `CHARACTER_NOT_FOUND` mappato a "riallineati con `me`", non a un errore bloccante.
- [ ] Subscription `characterUpdated` del vecchio id chiusa all'unmount della shell.
- [ ] E2E manuale su device: elimina → pagina di creazione → nuovo personaggio **con lo stesso nome** → shell di gioco.
- [ ] **PR BE 03.1 merge-ata su `develop` prima della PR FE Phase 4.**
