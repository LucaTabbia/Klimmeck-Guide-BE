# BACKEND-NOTES — Phase 3 Autorizzazione: Ownership, Ruoli, Audit (handoff BE → FE)

- **Fase BE:** 03-autorizzazione-ownership-ruoli-audit — requisiti BE-AUTHZ-01, BE-AUTHZ-02, BE-AUTHZ-03, BE-AUTHZ-04, BE-SYNC-01, BE-SYNC-02 (decisioni D-01..D-19 in `03-CONTEXT.md`)
- **Data:** 2026-10-14 — documento finale di fine fase
- **Branch:** `feat/03-autorizzazione-ownership-ruoli-audit` (PR verso `develop`; la PR BE precede la PR FE, D-07)
- **Schema:** `src/schema.gql` verificato al commit `298ed4b` (ultimo commit che lo modifica; rigenerato dal boot reale a fine fase senza drift). **Lo schema vince su questo documento.**
- **Richiesta FE di riferimento:** `Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/BACKEND-NOTES.md` (domande aperte 1–5 chiuse in §4).
- **Consumatori FE:** FE Phase 3 (sync real-time), FE Phase 6/8 (mutation giocatore sotto ownership), FE Phase 10 (admin: `@Roles`, audit).

---

## 0. TL;DR per il FE

1. **Nuova subscription `userUpdated: User!` senza argomenti.** Identità dal bearer del `connection_init`; emette lo `User` dell'utente autenticato (con `currentCharacter` popolato, stessa forma di `me`) a ogni update del documento `users` (`twitchPoints`, `role`, `currentCharacter`). Un client non può ascoltare un altro utente.
2. **Snapshot su subscribe** per `userUpdated` e `characterUpdated`: il primo evento di ogni (ri)sottoscrizione è il documento corrente, emesso **solo dopo** il controllo d'identità; poi gli eventi live. Nessun replay: al reconnect il FE ri-sottoscrive e lo snapshot chiude il gap.
3. **`characterUpdated(id: String!): Character!` invariata nel contratto.** Bearer non `innkeeper` su un id che non è il suo `currentCharacter` → rifiuto alla subscribe con `FORBIDDEN` (`next` con `errors`, poi `complete`). L'innkeeper può ascoltare qualunque personaggio. Ogni evento live è ri-filtrato per proprietà (fail-closed).
4. **Ownership** (owner o innkeeper, altrimenti `FORBIDDEN`) su: `doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`, `character(id)`, `equipment(id)`, `pendingQuest(id)`. Firme GraphQL invariate.
5. **Innkeeper-only** (`FORBIDDEN` per `adventurer` e `guard`): `users`, `user(id)`, `characters`, `pendingQuests`.
6. **Rimosse dallo schema:** `createUser`, `updateUser`, `deleteUser` e `input UserInput` (il FE non le usava; nessun client può più scrivere `role` o `twitchPoints`).
7. **Codici d'errore stabili:** `FORBIDDEN` (nuovo) e `NOT_FOUND` (ora tipizzato sui percorsi protetti). Il FE mappa il codice, mai il messaggio.
8. **Audit admin** nella collection Mongo `admin_audit_logs` (TTL 90 giorni): automatico su ogni mutation `@Roles(innkeeper)` e su ogni mutation dell'innkeeper su un personaggio altrui. **Nessuna query GraphQL** di lettura (nessun tipo nello schema).

---

## 1. Schema (verbatim da `src/schema.gql`, commit `298ed4b`)

Subscription:

```graphql
type Subscription {
  characterUpdated(id: String!): Character!
  userUpdated: User!
}
```

Query protette (estratto di `type Query`):

```graphql
  character(id: String!): Character!
  characters: [Character!]!
  equipment(id: String!): Equipment!
  pendingQuest(id: String!): PendingQuest!
  pendingQuests: [PendingQuest!]!
  user(id: String!): User!
  users: [User!]!
```

Mutation giocatore (estratto di `type Mutation`, firme invariate, ora sotto ownership):

