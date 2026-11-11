---
phase: 18-quest-heal-per-taglia
plan: 10
subsystem: quests
tags: [quests, heal, graphql, subscription, viewer, tdd]
requires: ["18-09"]
provides:
  - "campo additivo per viewer Quest.noEffect: Boolean! (D-25), risolto sul tipo Quest per query, tabellone e questUpdated"
  - "ViewerVitalsService: vita e ferite del personaggio corrente del bearer, una lettura per viewer per richiesta HTTP e per evento WS"
  - "SDL: sola riga `noEffect: Boolean!` in type Quest"
affects: [18-11]
tech-stack:
  added: []
  patterns: ["campo per viewer sul tipo con memo WeakMap(chiave dell'evento) → Map(ruolo:userId), stesso schema di ViewerKnowledgeService (Phase 16)"]
key-files:
  created:
    - src/quests/no-effect/viewer-vitals.service.ts
    - src/quests/no-effect/quest-no-effect.resolver.ts
  modified:
    - src/quests/quests.module.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/quests/quest-updated.subscription.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Il filtro sul tipo heal sta nel resolver: per le quest non heal il campo risponde false senza leggere nulla"
  - "Nessun ramo sul ruolo in ViewerVitalsService: l'oste col proprio personaggio è giudicato come chiunque, senza personaggio corrente il campo è false"
  - "viewerCacheKeyOf riusata da src/lore/viewer-knowledge.service.ts; la chiave interna ruolo:userId è scritta inline (viewerKeyOf non è esportata e il piano vieta diff in src/lore)"
  - "STATE.md registra `Plan: 10 of 11` (formato del brief)"
metrics:
  duration: "~35 min"
  completed: 2026-11-10
  tasks: 3
  files: 7
---

# Phase 18 Plan 10: heal senza effetto, il campo — Summary

`Quest.noEffect: Boolean!` dichiara alla FE il foglio strappato: vero solo per una quest di tipo `heal` senza effetto per il personaggio corrente del bearer, calcolato con lo stesso predicato `healHasNoEffect` del rifiuto `QUEST_NO_EFFECT` di `acceptQuest`, risolto per singolo viewer su `quest(id)`, sul tabellone `quests` e su ogni evento di `questUpdated`.

## Cosa è stato costruito

