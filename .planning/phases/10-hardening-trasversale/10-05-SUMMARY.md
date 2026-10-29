---
phase: 10-hardening-trasversale
plan: 05
subsystem: validation
tags: [validazione, class-validator, pipe-globale, D-01, D-02, D-03, D-04, BE-HARD-01]
requires: []
provides:
  - "dipendenze: class-validator 0.15.1, class-transformer 0.5.1, @nestjs/throttler 6.7.1 (package.json `^0.15.1`, `^0.5.1`, `^6.7.1`)"
  - "src/validation/bad-user-input.exception.ts: BAD_USER_INPUT = 'BAD_USER_INPUT'; class BadUserInputException extends BadRequestException { readonly code; readonly extensions = { code }; constructor(readonly fields: readonly string[]); static of(fields) } con messaggio `Input non valido: <campi>`"
  - "src/validation/invalid-fields.ts: invalidFieldsOf(errors: readonly ValidationError[], parent = ''): string[]"
  - "src/validation/validation-pipe.factory.ts: createValidationPipe(): ValidationPipe ({ whitelist: true, forbidNonWhitelisted: false, transform: true, exceptionFactory → BadUserInputException con percorsi deduplicati })"
  - "src/validation/is-object-id-hex.decorator.ts: IsObjectIdHex(options?: ValidationOptions): PropertyDecorator (vincolo `isObjectIdHex`, `each` supportato), OBJECT_ID_HEX_MESSAGE = 'id non valido'"
  - "src/validation/object-id.pipe.ts: MAX_ID_LIST = 100; ObjectIdPipe (campo = metadata.data ?? 'id'); ObjectIdListPipe (campo = metadata.data ?? 'ids')"
  - "src/validation/validation.module.ts: ValidationModule ({ provide: APP_PIPE, useFactory: createValidationPipe }), NON montato in AppModule né in createAuthTestApp"
  - "test/validation/validation-probe.resolver.ts: ValidationProbeResolver, ValidationProbeInput, ValidationProbeItem, UndecoratedProbeInput (solo test)"
affects: [10-06, 10-08, 10-09, 10-10, 10-12, 10-13]
tech-stack:
  added: [class-validator@0.15.1, class-transformer@0.5.1, "@nestjs/throttler@6.7.1"]
  patterns:
    - "pipe globale come provider APP_PIPE in un modulo condiviso da app e harness, mai in main.ts"
    - "messaggi di validazione costruiti solo dai percorsi dei campi (vincolo del padre incluso), mai valori o messaggi dei vincoli"
    - "argomenti scalari id protetti da @Args('<nome>', ObjectIdPipe): la pipe globale non valida gli scalari"
key-files:
  created:
    - src/validation/bad-user-input.exception.ts
    - src/validation/bad-user-input.exception.spec.ts
    - src/validation/invalid-fields.ts
    - src/validation/invalid-fields.spec.ts
    - src/validation/validation-pipe.factory.ts
    - src/validation/validation-pipe.factory.spec.ts
    - src/validation/is-object-id-hex.decorator.ts
    - src/validation/is-object-id-hex.decorator.spec.ts
    - src/validation/object-id.pipe.ts
    - src/validation/object-id.pipe.spec.ts
    - src/validation/validation.module.ts
    - src/validation/validation-pipe.int-spec.ts
    - test/validation/validation-probe.resolver.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Costante esportata BAD_USER_INPUT usata per code, extensions e risposta; factory statica BadUserInputException.of accanto al costruttore"
  - "ObjectIdListPipe usa 'ids' come nome di ripiego quando l'argomento non ha nome (ObjectIdPipe usa 'id')"
  - "Con target esnext ogni campo dichiarato (anche opzionale e decorato) diventa una chiave propria dell'istanza trasformata, valorizzata a undefined se assente: la spec della factory usa un DTO con il solo id per provare lo scarto"
metrics:
  duration: "~20 min"
  completed: 2026-10-29
  tasks: 2
  files: 15
---

# Phase 10 Plan 05: primitive della validazione e ValidationModule Summary

Nucleo di BE-HARD-01: dipendenze della fase installate con npm, eccezione codificata `BadUserInputException` (`BAD_USER_INPUT`, messaggio `Input non valido: <percorsi>` senza valori), raccoglitore `invalidFieldsOf` che tiene anche il vincolo del padre, factory unica `createValidationPipe` (`whitelist`, `transform`, nessun rifiuto dei campi ignoti), decoratore `@IsObjectIdHex()` e pipe `ObjectIdPipe`/`ObjectIdListPipe` (solo esadecimale minuscolo a 24, liste ≤ 100), `ValidationModule` che registra la pipe come `APP_PIPE`, provato sul filo con un resolver sonda e un harness dedicato. Il modulo non è montato in `AppModule` né in `createAuthTestApp` (piano 10-08, dopo la decorazione degli input del 10-06).

## Task eseguiti

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 (deps) | dipendenze della fase | `ebd3d6b` | `package.json`, `package-lock.json` |
| 1 (RED) | cinque spec delle primitive | `356ab26` | `src/validation/*.spec.ts` |
| 1 (GREEN) | primitive della validazione | `29caa63` | `bad-user-input.exception.ts`, `invalid-fields.ts`, `validation-pipe.factory.ts`, `is-object-id-hex.decorator.ts`, `object-id.pipe.ts` (+ correzione della spec della factory) |
| 2 (RED) | int-spec e resolver sonda | `10ac15e` | `src/validation/validation-pipe.int-spec.ts`, `test/validation/validation-probe.resolver.ts` |
| 2 (GREEN) | `ValidationModule` | `95da52c` | `src/validation/validation.module.ts` |

## TDD