```graphql
  doTransaction(request: TransactionRequest!): CommonResponse!
  equipItem(request: EquipItemRequest!): CommonResponse!
  equipSpell(request: EquipSpellRequest!): CommonResponse!
  unequipSpell(request: EquipSpellRequest!): CommonResponse!
  useSpell(request: UseSpellRequest!): CommonResponse!
```

Il blocco `type Mutation` completo contiene ora solo: `createCharacter`, `doTransaction`, `equipItem`, `equipSpell`, `exchangeLoginTicket`, `logout`, `refreshSession`, `unequipSpell`, `useSpell`.

| Operazione | Chi può | Id su cui si applica la regola |
|---|---|---|
| `characterUpdated(id)` | proprietario, innkeeper | `id` |
| `character(id)`, `equipment(id)` | proprietario, innkeeper | `id` |
| `doTransaction(request)` | proprietario, innkeeper | `request.id` |
| `equipItem(request)`, `equipSpell(request)`, `unequipSpell(request)` | proprietario, innkeeper | id del personaggio nella request |
| `useSpell(request)` | proprietario, innkeeper | `request.characterId` |
| `pendingQuest(id)` | il bearer il cui personaggio ha `quests.pendingQuest = id`, innkeeper | `id` |
| `users`, `user(id)`, `characters`, `pendingQuests` | solo innkeeper | — |
| `userUpdated` | ogni autenticato, solo sul proprio User | identità del bearer |

"Proprietario" significa: l'id è il `currentCharacter` del bearer, letto a ogni operazione (non dal JWT), quindi il cambio di personaggio ha effetto immediato.

Selezione FE consigliata per lo user stream (fragment `UserFields` esistente):

```graphql
subscription OnUserChanged { userUpdated { id twitchId twitchPoints role currentCharacter { id } } }
```

### Comportamento

