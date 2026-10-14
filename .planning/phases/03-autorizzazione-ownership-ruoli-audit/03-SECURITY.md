---
phase: 03
slug: autorizzazione-ownership-ruoli-audit
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-14
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against HEAD 0c1081d (branch feat/03-autorizzazione-ownership-ruoli-audit). Implementation files read-only.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Client -> GraphQL args (HTTP + WS) | Id di personaggio / pending quest / utente scelti dal client, non fidati | ObjectId stringa |
| Bearer identity -> resolver | Identità (userId, role) dal JWT di sessione, snapshot ~15 min (D-12) | userId, twitchId, role |
| WS connection_init -> subscription | Identità WS risolta una volta in onConnect | Identità, stream di eventi |
| PubSub -> subscriber | Eventi con documento completo, filtrati per identità/proprietà a ogni evento | Character / User completi |
| Server -> client error channel | Errori tipizzati; solo `extensions.code` | code, message |
| Admin action -> audit log | Azioni innkeeper e on-behalf persistite su admin_audit_logs | actor, action, target, args |
| Test code -> AppModule | Fixture/probe di test non devono entrare nel boot reale | n/a |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-03-01a | Tampering | PubSubEvents typing | mitigate | `PubSubEvents` tipizza gli eventi (src/pubsub.module.ts:9-12) | closed |
| T-03-14a | Elevation | test fixture/helpers | mitigate | Helper solo sotto test/ (player-fixture, admin-probe, characters-test-app); nessun riferimento in src/app.module.ts, nessun dev bypass in test/authz | closed |
| T-03-11a | DoS | test handles | mitigate | Cleanup dei test handle nelle int-spec/ws-test-client | closed |
| T-03-13 | Info disclosure | exceptions | mitigate | `extensions = { code }` esatto: authorization.exception.ts:6,16; resource-not-found.exception.ts:7,16; formatDomainError riscrive extensions solo con `{ code }` (format-domain-error.ts:17-22); specs *.exception.spec.ts, format-domain-error.spec.ts | closed |
| T-03-11 | DoS | subscribeWithSnapshot cleanup | mitigate | `iterator.return()` su stop del Repeater (subscribe-with-snapshot.ts:23) e su errore snapshot (:15); subscribe-with-snapshot.spec.ts. Vedi nota WR-04 | closed |
| T-03-02a | Info disclosure | live next() prima dello snapshot | mitigate | `firstLive = iterator.next()` prima di `loadSnapshot()` (subscribe-with-snapshot.ts:10-13) | closed |
| T-03-16a | Tampering | isObjectIdHex | mitigate | `/^[0-9a-f]{24}$/i` (src/mongo/document-id.ts:1,11-13), document-id.spec.ts. Vedi nota WR-02 | closed |
| T-03-03 | Info disclosure | userUpdated | mitigate | Nessun argomento, filtro `documentIdOf(userUpdated) === identity.userId`, snapshot per identity.userId (users.resolver.ts:35-49); user-updated.subscription.int-spec.ts | closed |
| T-03-03b | Spoofing | identità subscription | mitigate | Identità solo via `@CurrentUser()` -> `readRequestIdentity` (current-user.decorator.ts, request-identity.ts) | closed |
| T-03-10a | DoS | predicato filter userUpdated | mitigate | Predicato sincrono puro (`documentIdOf` null-safe, document-id.ts:4-8), non può lanciare | closed |
| T-03-12 | DoS | una findOne per subscribe | accept | Vedi Accepted Risks Log AR-03-01 | closed |
| T-03-13b | Info disclosure | publisher log | mitigate | Log solo di `error.message`, nessun documento/args (user-updates.publisher.ts:42-47,60-64) | closed |
| T-03-01 | Elevation (IDOR) | CharacterAccessPolicy + OwnershipGuard + decorators 03-07 | mitigate | Policy owner/onBehalf/throw (character-access.policy.ts:58-94), guard prima del resolver (ownership.guard.ts:23-51); @OwnsCharacter su doTransaction/equipItem/equipSpell/unequipSpell/useSpell (characters.resolver.ts:49-94); policy/guard specs, characters-ownership.int-spec.ts; EXPECTED_OWNERSHIP_HANDLERS (test/app.int-spec.ts:40-50). Vedi nota WR-01 | closed |
| T-03-16 | Tampering | id malformato nella policy | mitigate | `isObjectIdHex` prima di ogni query -> `ResourceNotFoundException` (character-access.policy.ts:62-63,80-81) | closed |
| T-03-09 | Info disclosure | oracolo 403/404 (character) | accept | Vedi AR-03-02 (D-11) | closed |
| T-03-10 | Info disclosure | mayReceiveCharacterEvent | mitigate | try/catch -> false (character-access.policy.ts:97-113) | closed |
| T-03-06a | Repudiation | on-behalf su info | mitigate | `recordOnBehalf(info, target)` (ownership.guard.ts:44-49, authorization-decisions.ts); authorization-decisions.spec.ts | closed |
| T-03-01b | Elevation | contesto non GraphQL | mitigate | `throw Error` se type != graphql (ownership.guard.ts:30-34); identità assente -> UNAUTHENTICATED (:35-36) | closed |
| T-03-02 | Info disclosure | characterUpdated | mitigate | `@OwnsCharacter` sul subscription prima dello snapshot + filtro per evento (characters.resolver.ts:96-113); character-updated.subscription.int-spec.ts | closed |
| T-03-17 | Info disclosure | cambio currentCharacter a stream aperto | mitigate | Ownership riletta a ogni evento, fail-closed (`mayDeliver` -> `mayReceiveCharacterEvent`, characters.resolver.ts:116-123) | closed |
| T-03-16b | Tampering | NOT_FOUND prima di findById | mitigate | Policy valida hex prima di `characterModel`/`findById` (character-access.policy.ts:62) | closed |
| T-03-12b | DoS | una lettura users per evento | accept | Vedi AR-03-03 | closed |
| T-03-19 | DoS / FE loop | retry su FORBIDDEN/NOT_FOUND + watchdog (BE-NOTES, 03-05 + 03-10) | mitigate | BACKEND-NOTES.md:143-144 (NON ritentare, escluso dal watchdog), checklist :211 | closed |
| T-03-04 | Elevation | CRUD utente da client | mitigate | Nessuna mutation `createUser/updateUser/deleteUser` né `UserInput` in src/schema.gql; UsersResolver espone solo users/user/userUpdated | closed |
| T-03-05 | Elevation | users/user | mitigate | `@Roles(RoleType.innkeeper)` (users.resolver.ts:22,28); EXPECTED_INNKEEPER_HANDLERS; users-authz.int-spec.ts | closed |
| T-03-08 | Elevation | ruolo da snapshot JWT | accept | Vedi AR-03-04 (D-12) | closed |
| T-03-04b | Elevation | secondo APP_GUARD | mitigate | Unico APP_GUARD in src/auth/auth.module.ts:55; nessuno in src/authz (grep); guard di metodo via UseGuards | closed |
| T-03-13c | Info disclosure | UsersService.findOne | mitigate | `ResourceNotFoundException.user()` su id inesistente (users.service.ts:35); users-authz.int-spec.ts. Vedi nota WR-03 | closed |
| T-03-01c | Elevation (IDOR) | character(id)/equipment(id) | mitigate | `@OwnsCharacter` (characters.resolver.ts:37,43) | closed |
| T-03-05b | Elevation | characters | mitigate | `@Roles(innkeeper)` su `characters` (characters.resolver.ts:31) | closed |
| T-03-13d | Info disclosure | CharactersService | mitigate | `ResourceNotFoundException` ai punti di errore (characters.service.ts:96,153,160,208,221,258,265,280,296) | closed |
| T-03-06b | Repudiation | on-behalf | mitigate | Guard registra on-behalf, interceptor lo persiste (admin-audit.interceptor.ts:73-74,83); admin-audit.int-spec.ts | closed |
| T-03-ATOM | Tampering (race RMW) | logica mutation | transfer | Trasferito a Phase 4 (BE-ATOM-*), documentato in 03-07-PLAN; vedi AR-03-T | closed |
| T-03-01d | Elevation (IDOR) | pendingQuest(id) | mitigate | `@OwnsPendingQuest` (pending-quests.resolver.ts:18); policy authorizePendingQuest; pending-quests-authz.int-spec.ts | closed |
| T-03-05c | Elevation | pendingQuests | mitigate | `@Roles(innkeeper)` (pending-quests.resolver.ts:12) | closed |
| T-03-16c | Tampering | id malformato pendingQuest | mitigate | hex check prima della query (character-access.policy.ts:80-81) | closed |
| T-03-09b | Info disclosure | oracolo 403/404 (pendingQuest) | accept | Vedi AR-03-05 | closed |
| T-03-12c | DoS | fino a tre letture per id | accept | Vedi AR-03-06 | closed |
| T-03-06 | Repudiation | audit mutation admin e on-behalf | mitigate | `AdminAuditInterceptor` globale via APP_INTERCEPTOR (authz.module.ts:37); filtra mutation con @Roles(innkeeper) o on-behalf (admin-audit.interceptor.ts:64-89); interceptor spec + admin-audit.int-spec.ts | closed |
| T-03-07 | Repudiation / Tampering | best-effort audit | mitigate | `record` non rigetta mai (admin-audit-log.service.ts:28-37); errore originale rilanciato (interceptor:53-60); write attesa nella pipeline (:45-52) | closed |
| T-03-07b | Info disclosure | superficie GraphQL audit | mitigate | `AdminAuditLog` senza @ObjectType (admin-audit-log.model.ts:33); nessun tipo/query audit in src/schema.gql | closed |
| T-03-15 | Info disclosure / DoS | volume e retention | mitigate | Solo azioni admin/on-behalf; TTL 90 giorni (admin-audit-log.model.ts:4,60-63) | closed |
| T-03-13e | Info disclosure | log errore audit | mitigate | Il payload args non è mai loggato (admin-audit-log.service.ts:32-35). Vedi nota IN-03 | closed |
| T-03-14 | Elevation | probe resolver | mitigate | admin-probe.resolver.ts solo in test/; referenziato solo da src/authz/audit/admin-audit.int-spec.ts; assente da app.module | closed |
| T-03-18 | Elevation | whitelist enumerate nel boot reale | mitigate | EXPECTED_PUBLIC/INNKEEPER/OWNERSHIP_HANDLERS in test/app.int-spec.ts:26-50, 298-315; coincidono con i decorator letti in src | closed |
| T-03-14b | Elevation | adminProbe nello schema | mitigate | `expect(schema).not.toContain('adminProbe')` (test/app.int-spec.ts:244); grep src/schema.gql: assente | closed |
| T-03-13f | Info disclosure | contratto errori FE | mitigate | BACKEND-NOTES.md:120 (extensions esatte), :7 e 130-137 (mappa codici, non messaggi) | closed |
| T-03-SCHEMA | Tampering | drift schema.gql | mitigate | CI `git diff --exit-code src/schema.gql` (.github/workflows/ci.yml:64-66) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