- **RED Task 1:** le 5 suite fallivano per modulo mancante (`Could not locate module src/validation/invalid-fields …`), 0 test eseguiti.
- **GREEN Task 1:** primo giro 21/22: `strips undeclared properties and transforms plain inputs (D-01)` riceveva le chiavi `id, items` (vedi deviazione 1); dopo la correzione della spec 5 suite / 22 verdi; `npm run build` esce 0.
- **RED Task 2:** la int-spec falliva per modulo mancante (`Could not locate module src/validation/validation.module`). Controprova a mano (non committata): con `ValidationModule` privo del provider 5 casi su 7 rossi; verdi senza pipe globale `rejects a malformed scalar id argument with BAD_USER_INPUT (D-02)` e `passes a well-formed scalar id argument through (D-02)`, perché `ObjectIdPipe` è una pipe di parametro e non dipende dal modulo.
- **GREEN Task 2:** int-spec 1 suite / 7 verdi; unit `src/validation` 5 suite / 22; `npm run build` esce 0; `test/app.int-spec.ts` 51/51 (boot reale intatto); `git diff --exit-code src/schema.gql` esce 0, righe rimosse contro `origin/develop`: 0.

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 1 - Bug nel test] Il DTO della spec della factory aveva un campo opzionale dichiarato**
- **Trovato durante:** Task 1 (GREEN)
- **Problema:** con `target: esnext` (semantica `useDefineForClassFields`) `plainToInstance` crea una chiave propria per ogni campo dichiarato, anche se assente nell'input; `items?` decorato restava fra le chiavi (valore `undefined`), quindi `Object.keys(...).sort()` dava `['id', 'items']`.
- **Correzione:** il caso dello scarto usa un `StripProbeDto` con il solo `id`; il caso del rifiuto continua a usare `ProbeDto` con `items`. Il comportamento di produzione è quello atteso (la whitelist cancella le chiavi senza decoratori).
- **File:** `src/validation/validation-pipe.factory.spec.ts`
- **Commit:** `29caa63`

**2. [Rule 3] Il lockfile perde 6 voci `node_modules/` di dipendenze peer opzionali**
- **Trovato durante:** Task 1 (installazione)
- **Problema:** il criterio `git diff … package-lock.json | grep -cE '^-\s+"node_modules/'` = 0 non regge: npm 11.20.0 normalizza il lockfile togliendo le peer opzionali non installate `gcp-metadata@5.3.0` (con i suoi `agent-base`, `gaxios`, `https-proxy-agent` annidati) e le copie annidate di `gcp-metadata`/`google-logging-utils` sotto `mongodb-memory-server-core`, aggiunge `engines` alla radice (già presente in `package.json`) e toglie alcuni flag `dev` di voci opzionali.
- **Verifica:** nessuna è una dipendenza reale dell'albero installato (`npm ls gcp-metadata` mostra solo la 9.2.1 di `google-auth-library`); `npm ci --dry-run --ignore-scripts` legge il lockfile senza errori; `npm run build` esce 0. Aggiunte: `@nestjs/throttler`, `class-transformer`, `class-validator`, `@types/validator`, `libphonenumber-js`, `validator`.
- **Commit:** `ebd3d6b`

**3. Casi in più rispetto al `<behavior>`:** `exposes the invalid fields and builds the same exception from the factory (D-03)`, `uses a constant constraint message that never echoes the value (D-03)`, `validates every entry of a list with each (D-02)`, `names the argument it guards and falls back to id (D-03)`, `passes a well-formed scalar id argument through (D-02)` (int-spec: 7 casi, il piano ne chiede almeno 6).

**4. Commento senza il letterale del decoratore Mongo:** il commento di `is-object-id-hex.decorator.ts` parla del «decoratore Mongo di class-validator» invece di nominarlo, per non avvicinarsi al letterale di gate vietato nel codice di produzione.

## Fatti per i piani successivi

- `BadUserInputException` si importa da `src/validation/bad-user-input.exception`; `fields` è pubblico; il codice sopravvive alla riscrittura di Nest grazie a `formatDomainError` (verificato sul filo: `extensions` esattamente `{ code: 'BAD_USER_INPUT' }`).
- Con la pipe montata, una classe di input senza alcun decoratore class-validator arriva all'handler come oggetto vuoto (provato da `strips every property of an input class without validators (whitelist)`); nessun errore `unknownValue`.
- Ogni campo dichiarato e decorato ma assente nell'input diventa una chiave propria `undefined` dell'istanza trasformata (target esnext): un servizio che fa spread dell'input in un update o usa `'campo' in input` va controllato al montaggio del 10-08.
- Le guard girano prima delle pipe: un non autenticato riceve `UNAUTHENTICATED` prima di qualsiasi validazione (T-10-18, accettata).

## Threat model

- T-10-15: mitigata (`whitelist: true`; `strips a declared field without validators before the handler (D-01)`).
- T-10-16: mitigata (`@IsObjectIdHex()` e `ObjectIdPipe`/`ObjectIdListPipe` su `isObjectIdHex`; tabella del decoratore con maiuscolo, 12 caratteri, numero e null rifiutati).
- T-10-17: mitigata (`never reports a value (D-03)`, messaggio costante del decoratore, messaggio sul filo con soli percorsi).
- T-10-18: accettata come da piano.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: i 13 file creati in `src/validation/` e `test/validation/`
- FOUND: commit `ebd3d6b`, `356ab26`, `29caa63`, `10ac15e`, `95da52c`
- `grep -c "ValidationModule" src/app.module.ts test/auth/auth-test-app.ts` → 0 e 0; `useGlobalPipes` in `src/main.ts` → 0
- `git diff --exit-code src/schema.gql` esce 0
