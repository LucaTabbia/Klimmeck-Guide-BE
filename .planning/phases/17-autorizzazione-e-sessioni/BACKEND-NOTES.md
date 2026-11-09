# BACKEND-NOTES — Phase 17 Autorizzazione e sessioni (handoff per la FE Phase 12)

- **Fase BE:** 17-autorizzazione-e-sessioni (requisiti BE-SESSION-01..05; decisioni D-01..D-16 in `17-CONTEXT.md`; nomi del contratto fissati in `17-REPO-RULES.md`).
- **Data:** 2026-11-09. Documento di fine fase, scritto dopo il gate verde del piano 17-09 e prima della UAT su device della FE Phase 12.
- **Branch:** `feat/17-autorizzazione-e-sessioni` (da `develop` `31dba96`) → PR verso `develop` a cura dell'orchestratore, **non in draft**: la fase non ha one-off, migrazioni né seeder.
- **Stato della FE Phase 12:** i piani che dipendono dal contratto (avvisi col motivo, close `4409`, UAT dual-device) partono dopo la merge con il gate `git -C <repo BE> show origin/develop:src/auth/session/session-revoke-reason.enum.ts | grep -c newLogin` ≥ 1.
- **Schema:** `src/schema.gql` **invariato** rispetto a `origin/develop`: nessun tipo, campo, query, mutation o subscription nuova. Il motivo della revoca viaggia solo nelle `extensions` e nella reason del close WS. Il boot reale (`test/app.int-spec.ts`) rigenera lo schema e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate (piano 17-09): `npm run test:cov` **380 suite / 4849 test** verdi (560 s), nessuna soglia violata, `coverageThreshold` invariato; coverage totale 97,32 / 85,81 / 93,91 / 97,88 (statements / branches / functions / lines); `./src/auth/` 99,86 / 87,47 / 100 / 100 (soglie 97 / 84 / 98); boot reale 79/79; `npx tsc --noEmit` exit 0; prettier ed eslint puliti sui 37 file `.ts` toccati (resta il warning preesistente `no-base-to-string` in `test/app.int-spec.ts`). VALIDATION firmata il 2026-11-09. Nessuna variabile d'ambiente nuova, nessuna dipendenza nuova.
- **Review e fix:** vedi `17-REVIEW.md` / `17-REVIEW-FIX.md`.
- **Fonte:** ogni nome e valore è copiato dal codice: `src/auth/session/session-revoke-reason.enum.ts`, `src/auth/ws/ws-close-codes.ts`, `src/auth/auth.exception.ts`, `src/config/auth-config.ts`. **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **SDL invariato:** nessun tipo, campo, query, mutation o subscription nuova.
2. **L'ultimo login caccia l'altro:** un login revoca tutte le altre sessioni attive dello stesso utente (motivo `newLogin`); la sessione appena creata non è mai toccata.
3. **Close WS `4409`** per la sessione revocata, con reason = valore di `SessionRevokeReason` (o `''` per una revoca senza motivo). `4401` e `4403` invariati.
4. **`SESSION_REVOKED` + `extensions.reason`** sul rifiuto del refresh (stesso valore della reason del close). `SESSION_EXPIRED` resta senza `reason`.
5. **Cambio di ruolo a DB → `roleChanged`:** tutte le sessioni dell'utente revocate, socket vivi chiusi con `4409 roleChanged`.
6. **Logout invariato:** revoca la sola sessione corrente (motivo `userLogout`), gli altri device restano dentro.
7. **Finestra HTTP del JWT: 900 s.** Il JWT residuo di una sessione revocata è ancora servito su HTTP fino a `exp` (stateless, accettato).
8. **Evidenza di HARDEN-02:** la matrice di autorizzazione `test/authz/authorization-matrix.int-spec.ts` sul boot reale di `AppModule` (§2).

---

## 1. Contratto

### 1.1 Motivo della revoca

Copiato verbatim da `src/auth/session/session-revoke-reason.enum.ts` (il gate FE lo grepa su `origin/develop`):

```typescript
export enum SessionRevokeReason {
    newLogin = 'newLogin',
    roleChanged = 'roleChanged',
    reuseDetected = 'reuseDetected',
    userLogout = 'userLogout',
}
```

Non è un enum GraphQL (nessun `registerEnumType`): non compare nello schema.

