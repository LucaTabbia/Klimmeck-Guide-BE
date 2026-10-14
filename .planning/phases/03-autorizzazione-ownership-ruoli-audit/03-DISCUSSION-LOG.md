# Phase 3: Autorizzazione: Ownership, Ruoli, Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 3-autorizzazione-ownership-ruoli-audit
**Areas discussed:** Ownership sulle mutation del personaggio, Ruoli e perimetro admin, Audit log admin, Subscription per identità e user stream

---

## Ownership sulle mutation del personaggio

### Come imponiamo l'ownership sulle mutation che portano l'id del character?

| Option | Description | Selected |
|--------|-------------|----------|
| Id mantenuto e verificato contro currentCharacter | Contratto invariato, FORBIDDEN se diverso | ✓ |
| Togliere l'id: il personaggio è quello del bearer | Input senza id, rompe i documenti FE | |

**User's choice:** Id mantenuto e verificato (raccomandata).

### L'innkeeper può usare queste stesse mutation su personaggi altrui?

| Option | Description | Selected |
|--------|-------------|----------|
| No: ownership stretto, operazioni admin dedicate | Innkeeper trattato come giocatore | |
| Sì: l'innkeeper bypassa l'ownership | Può agire per conto di chiunque | ✓ |

**User's choice:** Sì, bypass innkeeper (contro la raccomandazione).
**Notes:** Le azioni innkeeper su personaggi altrui vengono auditate (area Audit).

### Query character(id), equipment(id), characters?

| Option | Description | Selected |
|--------|-------------|----------|
| Singolo: proprietario o innkeeper; lista: solo innkeeper | Coerente col filtro subscription | ✓ |
| Query in sola lettura aperte a tutti gli autenticati | Si limita solo chi muta | |

**User's choice:** Singolo proprietario/innkeeper, lista innkeeper-only (raccomandata).

### Codice d'errore per il rifiuto di ownership?

| Option | Description | Selected |
|--------|-------------|----------|
| FORBIDDEN, personaggio inesistente resta NOT_FOUND | 403 stabile, 404 invariato | ✓ |
| Sempre FORBIDDEN, anche se l'id non esiste | Indistinguibili dal client | |

**User's choice:** FORBIDDEN / NOT_FOUND (raccomandata).

---

## Ruoli e perimetro admin

### Cos'è il ruolo guard e che poteri ha in questa fase?

| Option | Description | Selected |
|--------|-------------|----------|
| Nessun potere admin: come adventurer | Ruolo riservato senza privilegi | |
| Moderatore: lettura admin ma niente mutation | Query admin consentite | |
| Equivalente a innkeeper | Stessi poteri | |

**User's choice:** Altro — "guard è un moderatore. Attualmente il ruolo non ha scope in quanto non serve allo stato attuale, avrà un utilizzo quando ci sarà la sezione forum dell'app (evolutiva futura)."
**Notes:** In v1 nessuno scope: equivale operativamente alla prima opzione.

### Mutation legacy createUser/updateUser/deleteUser e query users/user(id)?

| Option | Description | Selected |
|--------|-------------|----------|
| Rimuovere le mutation, query innkeeper-only | Gli utenti nascono dal login | ✓ |
| Tutto innkeeper-only con audit | Mutation come strumenti admin | |
| Rimuovere tutto | Niente CRUD utenti via GraphQL | |

**User's choice:** Rimuovere le mutation, query innkeeper-only (raccomandata).

### Role guard: ruolo dal JWT (snapshot) o DB-fresh per le operazioni admin?

