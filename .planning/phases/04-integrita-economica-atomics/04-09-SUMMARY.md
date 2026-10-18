---
phase: 04-integrita-economica-atomics
plan: 09
subsystem: economy
tags: [gate, regression, handoff, backend-notes, traceability, validation]
requires:
  - 04-01 … 04-08 (tutta la fase)
provides:
  - "Gate di fase verde: unit 54/625, integration 41/472, build, eslint/prettier sui 58 file toccati, schema senza drift, invarianti grep"
  - ".planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md: handoff BE → FE e BE → fasi 6/7/8/9 (D-16)"
  - "REQUIREMENTS: BE-ATOM-01..05 [x] e traceability Complete"
  - "04-VALIDATION.md firmato (status validated, nyquist_compliant, wave_0_complete)"
affects: [FE shop, FE Phase 6, FE Phase 8, BE Phase 6, BE Phase 7, BE Phase 8, BE Phase 9]
tech-stack:
  added: []
  patterns:
    - "Gate di fase: suite completa + build + lint per lista esplicita di file + schema diff contro develop + grep degli invarianti"
key-files:
  created:
    - .planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/phases/04-integrita-economica-atomics/04-VALIDATION.md
decisions:
  - "Il grep 'scrittori dei saldi' del plan va eseguito con grep -F: tra doppi apici la shell trasforma \\$ in $ (ancora regex) e il pattern $inc non trova wallet.service.ts; con -F risultano esattamente coins.expressions.ts e wallet.service.ts"
  - "Le scritture twitchPoints: 0 in users.service.ts sono $setOnInsert alla creazione dell'utente (valore iniziale), non movimenti di saldo: fuori dal perimetro di D-04"
metrics:
  duration: ~6 min
  completed: 2026-10-18
  tasks: 2
  files: 3
---

# Phase 4 Plan 09: Gate trasversale e handoff Summary

