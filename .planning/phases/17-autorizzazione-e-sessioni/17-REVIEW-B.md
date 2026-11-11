---
phase: 17-autorizzazione-e-sessioni
group: B
reviewed: 2026-11-09T12:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/auth/ws/ws-close-codes.ts
  - src/auth/ws/ws-session-registry.ts
  - src/auth/ws/ws-session-registry.spec.ts
  - src/auth/ws/ws-connection-authenticator.ts
  - src/auth/ws/ws-connection-authenticator.spec.ts
  - test/auth/ws-auth.int-spec.ts
  - src/auth/session/session-revocation.service.ts
  - src/auth/session/session-revocation.service.int-spec.ts
  - src/auth/session/user-role-changes.publisher.ts
  - src/auth/session/user-role-changes.publisher.spec.ts
  - src/auth/session/user-role-changes.publisher.int-spec.ts
  - test/harness/role-watcher.ts
  - src/auth/auth.module.ts
  - src/users/user-updated.subscription.int-spec.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 17: Code Review Report, gruppo B

**Reviewed:** 2026-11-09
**Depth:** standard
**Files Reviewed:** 14

## Summary

Il gruppo B regge. L'ordine di `onConnect` è quello di D-03: bearer, `extra.closed`, `register`, `revokeReasonOf`, `extra.closed`, timer. Il timer non viene mai armato dopo un rifiuto 4409. `onClose` è l'unico hook cablato e svuota il registro. Il fan-out scrive prima a DB e poi chiude i socket, senza try/catch, quindi un errore DB lascia i socket aperti. Il watcher usa solo `documentKey` e non ha `updateLookup` né `onHistoryLost`. Il suo `.catch` logga solo id e `describeError`. È un provider di `AuthModule`, senza cicli DI. Lo SDL è invariato (`git diff 31dba96 -- src/schema.gql` è vuoto). Non ho trovato `Math.random`, `process.env`, `jest.mock(` o rete nei file del gruppo.

Il 4403 su errore DB della lookup è la decisione fail-closed di RESEARCH, non un finding.

Sulla race `find`/`updateMany` di `revokeActive`: il difetto sta in `session.service.ts` (gruppo A) e lo segnalo solo lì. Qui la reason passata a `closeSessions` è quella del chiamante, coerente con ciò che viene scritto a DB.

Restano due debolezze reali:
- La prova di assenza del watcher poggia su una barriera che non garantisce l'ordine (B-WR-01).
- Un evento di ruolo tardivo può revocare una sessione appena emessa (B-WR-02).

Più tre punti di qualità o copertura.

## Critical

Nessuno.

## Warning

### B-WR-01: la barriera `flushRoleWatcher` non garantisce che gli eventi precedenti siano stati elaborati

**File:** `test/harness/role-watcher.ts:111` e `src/auth/session/user-role-changes.publisher.ts:42-52`
**Issue:** Il commento dice che alla revoca della barriera «ogni evento precedente è già stato elaborato». `onChange` però è fire-and-forget: ogni evento avvia `revokeAllForRoleChange` (una `find` e poi una `updateMany`) senza attendere il precedente. Le catene di due eventi consecutivi girano quindi in concorrenza, e quella dell'evento N+1 (la barriera) può terminare prima di quella dell'evento N.
**Why it matters:** Le tre prove di assenza («stesso ruolo», «altro campo», «altri utenti e già revocate»; int-spec `:140-203`) usano `flushRoleWatcher` come unica garanzia. Se la revoca spuria arriva dopo la barriera, il test passa lo stesso. La prova diventa vuota proprio dove deve provare che non succede nulla. L'esposizione è piccola (le due catene hanno la stessa forma e partono in ordine), ma il commento promette più di quanto il codice dia.
**Suggested fix:** Serializzare le revoche nel publisher, con un effetto utile anche in produzione (ordine di rivocazione deterministico):
```ts
private tail: Promise<void> = Promise.resolve();
protected onChange(change: ChangeStreamEvent): void {
    const userId = documentIdOf(change.documentKey);
    if (!userId) return;
    this.tail = this.tail
        .then(() => this.revocation.revokeAllForRoleChange(userId))
        .catch((error: unknown) =>
            this.logger.error(`... ${describeError(error)}`),
        );
}
```
Spec RED prima, nel `user-role-changes.publisher.spec.ts`: due `onChange` con la prima `revokeAllForRoleChange` ritardata (promise controllata). Asserire che la seconda parte solo dopo che la prima è risolta e che un rifiuto della prima non salta la seconda. In alternativa, restando sui soli test, far attendere a `flushRoleWatcher` anche una seconda revoca-barriera, ma la serializzazione è la correzione vera.

### B-WR-02: un evento di cambio ruolo tardivo revoca anche la sessione emessa dopo il cambio

