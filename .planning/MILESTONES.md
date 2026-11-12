# Milestones

## v1.0 Core Loop (BE) (Shipped: 2026-11-10)

**Phases completed:** 21 fasi (1–17 più le inserite 2.1, 3.1, 9.1, 9.2, 13.1), 261 piani, 195 task (più 3 quick task: 261022-f0n, 261022-rhs, 261105-hea, e i gemelli 261109-inj / 261109-cap)
**Timeline:** roadmap 2026-07-16 → consegna 2026-11-10; Phase 1 completata il 2026-07-23, Phases 2–17 eseguite fra il 2026-10-06 e il 2026-11-09, ultima PR (#28, taglie delle città) mergiata il 2026-11-10
**Stato del codice alla chiusura:** 81 411 righe TypeScript in `src/` (631 file non spec), 87 939 righe di spec (381 file); 381 suite / 4 872 test alla Phase 17 con coverage `src/auth` 99,86 % righe; 2 188 commit, 27 PR mergiate su `develop` (ultime: #27 Phase 17, #28 taglie), CI GitHub Actions (lint, unit, integration, build con diff dello schema, secret scan) verde
**Companion:** milestone FE v1.0 Core Loop (17 fasi, 180 piani) chiusa lo stesso giorno (FE PR #45 Hardening, chiusura PR #46)

**Delivered:** il backend è passato da «completamente aperto e con bug di concorrenza» a fonte di verità sicura e atomica del gioco: sessione propria con login Twitch mediato, autorizzazione per ownership e ruoli con audit, integrità economica per costruzione, real-time filtrato per identità, EventSub per i punti canale, push FCM, corsie quest, viaggio server-autoritativo con cibo e imboscate, esiti di combattimento mai persi, mondo popolato dal documento di world building e curato a DB, negozi per taglia, generazione delle quest, lore sbloccabili e «l'ultimo login caccia l'altro».

**Key accomplishments:**

1. **Fondazione TDD e CI** — `MongoMemoryReplSet` condiviso (transazioni + change stream), split Jest unit/integration, Bull mockato al confine DI + Redis effimero reale, fixture two-tier, CI con lint/unit/integration/build, diff di `src/schema.gql` sul boot reale, gitleaks, coverage per cartella come gate (Phases 1, 10).
2. **Auth e autorizzazione** — JWT di sessione 15 min + refresh rotante con reuse detection, login Twitch mediato (ticket monouso + S256), guard globale deny-by-default su HTTP/REST/WS con 5 handler `@Public()`, dev bypass fail-closed, `@OwnsCharacter`/`@OwnsPendingQuest`/`@Roles(innkeeper)`, audit log TTL 90 giorni; matrice di autorizzazione table-driven (11 handler innkeeper, 19 owner-only, 89 casi sul boot reale), «l'ultimo login caccia l'altro» con close WS `4409`, `SESSION_REVOKED` + `reason`, revoca al cambio ruolo via change stream (Phases 2, 3, 17).
3. **Integrità e real-time** — `WalletService` unico scrittore dei saldi, update condizionali a documento singolo, transazioni solo multi-documento (negozio, accettazione), prezzo dal catalogo; `userUpdated`/`characterUpdated` dai change stream con snapshot e filtro fail-closed; EventSub HMAC con credito 1:1 idempotente (`eventsub_messages`) e `stream.online` → push; registro `push_devices` e `PushService` data-only (Phases 3, 4, 5, 6).
4. **Contratti di gioco per la FE** — `createCharacter`/`deleteCharacter` identity-bound, corsie quest parallele con party per rango, viaggio città → città con job Bull come trigger e `endTime` a DB come verità (reconciler + sweep), `QuestResult` persistito con delivery ibrida (subscription + push + query) e ack esplicito, `spellStates` con recupero che non si interrompe mai, coda live dell'innkeeper e `completePendingRequest` (Phases 2.1, 3.1, 7, 8, 9, 9.1, 9.2).
5. **Il mondo come dati** — popolamento dal documento di world building (~300 lore, 99 creature + voci dell'utente, pet, magie, equipaggiamento, cibo, quest fisse e dungeon) seminato al boot e curato a DB (D-36, nessun file di contenuto nel repo), negozi per città e taglia con `cityShop(cityId)` e `ITEM_NOT_IN_SHOP`, generazione server-side delle quest `enemy`/`boss` con `infos.enemies`, sweep e mutation GM, correzioni 13.1 (animali fuori, fasce contigue, taglie, tabellone per area), cibo del viaggio (1 power = 3 min, km scoperti → HP, `TRAVEL_STARVING`), imboscate per km giorno/notte con deviazione alla sconfitta, lore sbloccate per personaggio con `known` sui nemici (Phases 11, 12, 13, 13.1, 14, 15, 16).
6. **Hardening trasversale** — class-validator su tutti gli input (`BAD_USER_INPUT`), introspection off e sanitization con `requestId`, throttling, moderazione Sightengine prima di Cloudinary, `.env.example` con drift test, ritipizzazione dei 34 ref `Mixed` con migrazione a driver nativo e runbook, segnaposto dei partecipanti archiviati, avvio atomico delle quest da soli (Phase 10).

**Known Gaps:** nessun requisito aperto (118/118 completi). Rinvii dichiarati:

- E2E EventSub managed con tunnel HTTPS e verifica C4 — da fare prima della produzione (Phase 6).
- Promemoria operativi della Phase 10: conferma della policy Sightengine e dei default del throttler, una chiamata Sightengine reale, `THROTTLE_TRUST_PROXY` quando la topologia di produzione sarà nota; topologia Mongo/Redis di produzione.
- «Esci da tutti i dispositivi» (mutation che revoca ogni sessione) — backlog dalla Phase 2.
- Consumo progressivo di cibo e vita in viaggio (Phase 20 discussa su `feat/20-cibo-e-vita-progressivi`), quest di cura per taglia e pozioni con ricarica globale (Phase 18 su `feat/18-quest-heal-per-taglia`), revisione dei modelli (Phase 19 su `feat/19-revisione-dei-modelli`).

**Process notes:**

- Nessun `/gsd-audit-milestone` prima della chiusura: ogni fase è stata chiusa con review per area, verifier, security audit, `test:cov` come gate e il boot reale dall'orchestratore (one-off e seeder rimossi dopo il boot).
- Archivio: `milestones/v1.0-ROADMAP.md` (dettagli di fase, allineamento BE ↔ FE, riepilogo di milestone) e `milestones/v1.0-REQUIREMENTS.md`; le directory di fase restano in `.planning/phases/` (`/gsd-cleanup` può spostarle).
- I 23 branch locali `feat/*`/`fix/*`/`docs/*` già mergiati su `develop` sono stati lasciati (si possono cancellare con `git branch -d`).
- I branch delle Phase 18/19/20 toccano `ROADMAP.md`, `REQUIREMENTS.md` e `STATE.md` e vanno ribasati su questa chiusura.

---