Gate di fine fase tutto verde (unit 54/625, integration 41/472 con Redis reale, build, eslint 0 errori e prettier pulito sui 58 file `.ts` toccati, `src/schema.gql` byte-identico a `develop`, nessun read-modify-write residuo); `BACKEND-NOTES.md` consegnato al FE e alle fasi BE 6/7/8/9 con contratto invariato, 15 codici + NOT_FOUND/FORBIDDEN/UNAUTHENTICATED, regole di prezzo e primitive; BE-ATOM-01..05 Complete; `04-VALIDATION.md` firmato.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Gate di regressione e invarianti "mai read-modify-write" | nessun commit (tutto verde, nessuna correzione) |
| 2 | BACKEND-NOTES.md + traceability BE-ATOM-01..05 | d0e5206 |
| — | Sign-off di 04-VALIDATION.md (richiesto dall'orchestratore) | 50eac10 |

## Gate (Task 1)

| Comando | Risultato | Tempo |
| ------- | --------- | ----- |
| `npm run test:unit` | 54 suite / 625 test passed, exit 0 | 3.1 s |
| `npm run test:int` (`--runInBand`) | 41 suite / 472 test passed, exit 0 (incl. `test/app.int-spec.ts` boot reale e `spell-recovery.processor.int-spec.ts` con Redis reale) | 66 s |
| `npm run build` | exit 0 | 5.4 s |
| `git diff --exit-code develop -- src/schema.gql` (dopo il boot reale) | 0; anche `git diff --exit-code src/schema.gql` = 0 | — |
| `npx eslint` sui 58 file di `git diff --name-only --diff-filter=d develop...HEAD -- '*.ts'` | 0 errori, 11 warning pre-esistenti (change stream in `CharactersService.onModuleInit`, non toccato) | — |
| `npx prettier --check` sugli stessi 58 file | "All matched files use Prettier code style!" | — |

Invarianti:

| Invariante | Atteso | Ottenuto |
| ---------- | ------ | -------- |
| `grep -n "\.save()"` in `characters.service.ts` + `spell-recovery.processor.ts` | vuoto | vuoto (`grep -c "\.save("` = 0) |
| `grep -rn normalizeCoins src test`; `test -f src/utils.ts` | vuoto; exit 1 | vuoto; exit 1 |
| `Date.now()` in `characters.service.ts`; `randomUUID()` count | vuoto; 1 | vuoto; 1 |
| `BadRequestException` in `characters.service.ts` | vuoto | vuoto |
| `activeSpell()` in src/test | vuoto | vuoto |
| scrittori di `$inc: { twitchPoints` / `'status.coins': {` (non spec) | solo `coins.expressions.ts`, `wallet.service.ts` | con `grep -F`: esattamente quei due (vedi Deviations) |
| `registerEnumType` in `src/gameRules src/economy src/quests/acceptance` | vuoto | vuoto |
| `await this.pubSub.publish` / `await pubSub.publish` | vuoto | vuoto |
| `git log develop..HEAD --format=%B \| grep -ci co-authored-by` | 0 | 0 |

File `.ts` toccati dalla fase (58): `src/app.module.ts`, `src/authz/audit/admin-audit.int-spec.ts`, `src/authz/audit/admin-audit.interceptor.spec.ts`, `src/authz/resource-not-found.exception{,.spec}.ts`, `src/characters/{archived-character-visibility.int-spec,character-id,character-id.spec,characters-ownership.int-spec,characters.module,characters.resolver,characters.service,characters.service.spec,spell-recovery.processor,spell-recovery.processor.archived.int-spec,spell-recovery.processor.cap.int-spec,spell-recovery.processor.int-spec}.ts`, `src/characters/equipment/equip-item.{int-spec,updates,updates.spec}.ts`, `src/characters/spells/{active-spell.updates,active-spell.updates.spec,equip-spell.int-spec,use-spell.int-spec}.ts`, `src/economy/{coins,coins.spec,coins.expressions,coins.expressions.spec,economy.module,wallet.service,wallet.service.int-spec}.ts`, `src/economy/trade/{catalog-prices.reader,catalog-prices.reader.int-spec,do-transaction.int-spec,shop-transaction.service,shop-transaction.service.int-spec,trade-inventory,trade-inventory.spec,trade-line,trade-pricing,trade-pricing.spec}.ts`, `src/gameRules/{game-rule-error-code.enum,game-rule.exception,game-rule.exception.spec}.ts`, `src/graphql/format-domain-error.spec.ts`, `src/models/character/{active-spell-slots,active-spell-slots.spec,character-status.model}.ts`, `src/mongo/document-id{,.spec}.ts`, `src/quests/acceptance/{quest-acceptance.module,quest-acceptance.service,quest-acceptance.service.int-spec}.ts`, `test/app.int-spec.ts`, `test/authz/characters-test-app.ts`, `test/fixtures/{catalog-item.fixture,fixtures.spec,index}.ts`.

## Handoff (Task 2)

`BACKEND-NOTES.md` (11 sezioni `##`): 0 TL;DR FE, 1 Contratto (SDL verbatim di `doTransaction`/`equipItem`/`equipSpell`/`unequipSpell`/`useSpell` e degli input), 2 Codici d'errore, 3 doTransaction, 4 Equip e magie attive, 5 useSpell e recovery, 6 Concorrenza: le prove, 7 Primitive per le fasi BE successive, 8 Note di deploy, 9 Impatto sul FE e divergenze, 10 Checklist (FE + pre-PR BE).

Codici documentati (con messaggio italiano verbatim, trigger e azione FE): `INSUFFICIENT_FUNDS`, `INSUFFICIENT_POINTS` (solo primitive interne), `TRANSACTION_TOTAL_MISMATCH` (→ ricaricare il catalogo), `ITEM_NOT_FOUND`, `ITEM_NOT_TRADABLE`, `ITEM_NOT_OWNED`, `INSUFFICIENT_ITEM_QUANTITY`, `INVALID_QUANTITY`, `QUEST_SLOT_BUSY` (solo primitive interne), `SPELL_NOT_KNOWN`, `SPELL_ALREADY_ACTIVE`, `MAX_ACTIVE_SPELLS_REACHED`, `SPELL_NOT_ACTIVE`, `SPELL_NO_USAGES_LEFT`, `SPELL_RECOVERY_UNAVAILABLE`, più `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` invariati.

Contenuti richiesti presenti: nessun documento FE cambia (verificato in sola lettura su `lib/graphql/mutations/character_mutations.dart`, repo FE con `git status --porcelain` invariato); `usages` ignorato/deprecato per FE Phase 8; `unequipSpell` NOT_FOUND → `SPELL_NOT_ACTIVE`; `equipItem` → `ITEM_NOT_OWNED`; divergenze FE (prezzo nullo → `ITEM_NOT_TRADABLE`, `canAfford` a `transaction_modal.dart:71`, doppio `characterUpdated`); firme verbatim di `WalletService` e `QuestAcceptanceService.accept`; note Phase 6/7/8/9 e Pitfall 1 (`objectIdFromHex`); A1 (`waitingTimeOf`), A2 (scambio vuoto no-op), A3 (`$toInt` ≈ 214 748 oro), A4/D-19 (replica set, blocker aperto), A6 (query di controllo dati legacy).

Traceability: `gsd-tools requirements mark-complete BE-ATOM-01..05` → 5 checkbox `[x]` e 5 righe `| BE-ATOM-0N | Phase 4 | Complete |`; diff di `REQUIREMENTS.md` limitato a quelle 10 righe.

Validation: `04-VALIDATION.md` con 20 righe `✅ / ✅ green`, Wave 0 e Sign-Off spuntati, frontmatter `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true`, `validated: 2026-10-18`, `**Approval:** approved 2026-10-18`, più una riga di evidenza con i numeri del gate.

## Deviations from Plan

### Auto-fixed Issues

None: nessun gate è fallito, nessuna correzione di codice.

Note:

1. **Grep degli scrittori dei saldi.** Il comando del plan (`grep -rln "\$inc: { twitchPoints\|'status.coins': {"`) restituisce solo `src/economy/coins.expressions.ts`: tra doppi apici `\$` diventa `$`, che grep legge come ancora di fine riga, quindi il ramo `$inc` non trova mai `wallet.service.ts`. Eseguito con `grep -rlF -e '$inc: { twitchPoints' -e "'status.coins': {"` il risultato è esattamente `coins.expressions.ts` + `wallet.service.ts`, come atteso. Ho controllato anche ogni riferimento a `twitchPoints`/`status.coins` fuori da `src/economy`: restano solo i `$setOnInsert: { twitchPoints: 0 }` di `users.service.ts` (valore iniziale alla creazione dell'utente, preesistente, non un movimento di saldo).
2. **Sign-off di 04-VALIDATION.md** in un commit separato (`50eac10`), richiesto dall'orchestratore oltre ai file elencati in `files_modified`.
3. **Soglie in BACKEND-NOTES §4:** ho aggiunto "xp < 20000 → 0", letto da `src/models/character/active-spell-slots.ts` (il plan elencava solo le soglie positive).

## Known Stubs

None.

## Threat Flags

None: plan di sola documentazione e verifica. T-04-09-01 (regola D-04 documentata in §7 + grep), T-04-09-02 (schema diff 0), T-04-09-04 (solo identificatori, nessun id reale né credenziale) mitigati; T-04-09-03 trasferito al deploy (§8, blocker topologia aperto).

## Self-Check: PASSED

- FOUND: .planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md
- FOUND: .planning/REQUIREMENTS.md (5 × `[x]`, 5 × `Complete`)
- FOUND commits: d0e5206, 50eac10
