---
phase: 12
slug: negozi-per-citta
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-02
---

# Phase 12 — Validation Strategy

> Contratto di validazione della fase: campionamento del feedback durante l'esecuzione.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest (progetti unit `*.spec.ts` e integration `*.int-spec.ts` su `MongoMemoryReplSet`) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| **Full suite command** | `npm run test:cov` (solo nel piano 12-18) |
| **Schema gate** | real boot `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`, poi `git diff --exit-code src/schema.gql` |
| **Type gate** | `npx tsc --noEmit -p tsconfig.json` |
| **Estimated runtime** | ~15 s per spec mirata, suite completa alcuni minuti |

---

## Sampling Rate

- **Dopo ogni commit di task:** le spec mirate del task + `npx tsc --noEmit -p tsconfig.json`
- **Dopo ogni piano che tocca lo SDL:** real boot + `git diff --exit-code src/schema.gql`
- **Prima di `/gsd-verify-work`:** `npm run test:cov` verde (piano 12-18)
- **Max feedback latency:** 30 s per spec mirata

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | BE-SHOP-05 | — | N/A | docs | `grep -c "12-19-02" .planning/phases/12-negozi-per-citta/12-VALIDATION.md` | ✅ | ✅ green |
| 12-01-02 | 01 | 1 | BE-SHOP-01 | T-12-02 | La taglia della città è decisa dal server con una mappa esaustiva | unit | `npx jest src/cities/city-size.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-01-03 | 01 | 1 | BE-SHOP-01 | T-12-01 | Le liste del pool non entrano nello SDL di `City` | unit + integration | `npx jest src/models/shop-fields.schema.spec.ts src/shops/shop-pool.rules.spec.ts --selectProjects unit` · `npx jest src/cities/cities.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-02-01 | 02 | 2 | BE-SHOP-02 | T-12-03 | Il flag di vendibilità è server-side e assente finché non scritto | unit | `npx jest src/models/shop-fields.schema.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-02-02 | 02 | 2 | BE-SHOP-02 | T-12-03 | Il catalogo espone `sellable` senza alterare le query esistenti | integration | `npx jest test/shops/catalog-sellable.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-03-01 | 03 | 3 | BE-SHOP-06 | T-12-04 | I pet posseduti si scrivono solo dal server | unit | `npx jest src/models/shop-fields.schema.spec.ts src/characters/creation/starting-character.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-03-02 | 03 | 3 | BE-SHOP-06 | T-12-05 | `characterUpdated` porta i pet popolati solo al proprietario | integration | `npx jest src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-04-01 | 04 | 4 | BE-SHOP-03 | T-12-06 | I codici d'errore nuovi sono stabili e senza dati sensibili | unit | `npx jest src/gameRules/game-rule.exception.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-05-01 | 05 | 5 | BE-SHOP-04 | T-12-07 | Le costanti del pool vivono nel codice, nessuna variabile d'ambiente | unit | `npx jest src/shops/shop-pool.constants.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-05-02 | 05 | 5 | BE-SHOP-04 | T-12-07 | Il generatore è deterministico per seme | unit | `npx jest src/shops/seeded-random.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-06-01 | 06 | 6 | BE-SHOP-04 | T-12-08 | Le regole del pool rispettano taglia e veti | unit | `npx jest src/shops/shop-pool.rules.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-06-02 | 06 | 6 | BE-SHOP-04 | T-12-08 | L'estrazione del pool è riproducibile e limitata | unit | `npx jest src/shops/shop-pool.draw.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-07-01 | 07 | 7 | BE-SHOP-06 | T-12-09 | La migrazione di `sellable` sui pet è idempotente | integration | `npx jest src/shops/maintenance/pet-sellable.migrator.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-08-01 | 08 | 8 | BE-SHOP-06 | T-12-10 | La migrazione dei pet posseduti è idempotente e non perde pet | integration | `npx jest src/shops/maintenance/owned-pets.migrator.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-09-01 | 09 | 9 | BE-SHOP-01 | — | N/A | integration | `npx jest test/shops/shop-world.fixture.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-09-02 | 09 | 9 | BE-SHOP-01 | T-12-11 / T-12-12 | La semina scrive solo i pool assenti, mai quelli curati a DB | integration | `npx jest src/shops/maintenance/shop-pool.seeder.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-10-01 | 10 | 10 | BE-SHOP-01 | — | N/A | unit | `npx jest src/shops/shop-pool.report.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-10-02 | 10 | 10 | BE-SHOP-01 | T-12-13 | Il report logga solo id, conteggi e nomi | integration | `npx jest src/shops/shop-pool-report.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-10-03 | 10 | 10 | BE-SHOP-01 | T-12-13 / T-12-14 | Il boot dei negozi non blocca l'avvio e non stampa segreti | unit + integration | `npx jest src/shops/maintenance/shop-boot.spec.ts --selectProjects unit` · `npx jest src/shops/maintenance/shop-boot.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-11-01 | 11 | 11 | BE-SHOP-02 | T-12-15 / T-12-16 | `cityShop` applica i veti in lettura e scarta i riferimenti orfani | unit + integration | `npx jest src/shops/shop-pool.rules.spec.ts --selectProjects unit` · `npx jest src/shops/city-shop.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-11-02 | 11 | 11 | BE-SHOP-02 | T-12-17 | `cityShop` è autenticata dal guard globale | integration | `npx jest src/shops/city-shop.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-12-01 | 12 | 12 | BE-SHOP-01 | T-12-18 | Il report admin è solo innkeeper | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-12-02 | 12 | 12 | BE-SHOP-01 | T-12-18 | Un player non legge il report dei pool | integration | `npx jest src/shops/shop-admin.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-13-01 | 13 | 13 | BE-SHOP-02 | T-12-19 | Le query deprecate restano, nessuna riga SDL rimossa | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-14-01 | 14 | 14 | BE-SHOP-06 | T-12-20 | Il prezzo dei pet è calcolato dal server | unit | `npx jest src/economy/trade/trade-pricing.spec.ts src/economy/trade/trade-inventory.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-14-02 | 14 | 14 | BE-SHOP-06 | T-12-20 / T-12-21 | L'input di transazione dei pet è validato | unit + integration | `npx jest src/validation/input-decorators.spec.ts src/validation/input-rules.spec.ts --selectProjects unit` · `npx jest src/economy/trade/catalog-prices.reader.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-15-01 | 15 | 15 | BE-SHOP-03 | T-12-22 | Un oggetto fuori dal pool della città non si compra | unit | `npx jest src/economy/trade/trade-pool.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-15-02 | 15 | 15 | BE-SHOP-03 | T-12-22 / T-12-23 | `doTransaction` rifiuta con `ITEM_NOT_IN_SHOP` senza scritture | integration | `npx jest src/economy/trade/shop-transaction.service.int-spec.ts src/economy/trade/do-transaction.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-16-01 | 16 | 16 | BE-SHOP-06 | T-12-24 | Un pet già posseduto non si ricompra | unit | `npx jest src/economy/trade/trade-pets.spec.ts src/economy/trade/trade-inventory.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-16-02 | 16 | 16 | BE-SHOP-06 | T-12-24 / T-12-25 | Compra e vendita dei pet sono atomiche | integration | `npx jest src/economy/trade/shop-transaction.service.int-spec.ts src/economy/trade/do-transaction.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-17-01 | 17 | 17 | BE-SHOP-06 | T-12-27 | Si equipaggia solo un pet posseduto | unit | `npx jest src/characters/pets/equip-pet.updates.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-17-02 | 17 | 17 | BE-SHOP-06 | T-12-26 | Gli input di `equipPet` / `unequipPet` sono validati | unit + integration | `npx jest src/validation/input-decorators.spec.ts src/validation/input-rules.spec.ts src/characters/characters.service.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 12-17-03 | 17 | 17 | BE-SHOP-06 | T-12-26 / T-12-27 / T-12-28 | Solo il proprietario equipaggia, mai su un personaggio archiviato | integration | `npx jest src/characters/pets/equip-pet.int-spec.ts src/characters/characters-ownership.int-spec.ts src/characters/archived-character-visibility.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-18-01 | 18 | 18 | BE-SHOP-05 | T-12-29 | Il flusso completo dei negozi rispetta i guard | integration | `npx jest test/shops/city-shops.e2e.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-18-02 | 18 | 18 | BE-SHOP-05 | T-12-29 | Lo SDL finale è additivo salvo le due query deprecate | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 12-18-03 | 18 | 18 | BE-SHOP-01..06 | T-12-30 / T-12-31 | Suite completa e coverage verdi | full suite | `npm run test:cov` | ✅ | ✅ green |
| 12-19-01 | 19 | 19 | BE-SHOP-05 | T-12-32 | Il handoff non contiene segreti | docs | `grep -c "cityShop" .planning/phases/12-negozi-per-citta/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 12-19-02 | 19 | 19 | BE-SHOP-05 | — | N/A | docs | `grep -c "Complete" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Ogni spec nuova nasce nel commit RED del proprio task: nessun piano Wave 0 separato.
- Helper di test: `test/shops/shop-world.fixture.ts` (12-09), parametro `pool` di `test/economy/place-in-city.ts` (12-15).
- Framework e harness: Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Primo boot del BE sul database reale dopo la merge (semina dei pool, migrazioni dei pet, WARN del report) | BE-SHOP-01, BE-SHOP-06 | La fase vieta di toccare il database reale: lo esegue l'utente | Runbook di `BACKEND-NOTES.md` (piano 12-19) |
| UAT su device della FE Phase 13 | BE-SHOP-01..06 | Richiede il device e l'app FE | Villaggio, città, capitale, Talmvere, Necrorian chiusa |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30 s per spec mirata; real boot e suite completa esclusi
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-03
