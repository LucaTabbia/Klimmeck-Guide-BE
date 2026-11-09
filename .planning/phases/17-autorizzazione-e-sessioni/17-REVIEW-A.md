---
phase: 17-autorizzazione-e-sessioni
group: A
reviewed: 2026-11-09T17:56:02Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/auth/session/session-revoke-reason.enum.ts
  - src/auth/session/session.model.ts
  - src/auth/session/session.model.spec.ts
  - test/fixtures/session.fixture.ts
  - src/auth/auth.exception.ts
  - src/auth/auth.exception.spec.ts
  - src/graphql/format-domain-error.ts
  - src/graphql/format-domain-error.spec.ts
  - src/graphql/production-errors.ts
  - src/graphql/production-errors.spec.ts
  - src/graphql/production-surface.int-spec.ts
  - src/auth/session/session.service.ts
  - src/auth/session/session.service.int-spec.ts
  - src/auth/auth-session.service.ts
  - src/auth/auth-session.service.int-spec.ts
  - test/auth/session-revocation.int-spec.ts
findings:
  critical: 0
  warning: 0
  info: 6
  total: 6
status: issues_found
---

## Summary

Gruppo A riletto per intero, con le spec. Il contratto regge: l'enum ha i quattro valori lower camel case, `revokeReason` è un enum nullable con default null scritto sempre insieme a `revokedAt` (revoke, revokeActive, reuse; utente cancellato con `null`). `AuthException.sessionRevoked(reason)` mette la reason solo nelle `extensions` e il body Nest resta invariato. I formatter conservano solo la chiave `reason` e solo se stringa. Gli update sono tutti condizionali su `revokedAt: null`, quindi una seconda revoca non sovrascrive data e motivo. `revokeOthersOf` usa `_id` `$lt` più il filtro delle sole sessioni attive. Il JWT resta stateless e l'unica lookup è `revokeReasonOf` alla `connection_init` (una `findById` con proiezione). Lo SDL non è toccato da questo gruppo. Le spec di filo provano davvero D-02, D-03, D-04 e D-05 con asserzioni `toEqual` esatte e fixture ripulite fra i casi. Nessun finding critico né warning. Restano sei osservazioni di qualità o robustezza, tutte con scenario stretto o già coperto da una scelta documentata.

## Critical

Nessuno.

## Warning

Nessuno.

## Info

### A-IN-01: `revokeActive` restituisce anche gli id che l'`updateMany` non ha toccato

**File:** `src/auth/session/session.service.ts:164-179`
**Issue:** gli id restituiti sono quelli letti dalla `find` dei candidati, non quelli effettivamente modificati dall'`updateMany`. Scenario: fra la `find` e l'`updateMany` un logout concorrente scrive `userLogout` su una delle sessioni candidate. L'`updateMany` la salta, per via del filtro `revokedAt: null`. L'id viene comunque restituito a `SessionRevocationService`, che chiama `registry.closeSessions(ids, newLogin)` e chiude il socket vivo con `4409 newLogin`. A DB resta `userLogout`.
**Why it matters:** la sessione è revocata in ogni caso, quindi non c'è un buco di sicurezza. Cambia solo la reason sul filo, e solo con una finestra di corsa di pochi millisecondi. La riconnessione trova poi la reason di DB, quindi il FE vede due motivi diversi per la stessa sessione.
**Suggested fix:** filtrare gli id realmente scritti. Dopo l'`updateMany`, rileggere `find({ _id: { $in: ids }, revokedAt: now, revokeReason: reason }, { _id: 1 })` e restituire quelli. In alternativa usare l'esito `modifiedCount` quando coincide con `ids.length` e rileggere solo in caso contrario. Spec RED prima: stub del modello che fra `find` e `updateMany` revoca una candidata con `userLogout`, e attesa che l'id restituito non la contenga.

### A-IN-02: l'ordinamento per `_id` come criterio «ultimo login» vale solo in un processo

**File:** `src/auth/session/session.service.ts:119-130`
**Issue:** `revokeOthersOf` considera «più vecchia» ogni sessione con `_id` minore. Un ObjectId ordina per secondo, poi per valore casuale del processo, poi per contatore. Con due processi BE nello stesso secondo, un login successivo può avere `_id` minore del precedente. In quel caso non revoca la sessione che dovrebbe cacciare, e restano due sessioni attive (D-02 violata).
**Why it matters:** il registro dei socket è già dichiarato single-node (D-03), quindi oggi non è raggiungibile. Il vincolo però non è scritto accanto al criterio di D-12.
**Suggested fix:** aggiungere al commento di D-12 «ordine valido con un solo processo BE». Se un giorno nasce un secondo nodo, passare a un criterio su `createdAt` (già presente con `timestamps: true`) con `_id` come spareggio. Nessuna spec ora.

### A-IN-03: `revoke` usa `Types.ObjectId.isValid`, le altre guardie `isObjectIdHex`