| Valore | Quando lo scrive il BE | Chiude i socket vivi? |
|--------|------------------------|-----------------------|
| `newLogin` | un login successivo dello stesso utente (D-02) | sì, subito |
| `roleChanged` | il `role` dell'utente cambia a DB (D-06) | sì, subito |
| `reuseDetected` | un refresh token già ruotato viene ripresentato (reuse detection, Phase 2 D-08) | no |
| `userLogout` | `logout` della sessione corrente (D-07) | no |

### 1.2 Close code WS

Da `src/auth/ws/ws-close-codes.ts`:

| Codice | Costante | Significato | Reason |
|--------|----------|-------------|--------|
| `4401` | `WS_TOKEN_EXPIRED_CLOSE_CODE` | access token scaduto (invariato) | `Token expired` |
| `4403` | `WS_FORBIDDEN_CLOSE_CODE` | bearer assente o invalido alla `connection_init` (invariato) | `Forbidden` |
| `4409` | `WS_SESSION_REVOKED_CLOSE_CODE` | sessione revocata (nuovo, D-03) | valore di `SessionRevokeReason`, o `''` se la revoca non ha motivo (sessioni revocate prima del deploy, refresh di un utente cancellato) |

### 1.3 Rifiuto del refresh

Esempio di payload di un refresh rifiutato perché un altro login ha cacciato la sessione (misurato, RESEARCH F-11 e `src/graphql/production-surface.int-spec.ts`):

```json
{"errors":[{"message":"Session revoked, sign in again","locations":[{"line":1,"column":27}],"path":["refreshSession"],"extensions":{"code":"SESSION_REVOKED","reason":"newLogin"}}],"data":null}
```

- `extensions` di `SESSION_REVOKED` = `{ code, reason }` se la sessione ha un motivo, `{ code }` se non lo ha (revoche legacy, utente cancellato).
- `SESSION_EXPIRED`, `UNAUTHENTICATED`, `LOGIN_TICKET_INVALID` restano `{ code }`, **senza `reason`**.
- La `reason` arriva **anche in produzione**: i due formatter (`src/graphql/format-domain-error.ts`, `src/graphql/production-errors.ts`) conservano la sola chiave `reason` (allowlist di una chiave, mai lo spread delle extensions originali, D-13). Arriva **anche su WS** (stessa pipeline di formattazione).
- Una `reason` **assente o ignota** va trattata come neutra (avviso generico, FE 12 D-12): l'enum potrà crescere senza rompere la FE.

### 1.4 Quando il BE chiude con `4409` e quando no

- **Secondo login (`newLogin`) e cambio di ruolo (`roleChanged`)**: il BE revoca a DB **prima**, poi chiude **subito** tutti i socket vivi delle sessioni revocate con `4409` e il motivo.
- **`userLogout` e `reuseDetected` NON chiudono i socket vivi**: al logout la FE smonta da sé il WS; sul riuso resta la finestra del JWT. In entrambi i casi **ogni `connection_init` successiva** col JWT di quella sessione riceve `4409` col motivo.
- Una `connection_init` col JWT di una sessione **revocata** è chiusa con `4409` + motivo (`''` se senza motivo) e non viene accettata (niente ping-pong).
- Una `connection_init` col JWT di una sessione **assente a DB** è accettata (il JWT è stateless; la sessione mancante non è una revoca).
- Il dev bypass non ha sessioni: nessuna revoca, nessun `4409`.
- **Dopo un `4409` la FE rinnova prima di riconnettere** e legge la `reason` dal rifiuto del refresh (FE 12 D-09): il refresh di una sessione revocata è sempre rifiutato con `SESSION_REVOKED`.

### 1.5 Finestra HTTP del JWT (D-04)

L'access JWT resta **stateless**: nessuna lookup della sessione nel guard HTTP. Il JWT residuo di una sessione revocata è servito su HTTP fino a `exp` (`ACCESS_TOKEN_TTL_SECONDS` = **900** s, `src/config/auth-config.ts`). Finestra accettata dall'utente; la FE non la deve compensare.

---

## 2. Comportamenti provati