| Option | Description | Selected |
|--------|-------------|----------|
| DB-fresh per @Roles, JWT per il resto | Revoca immediata | |
| Solo JWT (D-10 com'è) | Zero query extra | ✓ |

**User's choice:** Altro — "Io sarò il solo innkeeper, quindi il ruolo non mi può essere revocato e in questa prima versione non ci saranno profili guard. Possiamo quindi tenere tutto com'è adesso" (= solo JWT, contro la raccomandazione).

### Altre operazioni: characters (lista), pendingQuests/pendingQuest(id), cataloghi?

| Option | Description | Selected |
|--------|-------------|----------|
| Lista characters e pendingQuests innkeeper-only, cataloghi aperti | | |
| Solo characters innkeeper-only | pendingQuests aperta | |

**User's choice:** Altro — "Sono accessibili solo le pendingQuests dell'utente stesso per i ruoli adventurer. La lista character è solo per l'innkeeper e tutte le pendingQuests solo per l'innkeeper."
**Notes:** Cataloghi di gioco: nessuna obiezione alla lettura per ogni autenticato (assunzione registrata in D-10).

---

## Audit log admin

### Quali azioni finiscono nell'audit log admin?

| Option | Description | Selected |
|--------|-------------|----------|
| Ogni mutation @Roles(innkeeper) + azioni innkeeper su personaggi altrui | Automatico via interceptor | ✓ |
| Solo le mutation admin dedicate | Bypass non tracciato | |
| Anche le query admin | Più rumore | |

**User's choice:** Mutation innkeeper + bypass ownership (raccomandata).

### Payload del record?

| Option | Description | Selected |
|--------|-------------|----------|
| Argomenti completi dell'operazione + esito | Massima diagnostica | ✓ |
| Sintesi: solo tipo e id del target | Record minimale | |

**User's choice:** Argomenti completi + esito (raccomandata).

### Come si consulta l'audit log?

| Option | Description | Selected |
|--------|-------------|----------|
| Query GraphQL innkeeper-only già in questa fase | adminAuditLogs paginata | |
| Solo a DB per ora | Compass/mongosh | ✓ |

**User's choice:** Solo a DB per ora (contro la raccomandazione).

### Retention?

| Option | Description | Selected |
|--------|-------------|----------|
| Per sempre, nessun TTL | | |
| TTL 1 anno | | (scelta iniziale) |
| TTL 90 giorni | | ✓ |

**User's choice:** Prima "TTL 1 anno", poi corretto a "TTL 90 giorni": "Le diagnostiche non mi saranno eccessivamente utili in un primo momento e non voglio riempire il DB con troppo noise per motivi di costi."

---

## Subscription per identità e user stream

### Adventurer apre characterUpdated(id) con id altrui?

| Option | Description | Selected |
|--------|-------------|----------|
| Rifiuto FORBIDDEN alla sottoscrizione + filtro come difesa | | ✓ |
| Solo filtro silenzioso | | |

**User's choice:** Rifiuto FORBIDDEN + filtro (raccomandata).

### Innkeeper può sottoscrivere qualunque personaggio?

| Option | Description | Selected |
|--------|-------------|----------|
| Sì | Vista live admin | ✓ |
| No, solo il proprio | | |

**User's choice:** Sì (raccomandata).

### Come viene prodotto userUpdated?

| Option | Description | Selected |
|--------|-------------|----------|
| Change stream Mongo su users, come per i character | Emette anche le modifiche manuali a DB | ✓ |
| Publish esplicito nei service | | |
| Decidi tu | | |

**User's choice:** Change stream su users (raccomandata).

### Priorità del contratto real-time dentro la fase?

| Option | Description | Selected |
|--------|-------------|----------|
| Prima wave: il contratto real-time sblocca il FE | | ✓ |
| Ordine naturale del planner | | |

**User's choice:** Prima wave (raccomandata).

---

## Claude's Discretion

- Meccanica dello snapshot su subscribe e suoi test WS.
- Collocazione del check di ownership e della risoluzione di currentCharacter.
- Layout dei moduli authz, nome della collection di audit, interceptor vs decorator.
- Rimozione di UserInput e dei metodi CRUD del UsersService.
- Ownership di pendingQuest(id) via Character.quests.pendingQuest.
- Gestione dei fallimenti di scrittura dell'audit (default best-effort).

## Deferred Ideas

- Mutation di cancellazione del personaggio (FE Phase 4 / morte): non in roadmap, da inserire.
- Query adminAuditLogs innkeeper-only.
- Audit delle query admin.
- Ruolo guard = moderatore della futura sezione forum.
- Rilettura del ruolo da DB per @Roles.