| Evento | `userUpdated` | `characterUpdated(id)` |
|---|---|---|
| Apertura/riapertura della subscription | snapshot immediato dello User | snapshot immediato del Character (proprietario o innkeeper) |
| Subscribe su id altrui (non innkeeper) | — | `FORBIDDEN`, poi `complete`; nessuno snapshot, nessun evento |
| Subscribe su id inesistente o malformato | — | `NOT_FOUND`, poi `complete` (anche per l'innkeeper) |
| Accredito punti canale (BE Phase 6) | emette con `twitchPoints` aggiornato | — |
| Cambio ruolo (manuale a DB) | emette con `role` aggiornato | — |
| `createCharacter` | emette con `currentCharacter { id }` | il FE apre poi la subscription sul nuovo id |
| Cancellazione / morte (fasi future) | emette con `currentCharacter: null` | nessuna emissione (delete non è nel change stream) |
| Qualsiasi update del character | — | documento completo |
| `currentCharacter` cambia a stream aperto (non innkeeper) | emette il nuovo User | gli eventi successivi del vecchio personaggio non arrivano più (filtro per evento) |
| Login che non cambia nulla (upsert no-op) | nessuna emissione | — |

### Autenticazione WS

Invariata rispetto alla Phase 2: `connection_init` `{ "Authorization": "Bearer <jwt>" }`, close 4403 al connect su token assente/invalido, 4401 alla scadenza. Lo snapshot su subscribe chiude il gap di riconnessione.

---

## 2. Forme sul wire (verificate dai test)

### WS (graphql-transport-ws): rifiuto alla subscribe

Non innkeeper che sottoscrive `characterUpdated` con l'id di un personaggio altrui: un messaggio `next` con `errors`, poi `complete`. **Nessun messaggio `error`**, nessuno snapshot.

```json
{ "type": "next", "payload": { "errors": [{ "message": "Questo personaggio non ti appartiene", "path": ["characterUpdated"], "extensions": { "code": "FORBIDDEN" } }] } }
{ "type": "complete" }
```

Id inesistente o malformato (qualunque ruolo, innkeeper compreso): forma identica, codice `NOT_FOUND`.

```json
{ "type": "next", "payload": { "errors": [{ "message": "Personaggio non trovato", "path": ["characterUpdated"], "extensions": { "code": "NOT_FOUND" } }] } }
{ "type": "complete" }
```

### HTTP GraphQL

`errors[0].extensions` è **esattamente** `{ "code": "FORBIDDEN" }` oppure `{ "code": "NOT_FOUND" }`: niente `originalError`, niente `stacktrace`, niente `status`.

```json
{ "data": null, "errors": [{ "message": "Operazione riservata al locandiere", "path": ["users"], "extensions": { "code": "FORBIDDEN" } }] }
```

Messaggi definitivi (italiano, solo per log/diagnostica):

| Codice | Messaggio | Quando |
|---|---|---|
| `FORBIDDEN` | `Questo personaggio non ti appartiene` | ownership del personaggio violata |
| `FORBIDDEN` | `Questa missione non ti appartiene` | `pendingQuest(id)` non del proprio personaggio |
| `FORBIDDEN` | `Operazione riservata al locandiere` | operazione innkeeper-only chiamata da `adventurer`/`guard` |
| `NOT_FOUND` | `Personaggio non trovato` | id personaggio inesistente o malformato |
| `NOT_FOUND` | `Missione in attesa non trovata` | id pending quest inesistente o malformato |
| `NOT_FOUND` | `Utente non trovato` | `user(id)` su id inesistente (innkeeper) |
| `NOT_FOUND` | `Magia non trovata` | `useSpell` su una magia inesistente |
| `NOT_FOUND` | `Magia non attiva per questo personaggio` | `unequipSpell` su una magia non attiva |

**Regola: il FE mappa il codice, mai il messaggio.** I messaggi possono cambiare senza preavviso.

### Comportamento richiesto al FE

- **NON ritentare** una subscription chiusa con `FORBIDDEN` o `NOT_FOUND`: il backoff silenzioso di FE D-14 diventerebbe un loop di subscribe rifiutate. La condizione è terminale per quell'id.
- **NON contarla come sync degradata** nel watchdog dei 3 minuti di FE D-15: uno stream chiuso per autorizzazione non è una caduta di rete e non deve portare al teardown "Connessione persa".
- La condizione si risolve solo quando `currentCharacter` cambia: il FE lo apprende da `userUpdated` (o da un refetch di `me`) e apre la subscription sul nuovo id.

**Divergenza dalla richiesta originale del FE.** La prima versione di FE §0.2 / FE D-02 si aspettava che un id altrui "non riceva nulla, nessun errore". Il BE (D-04) invece **rifiuta esplicitamente** alla subscribe con `FORBIDDEN` + `complete` e, in più, filtra ogni evento live. Motivo: un rifiuto esplicito è osservabile e testabile, e non lascia aperta una subscription muta che consuma risorse. Il FE ha già allineato D-02 il 2026-10-14 (rifiuto terminale, un solo refetch di `me`); questa nota rende la scelta definitiva.

---

## 3. Codici d'errore

| Codice | Quando | HTTP (REST) |
|---|---|---|
| `FORBIDDEN` (nuovo) | ownership violata; operazione innkeeper-only chiamata da non innkeeper; subscribe `characterUpdated` su id altrui | 403 |
| `NOT_FOUND` (tipizzato sui percorsi protetti) | id inesistente o malformato | 404 |
| `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `LOGIN_TICKET_INVALID` | invariati (Phase 2) | 401 |

Gli errori di dominio preesistenti delle mutation (es. magia già attiva, nessun utilizzo rimasto: `BadRequestException`) non fanno parte di questo contratto e restano invariati.

---

## 4. Risposte alle domande aperte del FE

Riferimento: `Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/BACKEND-NOTES.md` §4.

1. **Snapshot su subscribe — fatto.** Realizzato con `subscribeWithSnapshot` (stream live agganciato prima del caricamento, così nessun evento cade tra snapshot e live). Lo snapshot è emesso **solo dopo** il controllo d'identità: per `characterUpdated` dopo il guard di ownership, per `userUpdated` è letto dall'identità del bearer. Coperto da test WS reali: `src/users/user-updated.subscription.int-spec.ts` e `src/characters/character-updated.subscription.int-spec.ts`.
2. **Cancellazione del personaggio — nessuna mutation in questa fase.** È deferred, da pianificare insieme alla FE Phase 4. Vincolo registrato per ogni percorso futuro di cancellazione (Impostazioni, morte in BE Phase 9): azzerare `User.currentCharacter` **nella stessa operazione atomica** che cancella il personaggio; il FE lo riceve da `userUpdated` con `currentCharacter: null`.
3. **Ordine degli eventi alla morte — da definire in BE Phase 9** (CombatResult). Registrato come vincolo di quella fase: dovrà dichiarare se `userUpdated(currentCharacter: null)` arriva prima o dopo l'evento di combattimento.
4. **`me` e `character(id)` come refetch — confermato.** `character(id)` ed `equipment(id)` rispondono `FORBIDDEN` su un id altrui, con la stessa regola della subscription; `me` è invariata.
5. **Schema — rigenerato.** `src/schema.gql` è stato rigenerato a fine wave 1 (plan 03-05, commit `d8fd03e`), di nuovo con la rimozione del CRUD utenti (commit `298ed4b`), e verificato senza drift a fine fase; sha citato in testata.

---

## 5. Convenzione per le fasi BE 7–9

- Ogni nuova **mutation amministrativa** → `@Roles(RoleType.innkeeper)`. Il guard la riserva all'innkeeper e l'interceptor di audit la registra automaticamente in `admin_audit_logs` (`actor`, `action`, `target`, `args`, `outcome`).
- Ogni nuova **operazione che riceve un id di personaggio** → `@OwnsCharacter(selector)` (il selector estrae l'id dagli argomenti GraphQL). Se l'innkeeper la esegue su un personaggio altrui, l'azione è auditata.
- Entrambe vanno aggiunte alle whitelist enumerate di `test/app.int-spec.ts` (`EXPECTED_INNKEEPER_HANDLERS`, `EXPECTED_OWNERSHIP_HANDLERS`): il test sul boot reale fallisce se una protezione viene aggiunta o tolta senza aggiornarle.
- Qualunque percorso che cancella un personaggio deve azzerare `User.currentCharacter` nella stessa operazione atomica (§4 punto 2).

---

## 6. Fuori scope dichiarato

- Gli endpoint REST Cloudinary restano accessibili a ogni autenticato (nessuna ownership sull'upload): hardening in Phase 10.
- Le mutation quest/travel citate da BE-AUTHZ-01 non esistono ancora: le copre la convenzione §5 e le whitelist enumerate.
- Il ruolo `guard` non ha uno scope proprio: per l'autorizzazione è trattato come `adventurer`.
- Nessuna query `adminAuditLogs`: l'audit si consulta solo a DB in questa fase.
- La logica read-modify-write delle mutation del personaggio non è cambiata (atomicità: Phase 4).

## 7. Dev bypass

Invariato. Per provare il perimetro admin in locale: `DEV_AUTH_ROLE=innkeeper` sul BE (riavvio richiesto); con `DEV_AUTH_ROLE=adventurer` si verificano i `FORBIDDEN`.

## 8. Checklist di verifica per il FE

Sul `src/schema.gql` del branch BE:

```bash
grep -n "userUpdated: User!" src/schema.gql                                # 1 riga
grep -n "characterUpdated(id: String!): Character!" src/schema.gql         # 1 riga
grep -n "createUser(" src/schema.gql                                       # nessuna riga
```

E2E manuale atteso contro il BE del branch:

- [ ] al connect, `userUpdated` emette subito lo snapshot dello User; `characterUpdated(currentCharacter.id)` lo snapshot del Character
- [ ] aggiornamento live di `twitchPoints` e `role` (a DB) su `userUpdated`, e di `status` su `characterUpdated`
- [ ] dopo un close 4401, refresh e reconnect: nuovo snapshot su entrambe le subscription
- [ ] `characterUpdated` con un id altrui (bearer `adventurer`): `FORBIDDEN` + `complete`, **nessun retry**, nessun intervento del watchdog