| Decisione | Comportamento | Spec |
|-----------|---------------|------|
| D-02 | il login revoca le altre sessioni attive con `newLogin`, la nuova resta intatta, il dev bypass non revoca | `test/auth/session-revocation.int-spec.ts`, `src/auth/auth-session.service.int-spec.ts`, `src/auth/session/session-revocation.service.int-spec.ts`, `src/auth/session/session.service.int-spec.ts` |
| D-03 | socket vivo chiuso con `4409 newLogin` al secondo login; `connection_init` di una sessione revocata chiusa con `4409` + motivo (o `''`); JWT di sessione assente accettato; registro dei socket per `sessionId` | `test/auth/session-revocation.int-spec.ts`, `test/auth/ws-auth.int-spec.ts`, `src/auth/ws/ws-session-registry.spec.ts`, `src/auth/ws/ws-connection-authenticator.spec.ts` |
| D-04 | il JWT residuo della sessione cacciata è ancora servito su HTTP | `test/auth/session-revocation.int-spec.ts` |
| D-05 | refresh rifiutato con `SESSION_REVOKED` + `reason`; la reuse detection scrive `reuseDetected`; `AuthException.sessionRevoked(reason)` | `test/auth/session-revocation.int-spec.ts`, `src/auth/session/session.service.int-spec.ts`, `src/auth/auth.exception.spec.ts`, `src/auth/session/session.model.spec.ts`, `src/graphql/production-surface.int-spec.ts` |
| D-06 | cambio del `role` a DB (a mano o via `upsertWithRole`) → tutte le sessioni dell'utente revocate con `roleChanged`, socket chiusi con `4409 roleChanged`; stesso ruolo, altro campo, altri utenti → nessun effetto | `src/auth/session/user-role-changes.publisher.int-spec.ts`, `src/auth/session/user-role-changes.publisher.spec.ts` |
| D-07 | logout revoca la sola sessione corrente con `userLogout` e non chiude il socket vivo | `test/auth/session-revocation.int-spec.ts`, `src/auth/auth-session.service.int-spec.ts`, `src/graphql/production-surface.int-spec.ts` |
| D-11 | revoca senza motivo (utente cancellato, documenti legacy) → nessuna `reason` | `src/auth/session/session.service.int-spec.ts`, `src/auth/auth.exception.spec.ts`, `src/auth/session/session.model.spec.ts` |
| D-12 | fra due login concorrenti vince l'ultimo (solo le sessioni con id minore vengono revocate) | `src/auth/session/session.service.int-spec.ts`, `src/auth/auth-session.service.int-spec.ts` |
| D-13 | `reason` conservata dai due formatter, in produzione e fuori; `SESSION_EXPIRED` senza `reason` | `src/graphql/format-domain-error.spec.ts`, `src/graphql/production-errors.spec.ts`, `src/graphql/production-surface.int-spec.ts` |

Il boot reale `test/app.int-spec.ts` monta `UserRoleChangesPublisher`, `SessionRevocationService` e `WsSessionRegistry`, conferma la whitelist degli handler invariata e lo schema invariato.

### Evidenza HARDEN-02

`test/authz/authorization-matrix.int-spec.ts` gira sul **boot reale di `AppModule`** (`test/harness/real-app-boot.ts`, server in ascolto per il WS) ed è alimentata da `test/authz/expected-handlers.ts`, le stesse liste che `test/app.int-spec.ts` confronta coi metadati dei resolver (un handler nuovo senza fixture in `test/authz/handler-fixtures.ts` fa fallire la suite; `test/authz/handler-fixtures.spec.ts` valida i 30 documenti contro `src/schema.gql`). Attaccanti con sessioni vere, vittime vere (personaggio, PendingQuest, QuestResult). 85 casi, conteggi da `17-08-SUMMARY.md`:

| Gruppo | Handler | Casi | Esito |
|--------|---------|------|-------|
| innkeeper × `adventurer` / `guard` | 11 (10 HTTP + 1 subscription) | 22 | `FORBIDDEN` |
| innkeeper × nessun bearer / bearer non JWT / firmato con altro secret, HTTP | 10 | 30 | `UNAUTHENTICATED` |
| innkeeper × nessun bearer / bearer non JWT, WS | `connection_init` | 2 | close `4403 Forbidden` |
| ownership × `adventurer` sulla risorsa altrui | 19 (17 HTTP + 2 subscription) | 19 | `FORBIDDEN` |
| owner-only × `innkeeper` | 8 (7 HTTP + 1 subscription) | 8 | `FORBIDDEN` |
| completezza delle righe | — | 2 | chiavi = liste unite |
| controlli positivi | — | 2 | proprietario e innkeeper serviti |