- `src/quests/no-effect/viewer-vitals.service.ts`: `@Injectable() export class ViewerVitalsService` con `of(identity: AuthIdentity | undefined, context: object, info?: { rootValue?: unknown }): Promise<HealSubject | null>`. Memo `WeakMap<object, Map<string, Promise<HealSubject | null>>>`: chiave esterna `viewerCacheKeyOf(context, info)` (rootValue dell'evento sotto graphql-ws, altrimenti il context della richiesta HTTP), chiave interna `${role}:${userId}`. Lettura: senza identità o userId malformato → `null`; `User.findById(userId, { currentCharacter: 1 })` lean → `refIdOf` (assente → `null`); `Character.findOne(activeCharacterById(id), VIEWER_VITALS_PROJECTION)` lean con proiezione `status.title`, `status.xp`, `status.currentLifePoints`, `status.maxLifePoints`, `status.injuries` (assente/archiviato/morto → `null`); risultato `{ currentLifePoints, maxLifePoints }` da `statusFactsOf` più `injuries` (o `[]`).
- `src/quests/no-effect/quest-no-effect.resolver.ts`: `@Resolver(() => Quest) export class QuestNoEffectResolver`, `@ResolveField('noEffect', () => Boolean) async noEffect(@Parent() quest: Quest, @CurrentUser() identity, @Context() context: object, @Info() info: GraphQLResolveInfo): Promise<boolean>`: tipo diverso da `QuestType.heal` → `false` senza leggere; soggetto `null` → `false`; altrimenti `healHasNoEffect(subject, quest.prizes?.cure)`.
- `src/quests/quests.module.ts`: `ViewerVitalsService` e `QuestNoEffectResolver` fra i providers (modelli `User` e `Character` già registrati).
- `src/schema.gql`: `type Quest { id, infos, noEffect: Boolean!, prizes, registeredAdventurers, requirements }`, nessuna riga tolta; `QUEST_NO_EFFECT` assente dallo SDL.

## TDD

### Task 1
- RED `4321cdc7`: i sette casi `Quest.noEffect (D-25)` in `src/quests/quests.resolver.int-spec.ts`, tutti rossi con `Cannot query field "noEffect" on type "Quest".` (GRAPHQL_VALIDATION_FAILED). Il commit RED aveva `tsc` rosso per la sola spec nuova (cast di `character?._id` e tipo di `mock.calls`): corretto nel commit GREEN.
- GREEN `bff22b5d`: servizio, resolver, modulo; 19/19 verdi.

### Task 2
- RED `5e469ecf`: due casi su `questUpdated` e i due blocchi esatti `type Quest` del boot reale aggiornati più il caso `writes the no-effect heal flag of the FE Phase 18 into the generated schema (D-25)`.
  - Il boot reale NON è osservabile rosso: `test/app.int-spec.ts` rigenera `src/schema.gql` e lo legge nella stessa esecuzione, quindi è verde al primo colpo (84/84). La prova del RED è lo SDL committato prima del piano senza la riga (`git show f49c166f:src/schema.gql` non contiene `noEffect`); lo SDL rigenerato dalla prima esecuzione è stato riportato alla versione di HEAD prima del commit dei test, per lasciare l'albero pulito dopo ogni commit.
  - I due casi della subscription sono verdi al primo colpo, come previsto dal piano: la memo del Task 1 è già per viewer dentro la chiave dell'evento (rootValue nuovo a ogni pubblicazione, Map interna per `ruolo:userId`), quindi alice riceve `true` e bruno `false` sullo stesso evento, e alice passa da `true` a `false` all'evento dopo la ferita. Nessun `fix(quests)` necessario.
- GREEN `7abed397`: SDL rigenerato col boot reale e committato.

## Come è stato isolato il conteggio delle letture

Nel caso `reads the character once per request for a board of heals (D-25)` (tabellone con due heal, una senza effetto e una con effetto: quota 1, vita 900 su 1000):
- spy su `findById` del modello `User` (`harness.connection.models[User.name]`): 2 chiamate attese = 1 di `QuestsService.findForViewer` (stesso metodo e stessa proiezione) + 1 di `ViewerVitalsService`; senza memo sarebbero 3;
- spy su `findOne` del modello `Character`, contando le sole chiamate la cui proiezione contiene la chiave `status.injuries` (la proiezione del tabellone `BOARD_CHARACTER_PROJECTION` non la contiene): esattamente 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocco] tsc rosso nella spec RED**
- **Found during:** Task 1
- **Issue:** `character?._id` è `unknown` per il filtro tipizzato e `mock.calls` di `findOne` è una tupla di un solo elemento.
- **Fix:** cast `as Types.ObjectId` e `characterRead.mock.calls as unknown[][]` nella spec, committati col GREEN.
- **Commit:** bff22b5d

**2. [Nota] boot reale verde al RED**
- Spiegato sopra: harness che rigenera e legge lo SDL nella stessa esecuzione. Nessun cambio di codice.

Nessun'altra deviazione.

## Gates

- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task.
- `npx jest src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand` → 19/19.
- `npx jest src/quests/quest-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` → 96/96 (boot reale 84).
- Controllo di wave `npx jest src/quests --selectProjects integration --runInBand` → 34 suite / 469 test in 184 s (lo strumento l'ha spostata in background dopo 180 s: attesa la notifica).
- prettier `--write` + eslint sui sei file `.ts` toccati: puliti (warning preesistente `no-base-to-string` in `test/app.int-spec.ts` riga ~958, non nostro).
- `git diff origin/develop -- src/schema.gql`: nessuna riga tolta; aggiunta nel piano la sola `noEffect: Boolean!`.
- `test/authz/expected-handlers.ts` e `test/authz/handler-fixtures.ts` senza diff; nessun diff in `src/lore` e `src/models`.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/quests/no-effect/viewer-vitals.service.ts`, `src/quests/no-effect/quest-no-effect.resolver.ts`.
- Commit presenti: 4321cdc7, bff22b5d, 5e469ecf, 7abed397.