Unique threats: 48 (T-03-01 e T-03-19 uniti tra piani).

### Verification notes on code review intersections (mitigation holds, residual hardening)

- **WR-01 (T-03-01, T-03-01b):** `authorize` senza `default` e guard che ritorna `true` senza verificare l'esito sono un fail-open latente. Oggi NON raggiungibile: `OwnedResource` ha due soli membri, entrambi coperti (character-access.policy.ts:48-53), e i decorator sono solo `OwnsCharacter`/`OwnsPendingQuest`. Mitigazione valida oggi; raccomandato un hardening prima di aggiungere una nuova risorsa posseduta (Phase 7-9).
- **WR-02 (T-03-16a, T-03-02):** `isObjectIdHex` accetta maiuscolo, confronto case-sensitive. Esito fail-closed (FORBIDDEN / on-behalf auditato / eventi live scartati): impatto su disponibilità del proprietario, nessuna perdita di confidenzialità o escalation.
- **WR-03 (T-03-13c, T-03-16):** `user(id)` malformato per l'innkeeper produce CastError -> INTERNAL_SERVER_ERROR con messaggio Mongoose. Raggiungibile solo dal ruolo più privilegiato autenticato (`@Roles(innkeeper)` regge); il messaggio riecheggia solo l'input dell'innkeeper. Il NOT_FOUND tipizzato per id inesistente è presente e testato; i percorsi character/pendingQuest validano l'hex. Deviazione dal contratto, non perdita di controllo.
- **WR-04 (T-03-11):** `firstLive` senza handler se lo snapshot fallisce. Il cleanup dei listener è presente; il rischio residuo è un `unhandledRejection` solo se un predicato di filter lancia, e i predicati oggi non lanciano (userUpdated: puro; characterUpdated: `mayReceiveCharacterEvent` cattura gli errori). Latente.
- **IN-03 (T-03-13e):** il log di fallimento audit include `error.message` di Mongoose che può contenere un valore di arg. Il payload args non è mai loggato; il log è server-side (stdout), non esposto al client. Hardening raccomandato (loggare `error.name`).
- **IN-06 (T-03-09, T-03-09b):** già coperto da AR-03-02 / AR-03-05.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-12 | Una `findOne` per subscribe `userUpdated`: costo trascurabile su un singolo canale Twitch | Luca Tabbia | 2026-10-14 |
| AR-03-02 | T-03-09 | Oracolo 403/404 su personaggio (esiste ma non tuo vs non esiste): decisione D-11, messaggi distinti utili al FE; ObjectId non indovinabili | Luca Tabbia | 2026-10-14 |
| AR-03-03 | T-03-12b | Una lettura `users` per evento `characterUpdated` per subscriber: single instance, canale singolo | Luca Tabbia | 2026-10-14 |
| AR-03-04 | T-03-08 | Ruolo come snapshot del JWT (~15 min), nessuna rilettura da DB: decisione D-12, revoca di ruolo efficace al refresh | Luca Tabbia | 2026-10-14 |
| AR-03-05 | T-03-09b | Oracolo 403/404 su pendingQuest, stesso razionale D-11 | Luca Tabbia | 2026-10-14 |
| AR-03-06 | T-03-12c | Fino a tre letture puntuali per id su pendingQuest: carico trascurabile | Luca Tabbia | 2026-10-14 |
| AR-03-T | T-03-ATOM | (Transfer, non accettazione) race read-modify-write trasferite a Phase 4 BE-ATOM-* | Luca Tabbia | 2026-10-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-14 | 48 | 48 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-14