Ogni rifiuto è un `toEqual({ code: 'FORBIDDEN' })` (o `UNAUTHENTICATED`) sull'intero `extensions`, un solo errore per risposta. Per rieseguirla:

```bash
npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand
```

---

## 3. Note per le UAT della FE Phase 12

### 3.1 UAT dual-device (D-09, D-16)

- Telefono + emulatore, **stesso account Twitch reale**, login reale su entrambi.
- Il secondo login caccia il primo: il socket del primo device viene chiuso con `4409 newLogin` in pochi ms; il suo refresh successivo è rifiutato con `SESSION_REVOKED` + `reason: newLogin`.
- **Un solo processo BE.** Il registro dei socket è per processo: il «secondo BE per gli sweep» delle UAT passate va spento, altrimenti i socket aperti sull'altro processo restano vivi fino al `4401`.
- Il dev bypass non ha sessioni e non partecipa alla prova.
- Se il token dev resta attivo in UAT, `DEV_AUTH_TWITCH_ID` deve essere **distinto** dal `<twitchId reale>`: altrimenti un `DEV_AUTH_ROLE` diverso dal ruolo a DB cambierebbe il ruolo dell'utente reale e revocherebbe le sue sessioni con `roleChanged`.
- Prova di `roleChanged`: cambiare a mano il `role` dell'utente `<userId>` a DB con un aggiornamento del solo campo (`updateOne` con `$set` su `role`, non un replace del documento) → entrambi i device ricevono `4409 roleChanged` e il refresh è rifiutato con `reason: roleChanged`. Riportare poi il ruolo al valore originale (secondo evento, nuova revoca: rifare il login).

### 3.2 UAT della release via tunnel TLS (D-16)

- Tunnel (cloudflared o ngrok) verso il BE locale: **nessuna modifica BE**.
- `TWITCH_REDIRECT_URI` = `https://<host-del-tunnel>/auth/twitch/callback` nel `.env` dell'utente, registrata **byte per byte** nella console Twitch.
- `APP_AUTH_REDIRECT_URL` resta `klimmeck://auth`.
- Il WS passa come `wss://` sul tunnel: da verificare al primo passo (RESEARCH A3).
- Il throttler (`THROTTLE_LIMIT` / `THROTTLE_TTL_MS` su login e refresh, `THROTTLE_TRUST_PROXY` spenta) vede tutte le richieste del tunnel dallo stesso IP: con due device basta.

---

## 4. Deploy

- Nessuna variabile d'ambiente nuova (`.env.example` invariato), nessuna migrazione, nessun indice nuovo, nessuna dipendenza nuova.
- Il campo `Session.revokeReason` è additivo e nullable: le sessioni revocate prima del deploy restano senza motivo e rispondono senza `reason` (refresh) o con reason `''` (close `4409`).
- Al primo login di ciascun utente dopo il deploy le sue altre sessioni attive vengono revocate (atteso).
- La PR non resta in draft (nessun one-off).
- **Runbook del boot della build finale** (a cura dell'orchestratore, mai degli esecutori), dopo la merge:
  1. `npm run build` **prima** di fermare il BE che gira da `dist/`;
  2. riavvio di **un solo** processo BE;
  3. lettura dei log di avvio: solo conteggi e nomi dei publisher (compare quello dei ruoli degli utenti), nessun token né hash;
  4. `git diff --exit-code src/schema.gql` vuoto.

---

## 5. Domande aperte e deviazioni

- **Nessuna domanda aperta** per la FE.
- Matrice: tutti gli 85 casi verdi al primo colpo (le regole di autorizzazione esistono dalle Phase 3/7); nessuna fixture corretta. L'esenzione auditata dell'innkeeper sugli handler ownership (Phase 3 D-09) non è asserita dalla matrice, per scelta: la matrice prova solo i rifiuti.
- Gate: `test:cov` completo verde al primo colpo, il ripiego per cartella non è servito; coverage di `./src/auth/` 99,86 / 87,47 / 100 / 100.
- Deviazioni minori dei piani (tutte nei SUMMARY): `DomainExtensions` come type alias invece di interface (17-01, tsc); timeout dedicato del `beforeAll` della spec D-06 (17-06); controllo del `data` del rifiuto sul campo dell'handler (17-08).
- Rumore noto nei log dei test (non funzionale): `bootRealApp().close()` cancella il database prima di chiudere l'app, e ogni change stream logga una riapertura a fine suite.
