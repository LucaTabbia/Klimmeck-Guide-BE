---
status: testing
phase: 03-autorizzazione-ownership-ruoli-audit
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-08-SUMMARY.md, 03-09-SUMMARY.md, 03-10-SUMMARY.md
started: 2026-10-14T12:44:37Z
updated: 2026-10-14T12:44:37Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Ferma ogni istanza del BE. Con Mongo in replica set (rs0) e Redis attivi, avvia da zero con `yarn start:dev` (DEV_AUTH_ENABLED=true, DEV_AUTH_ROLE=adventurer). Il boot termina senza errori né warning di DI; una query `{ me { id twitchId role } }` su /api/graphql con `Authorization: Bearer <DEV_AUTH_ACCESS_TOKEN>` restituisce l'utente stub. In mongosh `db.admin_audit_logs.getIndexes()` mostra l'indice `{ at: 1 }` con `expireAfterSeconds: 7776000`.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Ferma ogni istanza del BE. Con Mongo in replica set (rs0) e Redis attivi, avvia da zero con `yarn start:dev` (DEV_AUTH_ENABLED=true, DEV_AUTH_ROLE=adventurer). Il boot termina senza errori né warning di DI; una query `{ me { id twitchId role } }` su /api/graphql con `Authorization: Bearer <DEV_AUTH_ACCESS_TOKEN>` restituisce l'utente stub. In mongosh `db.admin_audit_logs.getIndexes()` mostra l'indice `{ at: 1 }` con `expireAfterSeconds: 7776000`.
result: [pending]

### 2. userUpdated: snapshot immediato al subscribe
expected: Su WS (graphql-ws, `connection_init` con `{ Authorization: "Bearer <token>" }`) la subscription `subscription { userUpdated { id twitchPoints role currentCharacter { id } } }` non accetta argomenti ed emette SUBITO, senza alcuna scrittura a DB, lo snapshot dello User del bearer (stessa forma di `me`, `currentCharacter` popolato). Chiudendo e riaprendo la subscription arriva un nuovo snapshot.
result: [pending]

### 3. userUpdated: eventi live solo per il proprio utente
expected: Con la subscription aperta, in mongosh `db.users.updateOne({ twitchId: "<DEV_AUTH_TWITCH_ID>" }, { $set: { twitchPoints: 4242 } })` fa arrivare un evento con `twitchPoints: 4242` (idem cambiando `role`). Aggiornando un ALTRO utente (`db.users.updateOne({ twitchId: "altro" }, ...)`) non arriva nulla.
result: [pending]

### 4. characterUpdated: snapshot e live per il proprietario
expected: `subscription { characterUpdated(id: "<id del proprio currentCharacter>") { id status { xp } } }` emette subito lo snapshot del personaggio; poi `db.characters.updateOne({ _id: ObjectId("<id>") }, { $set: { "status.xp": 25000 } })` fa arrivare un evento live con `status.xp: 25000`.
result: [pending]

### 5. characterUpdated: personaggio altrui o inesistente
expected: Come adventurer, `characterUpdated(id: "<id di un personaggio di un altro utente>")` (crealo in mongosh con un secondo user/character) risponde con un messaggio `next` contenente `errors[0].message = "Questo personaggio non ti appartiene"` ed `extensions` ESATTAMENTE `{ code: "FORBIDDEN" }`, seguito da `complete`; nessuno snapshot, nessun evento, la connessione WS resta aperta. Con un id inesistente (`64b0000000000000000000ff`) o malformato (`abc`): stesso schema con `{ code: "NOT_FOUND" }` e messaggio "Personaggio non trovato".
result: [pending]

### 6. Ownership sulle mutation e query del personaggio
expected: Come adventurer, le 5 mutation `doTransaction`/`equipItem`/`equipSpell`/`unequipSpell`/`useSpell` con il `characterId` di un altro utente rispondono `errors[0].extensions = { code: "FORBIDDEN" }` ("Questo personaggio non ti appartiene") e il documento a DB è INVARIATO; con il proprio `characterId` funzionano come prima. `character(id)` ed `equipment(id)` altrui → FORBIDDEN; id inesistente → `{ code: "NOT_FOUND" }` "Personaggio non trovato", mai un `INTERNAL_SERVER_ERROR` né testo Mongoose.
result: [pending]

### 7. Query riservate al locandiere
expected: Come adventurer, `users`, `user(id)`, `characters` e `pendingQuests` rispondono tutte `{ code: "FORBIDDEN" }` con messaggio "Operazione riservata al locandiere" e `data: null`. Riavviando il BE con `DEV_AUTH_ROLE=innkeeper` le stesse 4 query restituiscono i dati; `user(id)` con id inesistente → `{ code: "NOT_FOUND" }` "Utente non trovato".
result: [pending]

### 8. CRUD utenti rimosso dallo schema
expected: Nel playground (o via introspezione) `createUser`, `updateUser`, `deleteUser` e l'input `UserInput` non esistono più: `mutation { createUser(...) }` fallisce in validazione GraphQL con "Cannot query field \"createUser\" on type \"Mutation\"", per qualsiasi ruolo. Nessun client può quindi scrivere `role` o `twitchPoints`.
result: [pending]

### 9. Ownership della pending quest
expected: Come adventurer, `pendingQuest(id)` con l'id di `quests.pendingQuest` del PROPRIO personaggio restituisce la missione; con l'id di una pending quest di un altro personaggio → `{ code: "FORBIDDEN" }` "Questa missione non ti appartiene"; con id inesistente o malformato → `{ code: "NOT_FOUND" }` "Missione in attesa non trovata". Come innkeeper, qualunque pending quest esistente è leggibile.
result: [pending]

### 10. Innkeeper on-behalf e audit log persistente
expected: Come innkeeper (`DEV_AUTH_ROLE=innkeeper`), una mutation del personaggio (es. `useSpell`) sul `characterId` di un ALTRO utente va a buon fine e in mongosh `db.admin_audit_logs.find().sort({ at: -1 }).limit(1)` mostra un record con `actor { userId, twitchId, role: "innkeeper" }`, `action: "useSpell"`, `target { type: "character", id }`, gli `args` completi della mutation, `outcome: "ok"` e `at`. Lo stesso innkeeper sul PROPRIO personaggio non produce alcun record; un tentativo FORBIDDEN dell'adventurer non produce alcun record; se la mutation fallisce (es. spell inesistente) il record esiste con `outcome` uguale al codice d'errore (es. "NOT_FOUND"). Lo schema GraphQL non espone alcun tipo `AdminAuditLog`.
result: [pending]

## Summary

total: 10
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 0

## Gaps

[none yet]