**File:** `src/auth/session/session.service.ts:93`
**Issue:** `Types.ObjectId.isValid` accetta anche stringhe di 12 caratteri qualsiasi, mentre `revokeOthersOf`, `revokeAllOf` e `revokeReasonOf` usano `isObjectIdHex` (24 caratteri esadecimali). Una stringa di 12 caratteri passerebbe la guardia e Mongoose la convertirebbe in un ObjectId diverso da quello atteso.
**Why it matters:** il `sessionId` arriva sempre dal claim `sid` di un JWT firmato, quindi oggi non è raggiungibile. È solo un'incoerenza fra guardie nello stesso file.
**Suggested fix:** sostituire con `if (!isObjectIdHex(sessionId)) return;`. La spec esistente su `'not-an-object-id'` resta valida. Aggiungere un caso con `'abcdefghijkl'` per fissare il comportamento.

### A-IN-04: l'allowlist di `reason` non è legata a `SESSION_REVOKED` né ai valori dell'enum

**File:** `src/graphql/format-domain-error.ts:48-51`, `src/graphql/production-errors.ts:57-60`
**Issue:** `extensionsOf` conserva qualunque `reason` stringa di qualunque `HttpException` con `extensions.code`, e `sanitizeFormattedError` la conserva per ogni codice non interno. Oggi solo `AuthException.sessionRevoked` la produce, ma una futura eccezione di dominio con `extensions.reason` (testo libero, magari con dettagli interni) uscirebbe in produzione senza che nessun test fallisca. La spec `keeps only the reason among the extensions...` certifica proprio che `reason: 'probe'` su `PROBE_CODE` passi.
**Why it matters:** è difesa in profondità sul canale che D-13 voleva stretto. Il rischio è nel futuro, non nel codice attuale.
**Suggested fix:** conservare la reason solo quando `code === AuthErrorCode.SESSION_REVOKED` e il valore è in `Object.values(SessionRevokeReason)`. Spec RED prima: la `reason` di `PROBE_CODE` viene scartata e una `reason: 'zzz'` su `SESSION_REVOKED` viene scartata. Va adattato di conseguenza il test `keeps only the reason...`, che oggi prova il contrario.

### A-IN-05: `issueForUser` lascia a DB la sessione appena creata se la revoca fallisce

**File:** `src/auth/auth-session.service.ts:27-34`, `src/auth/auth-session.service.int-spec.ts:175-190`
**Issue:** se `revokeOthersOnLogin` solleva, la sessione nuova resta attiva a DB ma il suo refresh token non arriva mai al client. Il commento dice che «scade da sola», cioè dopo il TTL del refresh (30 giorni, nessun TTL breve). La spec `fails the login when the revocation fails` sostituisce l'intero `revokeOthersOnLogin` con un mock. Prova la propagazione dell'errore, ma non lo stato lasciato a DB né l'assenza di un token restituito.
**Why it matters:** la sessione orfana è inutilizzabile, perché il token non è mai stato consegnato, e il login successivo la revoca (ha l'`_id` più basso). Il costo è un documento in più per 30 giorni per ogni fallimento.
**Suggested fix:** o si accetta e si corregge il commento («resta attiva fino al TTL; il login successivo la revoca»), o si fa una revoca best-effort della nuova sessione nel ramo di errore, con `revoke(sessionId, null)` e sempre rilancio dell'errore originale. Nel secondo caso scrivere prima la spec: dopo il fallimento la sessione appena creata ha `revokedAt` valorizzato.

### A-IN-06: fragilità e buchi della prova di filo

**File:** `test/auth/session-revocation.int-spec.ts:22,149-160`, `src/graphql/production-surface.int-spec.ts:211-224`
**Issue:**
1. Il test di logout dimostra «nessuna chiusura» con una finestra fissa di 300 ms (`LOGOUT_SILENCE_MS`). Un fan-out che chiudesse dopo 300 ms (event loop carico, CI lenta) passerebbe come falso verde. Lo stesso costo di tempo fisso si paga a ogni run.
2. Su filo manca la `connection_init` con il JWT di una sessione `reuseDetected`, che è il caso D-03/OQ3 citato nel brief. Il test di logout copre solo `userLogout`.
3. In `production-surface` la reason su graphql-ws in produzione è provata solo a livello unitario (`production-errors.spec.ts:199`), non sul filo. Il caso HTTP è provato.

**Why it matters:** non sono bug. Il punto 1 è una prova per assenza con tempo fisso, e i punti 2 e 3 sono percorsi coperti solo indirettamente.
**Suggested fix:**
1. Dopo il logout, verificare anche che il socket sia ancora registrato e aperto (`socket.readyState === WebSocket.OPEN`) e ridurre la finestra, oppure chiudere il socket a mano e verificare che la `connection_init` successiva sia rifiutata (già presente). La finestra resta solo come sanity check.
2. Aggiungere un caso: far scattare il reuse con un token ritirato oltre la grace, poi `connectAndAwaitClose` con il JWT, attendendo `{ code: 4409, reason: 'reuseDetected', acknowledged: false }`.
3. Aggiungere un caso su `subscribeOnce` in produzione con una sessione revocata, oppure documentare che la copertura unitaria basta.

---

_Reviewed: 2026-11-09T17:56:02Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