**File:** `src/auth/session/session-revocation.service.ts:26-32`, `src/auth/session/user-role-changes.publisher.ts:42-52`
**Issue:** `revokeAllForRoleChange` revoca ogni sessione attiva dell'utente, senza un limite temporale legato all'evento. Il token di ripresa è in memoria (`resumeToken`), e dopo una caduta dello stream l'evento viene consegnato alla riapertura, dopo il backoff.
Scenario: il ruolo cambia a T, lo stream è giù per N secondi, l'utente fa login a T+1 e ottiene un JWT con il ruolo nuovo. Alla riapertura arriva l'evento di T e la sessione nuova viene revocata con `roleChanged`. L'utente viene espulso senza motivo e al primo refresh trova `SESSION_REVOKED`. Lo stesso accade, con finestra di millisecondi, senza cadute dello stream.
**Why it matters:** È un logout spurio, non un buco di sicurezza (la direzione è fail-closed). È raggiungibile con un'operazione manuale concorrente a un login. Il costo di evitarlo è basso.
**Suggested fix:** Limitare la revoca alle sessioni create prima dell'evento. Il watcher legge `clusterTime` dall'evento (aggiungerlo a `ChangeStreamEvent`) e passa a `revokeAllOf` un limite `_id` o `createdAt` minore. Serve una modifica in `session.service.ts` (gruppo A), da coordinare. Spec RED prima, nella int-spec del watcher: sessione creata dopo `setRoleByHand` ma con l'evento ancora in volo (ritardato con un `await` sul publisher) deve restare attiva. Se si preferisce accettare il rischio, documentarlo nel handoff come limite noto accanto a D-10.

## Info

### B-IN-01: nessuna prova che un socket rifiutato con 4409 esca dal registro

**File:** `test/auth/ws-auth.int-spec.ts:195-231` e `src/auth/ws/ws-connection-authenticator.spec.ts:187-220`
**Issue:** Alla `connection_init` di una sessione revocata il socket viene registrato prima della lettura (`ws-connection-authenticator.ts:83`), poi chiuso con 4409 e `return false`. Il tolto-dal-registro dipende interamente dal fatto che graphql-ws invochi `onClose` anche per le connessioni rifiutate (probe P2). La unit non chiama `onClose` dopo il rifiuto. La int-spec `forgets a socket closed by the client` copre solo il socket accettato. Un aggiornamento di graphql-ws che cambi questo comportamento farebbe crescere il registro senza che nessun test si rompa.
**Why it matters:** Il leak sarebbe silenzioso: un'entry per ogni tentativo con un JWT revocato.
**Suggested fix:** Spec RED nella int-spec «connection_init of a revoked session»: dopo `connectAndAwaitClose` del bearer di una sessione dopo logout, `await waitUntilUnregistered(registry, sessionId)` deve dare `true`. Nella unit: `onConnect` con sessione revocata, poi `onClose(context)` e `registry.unregister` chiamato con `('session-1', socket)`.

### B-IN-02: `closeSessions` non isola il fallimento di un singolo socket

**File:** `src/auth/ws/ws-session-registry.ts:34-39`
**Issue:** Se `socket.close` lancia, il ciclo si interrompe: i socket successivi e le sessioni successive restano aperti e registrati (la `delete` non è raggiunta). L'eccezione risale a `revokeOthersOnLogin`, quindi un login già revocato a DB fallisce per un problema del layer WS. Con codice 4409 e reason dell'enum `ws` non lancia, quindi non è raggiungibile oggi: è robustezza.
**Why it matters:** Il fan-out non deve poter rompere il login dopo che la revoca a DB è stata scritta.
**Suggested fix:** `try { socket.close(...) } catch { /* il socket è già andato: onClose lo toglierà */ }` per socket e `delete` fuori dal ciclo interno. Spec RED nel registry: un socket il cui `close` lancia non impedisce la chiusura del secondo e la sessione risulta dimenticata. Il try/catch ammette un commento solo per il «perché».

### B-IN-03: spec che mescolano due comportamenti e poll con numeri magici

**File:** `src/auth/ws/ws-session-registry.spec.ts:63-81` e `test/auth/ws-auth.int-spec.ts:39-40,55-66`
**Issue:** `forgets a socket that closed by itself` verifica due comportamenti in un test solo: `closeSessions` che salta il socket tolto, e `unregister` che svuota la sessione quando il Set resta vuoto, con un secondo registry creato a metà. Se il secondo fallisce, il titolo non dice quale. `waitUntilUnregistered` ha un budget fisso di 2 s (100 × 20 ms) con ultima lettura dopo il ciclo: va bene, ma le due costanti e `POLL_INTERVAL_MS` di `role-watcher.ts` ripetono lo stesso schema di poll in tre punti (`waitForRevocation`, `waitUntilUnregistered`, il priming).
**Why it matters:** Solo manutenzione: nessun rischio di correttezza.
**Suggested fix:** Spezzare il test del registry in due `it`. Estrarre un helper `pollUntil(predicate, { intervalMs, attempts })` in `test/harness/` e riusarlo nei tre punti.

---

_Reviewed: 2026-11-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
