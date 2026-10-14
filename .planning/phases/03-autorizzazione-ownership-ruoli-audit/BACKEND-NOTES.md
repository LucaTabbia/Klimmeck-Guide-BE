# BACKEND-NOTES — Phase 3 Autorizzazione: Ownership, Ruoli, Audit (handoff BE → FE)

- **Fase BE:** 03-autorizzazione-ownership-ruoli-audit (BE-AUTHZ-01..04, BE-SYNC-01/02; decisioni D-01..D-19 in `03-CONTEXT.md`)
- **Data:** 2026-10-14 — **bozza** scritta al discuss: il plan di handoff a fine fase la completa con i nomi definitivi e gli esempi verificati. `src/schema.gql` rigenerato vince su questo documento.
- **Richiesta FE di riferimento:** `Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/BACKEND-NOTES.md` (domande aperte 1–5 chiuse qui sotto, §4).
- **Consumatori FE:** FE Phase 3 (sync real-time), FE Phase 6/8 (mutation giocatore sotto ownership), FE Phase 10 (admin: `@Roles`, audit).

---

## 0. TL;DR per il FE

1. **Nuova subscription `userUpdated: User!` senza argomenti** — emette lo `User` dell'utente autenticato (`id twitchId twitchPoints role currentCharacter { id … }`) a ogni modifica del documento (`twitchPoints`, `role`, `currentCharacter`), prodotta da un change stream su `users`.
2. **Snapshot su subscribe** su `userUpdated` e `characterUpdated`: il primo evento di ogni (ri)sottoscrizione è il documento corrente; poi gli eventi live. Nessun replay: il FE ri-sottoscrive al reconnect e riceve lo snapshot.
3. **`characterUpdated(id: String!)` invariato nel contratto**, ma: id ≠ `currentCharacter` del bearer e bearer non `innkeeper` → la sottoscrizione fallisce subito con `extensions.code = FORBIDDEN`. L'innkeeper può ascoltare qualunque personaggio.
4. **Ownership sulle mutation giocatore** (`doTransaction`, `equipItem`, `equipSpell`, `unequipSpell`, `useSpell`) e sulle query `character(id)`, `equipment(id)`, `pendingQuest(id)`: contratto invariato, ma su un personaggio non proprio → `FORBIDDEN` (HTTP 403 su REST). L'innkeeper è esente (e auditato). Un id inesistente resta `NOT_FOUND`.
5. **Innkeeper-only** (`FORBIDDEN` per gli altri): `users`, `user(id)`, `characters`, `pendingQuests`. **Rimosse dallo schema**: `createUser`, `updateUser`, `deleteUser` (il FE non le usava).
6. **Nuovo codice d'errore stabile: `FORBIDDEN`** (messaggio italiano). Il FE mappa il codice, mai il messaggio.
7. **Audit log admin** su collection Mongo con TTL 90 giorni: automatico su ogni mutation `@Roles(innkeeper)` e su ogni azione innkeeper su personaggi altrui. Nessuna query GraphQL di lettura in questa fase.
8. **Ordine:** il contratto real-time (punti 1–3) atterra nella **prima wave** con `src/schema.gql` rigenerato sul branch, così il FE può fare lo schema check e l'E2E contro il BE del branch; la PR BE (fase completa) precede la PR FE.

---

## 1. Schema (atteso dopo la wave 1; verificare su `src/schema.gql`)

```graphql
type Subscription {
  characterUpdated(id: String!): Character!   # invariata; FORBIDDEN alla subscribe su id altrui (non innkeeper)
  userUpdated: User!                           # nuova; identità dal bearer del connection_init
}

type Mutation {
  # rimosse: createUser, updateUser, deleteUser
  # invariate: doTransaction, equipItem, equipSpell, unequipSpell, useSpell, createCharacter, exchangeLoginTicket, refreshSession, logout
}
```

Selezione FE suggerita per lo user stream (fragment `UserFields` già esistente):

```graphql
subscription OnUserChanged {
  userUpdated { id twitchId twitchPoints role currentCharacter { id } }
}
```

### Comportamento

| Evento | `userUpdated` | `characterUpdated(id)` |
|---|---|---|
| Apertura/riapertura della subscription | snapshot immediato dello User | snapshot immediato del Character (se proprietario o innkeeper) |
| Subscribe su id altrui (non innkeeper) | — | errore `FORBIDDEN`, nessun evento |
| Accredito punti canale (BE Phase 6) | emette con `twitchPoints` aggiornato | — |
| Cambio ruolo (manuale a DB) | emette con `role` aggiornato | — |
| `createCharacter` | emette con `currentCharacter { id }` | il FE apre poi la subscription sul nuovo id |
| Cancellazione / morte (fasi future) | emette con `currentCharacter: null` | nessuna emissione (delete non è nel change stream) |
| Qualsiasi update del character | — | documento completo |

### Autenticazione WS

Invariata rispetto alla Phase 2: `connection_init` `{ "Authorization": "Bearer <jwt>" }`, close 4403 al connect, 4401 alla scadenza. Lo snapshot su subscribe chiude il gap di riconnessione.

---

## 2. Codici d'errore

| Codice | Quando | HTTP (REST) |
|---|---|---|
| `FORBIDDEN` (nuovo) | ownership violata; operazione innkeeper-only chiamata da non innkeeper; subscribe `characterUpdated` su id altrui | 403 |
| `NOT_FOUND` | id inesistente (invariato) | 404 |
| `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED`, `LOGIN_TICKET_INVALID` | invariati (Phase 2) | 401 |

---

## 3. Convenzione per le fasi future (BE 7–9)

Ogni nuova mutation amministrativa va decorata con `@Roles(RoleType.innkeeper)`: il guard la riserva all'innkeeper e l'interceptor di audit la registra automaticamente (`actor`, `action`, `target`, `args`, `outcome`). Qualunque percorso che cancella un personaggio deve azzerare `User.currentCharacter` nella stessa operazione atomica, così il FE lo apprende da `userUpdated`.

---

## 4. Risposte alle domande aperte del FE (`Klimmeck-Guide/.planning/phases/03-real-time-sync-foundation/BACKEND-NOTES.md` §4)

1. **Snapshot su subscribe:** accettato (D-03); meccanica scelta in research/plan, coperta dai test WS reali. Se emergesse un'impossibilità tecnica il FE verrà avvisato prima della fine della wave 1.
2. **Cancellazione del personaggio:** nessuna mutation in questa fase (non è in roadmap); la convenzione §3 vincola le fasi che la introdurranno. Da pianificare insieme alla FE Phase 4.
3. **Ordine degli eventi alla morte:** da definire nella BE Phase 9 (CombatResult); registrato come vincolo per quella fase.
4. **`me` e `character(id)` come refetch:** confermato; `character(id)` ora risponde `FORBIDDEN` su id altrui (stessa regola della subscription).
5. **Schema:** `src/schema.gql` rigenerato a fine wave 1 e a fine fase; questo documento viene completato dal plan di handoff.

---

## 5. Dev bypass

Invariato. Per provare il perimetro admin in locale: `DEV_AUTH_ROLE=innkeeper` sul BE (riavvio richiesto); con `adventurer` si verificano i `FORBIDDEN`.
