---
phase: quick-261022-rhs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/travel/queue-call-timeout.ts
  - src/travel/queue-call-timeout.spec.ts
  - test/travel/fake-travel-queue.ts
  - src/travel/travel-scheduler.service.ts
  - src/travel/travel-planning.module.ts
  - src/travel/travel-planning.int-spec.ts
  - src/travel/travel.resolver.int-spec.ts
  - src/travel/teleport.resolver.int-spec.ts
  - src/quests/acceptance/accept-quest.resolver.int-spec.ts
  - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md
autonomous: true
requirements: [TRAVEL-01]

must_haves:
  truths:
    - "With the Bull queue hanging (Redis down), acceptQuest/startTravel/teleportCharacter answer successful: true within the queue-call timeout instead of hanging"
    - "A timed-out enqueue logs one WARN with the job id only and the travel stays valid (D-21); a timed-out cancel logs one WARN and the job neutralises itself (D-12/D-16)"
    - "A Bull promise that settles (or rejects) after the timeout never produces an unhandled rejection"
    - "A Redis connection error is logged once as WARN with the error code/name only (no host, port, URL or secret)"
    - "Existing failAdd/failRemove behaviour and messages are unchanged; SDL unchanged"
  artifacts:
    - path: "src/travel/queue-call-timeout.ts"
      provides: "withinTimeout helper, QUEUE_CALL_TIMED_OUT sentinel, QUEUE_CALL_TIMEOUT_MS = 2_000, QUEUE_CALL_TIMEOUT DI token"
      exports: ["withinTimeout", "QUEUE_CALL_TIMED_OUT", "QUEUE_CALL_TIMEOUT_MS", "QUEUE_CALL_TIMEOUT"]
    - path: "src/travel/queue-call-timeout.spec.ts"
      provides: "unit tests of the race helper"
    - path: "test/travel/fake-travel-queue.ts"
      provides: "hangAdd/hangRemove flags and emit() for queue events"
      contains: "hangAdd"
    - path: "src/travel/travel-scheduler.service.ts"
      provides: "bounded schedule/cancel + once-only Redis error WARN in onModuleInit"
      contains: "withinTimeout"
  key_links:
    - from: "src/travel/travel-scheduler.service.ts"
      to: "src/travel/queue-call-timeout.ts"
      via: "withinTimeout(this.queue.add(...), this.timeoutMs)"
      pattern: "withinTimeout\\("
    - from: "src/travel/travel-planning.module.ts"
      to: "QUEUE_CALL_TIMEOUT"
      via: "provider useValue QUEUE_CALL_TIMEOUT_MS"
      pattern: "provide: QUEUE_CALL_TIMEOUT"
    - from: "src/travel/travel-scheduler.service.ts"
      to: "queue 'error' event"
      via: "this.queue.on('error', ...) in onModuleInit"
      pattern: "queue\\.on\\('error'"
---

<objective>
Hardening from the device UAT of 2026-10-22: with Redis down, `TravelScheduler.schedule` awaited `queue.add` forever (ioredis waits for reconnection), so `acceptQuest` committed but never answered (client hung ~100 s). Bound every Bull call of the scheduler (`queue.add`; `getJob` + `remove`) with a 2000 ms timeout; on timeout WARN with the job id and return — the travel stays valid and the boot reconciler / sweep complete it (08-CONTEXT D-12, D-16, D-21: "se l'accodamento fallisce il viaggio resta valido: WARN, nessuna compensazione"). Add a once-only WARN on Redis connection errors. Document it in the Phase 8 handoff.

Design choice (planner's discretion): the timeout is a **constant** `QUEUE_CALL_TIMEOUT_MS = 2_000` exposed through a DI token `QUEUE_CALL_TIMEOUT` provided by `TravelPlanningModule` (tests override it with a short value). No env variable: nothing operational to tune, and it avoids touching `travel-config.ts`, `.env.example` and the deploy surface.

Output: helper + unit spec, bounded scheduler, observability, integration and wire cases, BACKEND-NOTES amendments. No SDL change, no new dependency.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/phases/08-travel-lifecycle-travel-01/08-CONTEXT.md
@src/travel/travel-scheduler.service.ts
@test/travel/fake-travel-queue.ts
@src/travel/travel-planning.module.ts

Working tree: branch `fix/travel-scheduler-redis-timeout` (from `develop` @ 2a3449a). The user's `start:dev` runs on this tree: every commit must compile with `npm run build` (spec files are excluded by `tsconfig.build.json` via `**/*spec.ts`, so a RED commit whose spec imports a not-yet-implemented symbol does not break the dev server, but production sources must always compile). Commits: Conventional Commits, **no `Co-Authored-By` trailer**. Do not touch ROADMAP.md / STATE.md. Jest: path BEFORE `--selectProjects`; integration always with `--runInBand`.

<interfaces>
Current `src/travel/travel-scheduler.service.ts` (to be modified):
```typescript
@Injectable()
export class TravelScheduler {
    private readonly logger = new Logger(TravelScheduler.name);
    constructor(
        @InjectQueue(TRAVEL_QUEUE) private readonly queue: Queue<TravelJobData>,
        private readonly clock: Clock,
    ) {}
    async schedule(characterId: Types.ObjectId, travel: { startTime: Date; endTime: Date }): Promise<void>
        // try { await this.queue.add(TRAVEL_COMPLETE_JOB, data, { jobId, delay, removeOnComplete: true, removeOnFail: false }) }
        // catch { warn(`Accodamento del viaggio ${jobId} fallito: lo completerà lo sweep`) }
    async cancel(characterId: Types.ObjectId, startTime: Date): Promise<void>
        // try { const job = await this.queue.getJob(jobId); await job?.remove(); }
        // catch { warn(`Rimozione del job ${jobId} non riuscita: il job si neutralizza da solo`) }
}
```
Callers (unchanged): `QuestAcceptanceService.accept` → `await this.scheduler.schedule(...)` after commit (quest-acceptance.service.ts:194); `TravelService.startTravel` → `schedule` (travel.service.ts:84); `TravelService.teleport` → `cancel` (travel.service.ts:116).

`test/travel/fake-travel-queue.ts` today: fields `added`, `removed`, `jobs`, `failAdd`, `failRemove`; jest.fn `add`, `getJob`, `process`, `on`; `reset()` clears arrays/map/flags and mockClear()s the four fns.

Wire harness (`createCharactersTestApp`, test/auth/auth-test-app.ts) accepts `overrides: Array<{ token, useValue }>` (applied via overrideProvider). Existing overrides in the three wire specs include `{ token: getQueueToken(TRAVEL_QUEUE), useValue: queue }`.
Wire helpers already present: travel.resolver.int-spec.ts `playerAt(location)`, `requestOf(player, poiId)`, `start(request, bearer)` (expects `{ response: 'Viaggio iniziato', successful: true }`); teleport.resolver.int-spec.ts `describe('teleportCharacter (wire)')` with `travellingToB(player)`, `innkeeper()`, `teleportOnWire(request, bearer)` (expects `{ response: 'Personaggio teletrasportato', successful: true }`); accept-quest.resolver.int-spec.ts `accept(request, bearer)` (expects `{ response: 'Missione accettata', successful: true }`) and the case 'streams the automatic travel and a null startDate on characterUpdated' (line ~766) showing the standard-quest-with-travel setup (`persistTravelWorld`, `playerWith('traveller', { location: travel.markerA })`, `persistQuest(quests, { infos: { ...base.infos, type: 'hunt', markerLocation: travel.questPoi, timeToComplete: 60000 }, ... })`).
travel-planning.int-spec.ts: `describe('TravelScheduler')` (line ~397) with `characterId`, `travel`, `jobId`, helper `warnSpy()` (spies `Logger.prototype.warn`), `afterEach(jest.restoreAllMocks)`, `beforeEach` calls `queue.reset()`; app built with `Test.createTestingModule(...).overrideProvider(getQueueToken(TRAVEL_QUEUE)).useValue(queue).overrideProvider(Clock)...`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: withinTimeout helper (TDD) + FakeTravelQueue hangAdd/hangRemove/emit</name>
  <read_first>
    - src/travel/travel-scheduler.service.ts
    - test/travel/fake-travel-queue.ts
    - src/travel/travel-job.spec.ts (unit spec style)
  </read_first>
  <files>src/travel/queue-call-timeout.ts, src/travel/queue-call-timeout.spec.ts, test/travel/fake-travel-queue.ts</files>
  <behavior>
    Unit spec `src/travel/queue-call-timeout.spec.ts`, `describe('withinTimeout')`:
    - 'returns the value of a call that settles in time' → `await withinTimeout(Promise.resolve('job'), 1_000)` equals `'job'`.
    - 'propagates the rejection of a call that fails in time' → `withinTimeout(Promise.reject(new Error('queue unavailable')), 1_000)` rejects with 'queue unavailable'.
    - 'returns QUEUE_CALL_TIMED_OUT when the call never settles' → `withinTimeout(new Promise(() => {}), 10)` resolves to `QUEUE_CALL_TIMED_OUT` (real timers, 10 ms).
    - 'swallows a rejection that arrives after the timeout' → deferred promise; `await withinTimeout(deferred.promise, 5)` gives the sentinel; register `const listener = jest.fn(); process.on('unhandledRejection', listener)`; `deferred.reject(new Error('late'))`; `await new Promise((resolve) => setImmediate(resolve))` twice; `expect(listener).not.toHaveBeenCalled()`; finally `process.off('unhandledRejection', listener)` (real timers).
    - 'clears its timer once the call settles' → `jest.useFakeTimers()`; `await withinTimeout(Promise.resolve(1), 60_000)`; `expect(jest.getTimerCount()).toBe(0)`; `jest.useRealTimers()` in a finally/afterEach.
    - 'defaults to two seconds' → `expect(QUEUE_CALL_TIMEOUT_MS).toBe(2_000)`.
  </behavior>
  <action>
    RED: write the unit spec above importing `{ QUEUE_CALL_TIMED_OUT, QUEUE_CALL_TIMEOUT_MS, withinTimeout } from './queue-call-timeout'`; run it and see it fail (module missing). Commit `test(travel): bound queue calls with a timeout helper`.

    GREEN: create `src/travel/queue-call-timeout.ts`:
    ```typescript
    // una chiamata Bull con Redis giù attende il riconnesso all'infinito: la corsa col timer tiene le mutation entro un tempo noto (D-21)
    export const QUEUE_CALL_TIMEOUT_MS = 2_000;
    export const QUEUE_CALL_TIMEOUT = 'QUEUE_CALL_TIMEOUT';
    export const QUEUE_CALL_TIMED_OUT: unique symbol = Symbol('queueCallTimedOut');

    export async function withinTimeout<T>(
        call: Promise<T>,
        timeoutMs: number,
    ): Promise<T | typeof QUEUE_CALL_TIMED_OUT> {
        // un esito tardivo non deve diventare una unhandled rejection
        call.catch(() => undefined);
        let timer: NodeJS.Timeout | undefined;
        const timedOut = new Promise<typeof QUEUE_CALL_TIMED_OUT>((resolve) => {
            timer = setTimeout(() => resolve(QUEUE_CALL_TIMED_OUT), timeoutMs);
            timer.unref();
        });
        try {
            return await Promise.race([call, timedOut]);
        } finally {
            clearTimeout(timer);
        }
    }
    ```
    (`call.catch` returns a new promise that is intentionally ignored; if eslint flags `no-floating-promises`, prefix with `void`.) Run the unit spec green.

    Then extend `test/travel/fake-travel-queue.ts` (test support, no behaviour change for existing cases):
    - fields `hangAdd = false;` and `hangRemove = false;` next to `failAdd`/`failRemove`;
    - in `add`, right after the `failAdd` check: `if (this.hangAdd) return new Promise<FakeTravelJob>(() => undefined);` (nothing recorded in `added`/`jobs`);
    - in the job's `remove`, before the `failRemove` check: `if (this.hangRemove) return new Promise<void>(() => undefined);`;
    - replace `on = jest.fn();` with a listener registry: `private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();` and `on = jest.fn((event: string, listener: (...args: unknown[]) => void) => { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this; });` plus `emit(event: string, ...args: unknown[]): void { for (const listener of this.listeners.get(event) ?? []) listener(...args); }`;
    - `reset()` also sets `hangAdd = false` and `hangRemove = false`; it does NOT clear `listeners` (they are registered once at boot by `onModuleInit`; comment in Italian: `// i listener si registrano una volta al boot (onModuleInit): reset non li tocca`).
    Run the travel unit project and `npx tsc --noEmit -p tsconfig.json` to prove the fake compiles. Commit `feat(travel): add the queue call timeout helper` (helper) — the fake change may go in the same commit or in `test(travel): let the fake travel queue hang`.
  </action>
  <verify>
    <automated>npx jest src/travel/queue-call-timeout.spec.ts --selectProjects unit && npx jest src/travel --selectProjects unit && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "export const QUEUE_CALL_TIMEOUT_MS = 2_000" src/travel/queue-call-timeout.ts` matches
    - `grep -n "call.catch" src/travel/queue-call-timeout.ts` matches and `grep -n "clearTimeout" src/travel/queue-call-timeout.ts` matches
    - `grep -c "it('" src/travel/queue-call-timeout.spec.ts` ≥ 6
    - `grep -n "hangAdd\|hangRemove\|emit(" test/travel/fake-travel-queue.ts` shows fields, the two hang branches, reset of both flags, and `emit`
    - unit project for src/travel green
  </acceptance_criteria>
  <done>Helper exported and unit-tested (value, rejection, timeout sentinel, late rejection swallowed, timer cleared, 2000 ms default); fake queue can hang `add`/`remove` and emit events; RED commit precedes GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Bound TravelScheduler.schedule/cancel and WARN once on Redis errors (TDD, integration)</name>
  <read_first>
    - src/travel/travel-scheduler.service.ts
    - src/travel/travel-planning.module.ts
    - src/travel/travel-planning.int-spec.ts (lines 1-140 setup, 395-475 'TravelScheduler' describe)
    - src/travel/queue-call-timeout.ts (from Task 1)
  </read_first>
  <files>src/travel/travel-planning.int-spec.ts, src/travel/travel-scheduler.service.ts, src/travel/travel-planning.module.ts</files>
  <behavior>
    In `src/travel/travel-planning.int-spec.ts`: add `const QUEUE_TIMEOUT_MS = 50;` and `.overrideProvider(QUEUE_CALL_TIMEOUT).useValue(QUEUE_TIMEOUT_MS)` to the testing module builder (import `QUEUE_CALL_TIMEOUT` from './queue-call-timeout'). New cases inside `describe('TravelScheduler')`:
    - 'answers within the timeout when the enqueue hangs' → `queue.hangAdd = true; const warn = warnSpy();` `await expect(scheduler.schedule(characterId, travel)).resolves.toBeUndefined();` `expect(queue.add).toHaveBeenCalledTimes(1)`; `expect(warn).toHaveBeenCalledTimes(1)`; `expect(warn).toHaveBeenCalledWith(\`Accodamento del viaggio ${jobId} non confermato entro ${QUEUE_TIMEOUT_MS} ms: lo completerà lo sweep\`)`.
    - 'answers within the timeout when the job removal hangs' → `await scheduler.schedule(characterId, travel); queue.hangRemove = true; const warn = warnSpy();` `await expect(scheduler.cancel(characterId, travel.startTime)).resolves.toBeUndefined();` `expect(queue.removed).toEqual([])`; `expect(warn).toHaveBeenCalledWith(\`Rimozione del job ${jobId} non confermata entro ${QUEUE_TIMEOUT_MS} ms: il job si neutralizza da solo\`)`.
    - 'warns once on a Redis connection error without connection details' → `const warn = warnSpy();` `queue.emit('error', Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), { code: 'ECONNREFUSED' }));` then `queue.emit('error', new Error('Connection is closed.'));` → `expect(warn).toHaveBeenCalledTimes(1)`; `expect(warn).toHaveBeenCalledWith('Redis non raggiungibile (ECONNREFUSED): i job di viaggio partiranno al riconnesso, lo sweep copre')`; `expect(String(warn.mock.calls[0][0])).not.toMatch(/127\.0\.0\.1|6379/)`. (Single case: the once-flag lives on the singleton scheduler for the whole app.)
    Existing cases ('never throws when the queue is unavailable' with `failAdd`, 'tolerates a missing or locked job on cancel' with `failRemove`, message texts) stay byte-identical and green.
  </behavior>
  <action>
    RED: add the override + three cases above; run `npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand`: the hang cases must fail (jest 5 s test timeout, scheduler awaits forever) and the Redis case fails (no listener). Note: until GREEN the module has no `QUEUE_CALL_TIMEOUT` provider; `overrideProvider` on an unregistered token is harmless. Commit `test(travel): require bounded queue calls in the scheduler`.

    GREEN — `src/travel/travel-scheduler.service.ts` (per D-21 / D-12 / D-16; messages exactly as below, Italian, job id only, no Redis details):
    - imports: `Inject, Injectable, Logger, OnModuleInit` from '@nestjs/common'; `{ QUEUE_CALL_TIMED_OUT, QUEUE_CALL_TIMEOUT, withinTimeout }` from './queue-call-timeout'.
    - `export class TravelScheduler implements OnModuleInit`; add `private redisWarned = false;`; constructor gains a third param `@Inject(QUEUE_CALL_TIMEOUT) private readonly timeoutMs: number`.
    - `onModuleInit(): void { this.queue.on('error', (error: Error) => this.warnRedisOnce(error)); }`
    - `private warnRedisOnce(error: Error): void` → return if `redisWarned`; set it; `const code = (error as NodeJS.ErrnoException)?.code ?? error?.name ?? 'unknown';` `this.logger.warn(\`Redis non raggiungibile (${code}): i job di viaggio partiranno al riconnesso, lo sweep copre\`);` — never log `error.message` (it contains host:port). Comment: `// una sola volta per processo: senza dettagli di connessione (nessun host, porta o URL nel log)`.
    - `schedule`: inside the existing try, `const outcome = await withinTimeout(this.queue.add(...same args...), this.timeoutMs); if (outcome === QUEUE_CALL_TIMED_OUT) this.logger.warn(\`Accodamento del viaggio ${jobId} non confermato entro ${this.timeoutMs} ms: lo completerà lo sweep\`);`. Keep the existing catch and its message unchanged. Update the method comment to mention the timeout (Redis irraggiungibile → la mutation risponde comunque, D-21).
    - `cancel`: extract `private async removeJob(jobId: string): Promise<void> { const job = await this.queue.getJob(jobId); await job?.remove(); }`; inside the existing try: `const outcome = await withinTimeout(this.removeJob(jobId), this.timeoutMs); if (outcome === QUEUE_CALL_TIMED_OUT) this.logger.warn(\`Rimozione del job ${jobId} non confermata entro ${this.timeoutMs} ms: il job si neutralizza da solo\`);`. Existing catch/message unchanged.
    - `src/travel/travel-planning.module.ts`: add provider `{ provide: QUEUE_CALL_TIMEOUT, useValue: QUEUE_CALL_TIMEOUT_MS }` (import both from './queue-call-timeout'). No export needed.
    Run the planning int-spec green, then the whole travel + acceptance integration suites (other specs build the module with the real 2000 ms default and a non-hanging fake: must stay green). `npm run build` must pass. Refactor if needed, then commit `fix(travel): bound the travel queue calls with a timeout`.
  </action>
  <verify>
    <automated>npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand && npx jest src/travel src/quests/acceptance --selectProjects integration --runInBand && npm run build</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "withinTimeout(" src/travel/travel-scheduler.service.ts` shows 2 calls (add, removeJob)
    - `grep -n "queue.on('error'" src/travel/travel-scheduler.service.ts` matches; `grep -n "error.message" src/travel/travel-scheduler.service.ts` returns nothing
    - `grep -n "provide: QUEUE_CALL_TIMEOUT" src/travel/travel-planning.module.ts` matches
    - `grep -n "non confermato entro\|non confermata entro\|Redis non raggiungibile" src/travel/travel-scheduler.service.ts` shows the three messages
    - `grep -n "fallito: lo completerà lo sweep\|non riuscita: il job si neutralizza da solo" src/travel/travel-scheduler.service.ts` still matches (old messages unchanged)
    - planning int-spec: 3 new cases green, existing failAdd/failRemove cases green; build green
  </acceptance_criteria>
  <done>schedule/cancel resolve within the injected timeout when Bull hangs, WARN with job id only; Redis error WARN once with code only; existing behaviour intact; RED commit before GREEN.</done>
</task>

<task type="auto">
  <name>Task 3: Wire cases with a hanging queue + BACKEND-NOTES amendments + full gate</name>
  <read_first>
    - src/travel/travel.resolver.int-spec.ts (harness overrides ~line 125, helpers 230-260, case at ~319)
    - src/travel/teleport.resolver.int-spec.ts (harness ~80, wire describe ~300-375)
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts (harness ~150, `accept` ~307, case at ~766)
    - .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md §6 (line ~250), §13 (~421), §14 (~433)
  </read_first>
  <files>src/travel/travel.resolver.int-spec.ts, src/travel/teleport.resolver.int-spec.ts, src/quests/acceptance/accept-quest.resolver.int-spec.ts, .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md</files>
  <action>
    Characterization on the wire (Task 2 already makes them green; first run each new case against `git stash` of Task 2 production code is NOT required — the RED for this behaviour is Task 2's). In each of the three wire specs add `{ token: QUEUE_CALL_TIMEOUT, useValue: 50 }` to the harness `overrides` (import from 'src/travel/queue-call-timeout' / './queue-call-timeout'), so a hang costs 50 ms, then add one case each:
    - travel.resolver.int-spec.ts: 'answers startTravel even when the queue hangs (Redis down)' → `queue.hangAdd = true; const alice = await playerAt(world.markerA); const body = await start(requestOf(alice, world.markerB), alice.bearer);` → `expect(body.errors).toBeUndefined(); expect(body.data?.startTravel).toEqual({ response: 'Viaggio iniziato', successful: true });` and the travel is persisted (`(await rawCharacter(alice))?.status.activeTravel` not null — use the spec's existing raw-read helper; if none exists read via `characters.collection.findOne({ _id: alice.character?._id })`); `expect(queue.added).toEqual([])`.
    - teleport.resolver.int-spec.ts, inside `describe('teleportCharacter (wire)')`: 'answers the teleport even when the job removal hangs' → `const alice = await playerAt(world.markerA); await travellingToB(alice); queue.hangRemove = true; const oste = await innkeeper();` → `teleportOnWire({ id: characterIdOf(alice).toHexString(), poiId: world.questPoi.toHexString() }, oste.bearer)` answers `{ response: 'Personaggio teletrasportato', successful: true }`, no errors; raw character has `status.location` = `world.questPoi` and `activeTravel` null.
    - accept-quest.resolver.int-spec.ts: 'answers acceptQuest even when the travel queue hangs (UAT 2026-10-22)' → same setup as 'streams the automatic travel and a null startDate on characterUpdated' (persistTravelWorld, `playerWith('traveller', { location: travel.markerA })`, hunt quest with `markerLocation: travel.questPoi`, `timeToComplete: 60000`) without the subscription; `queue.hangAdd = true` before `accept(...)`; `expect(body.errors).toBeUndefined(); expect(body.data?.acceptQuest).toEqual({ response: 'Missione accettata', successful: true });` `expect(queue.added).toEqual([])`; the pending quest exists with `startDate` null (read `pendingQuests` model or raw character `quests.pendingQuest` not null, mirroring the file's existing assertions).
    Make sure `queue.reset()` (already in afterEach / beforeEach of each spec) clears the hang flags — Task 1 did that. Commit `test(travel): answer the travel mutations with the queue hanging`.

    Docs — `.planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md`:
    - §6, after the "Trigger" bullet, add: `- **Redis irraggiungibile (UAT 2026-10-22):** ogni chiamata alla coda (accodamento e rimozione del job) ha un timeout di 2 s (\`QUEUE_CALL_TIMEOUT_MS\`): con Redis giù \`acceptQuest\`, \`startTravel\` e \`teleportCharacter\` rispondono comunque entro ~2 s; il viaggio resta valido e il job non accodato è coperto dal reconciler al boot e dallo sweep (D-21); un job non rimosso si neutralizza da solo (D-12).`
    - §13, add a bullet: `- **Redis giù:** le mutation di viaggio rispondono comunque entro ~2 s; il job non accodato è coperto dallo sweep (tenerlo attivo). In produzione monitorare i WARN \`Redis non raggiungibile (<code>)\` (una volta per processo) e \`Accodamento del viaggio … non confermato entro 2000 ms\`. Nessuna variabile nuova.`
    - §14 "Note", add one line: `- **Incidente UAT su device (2026-10-22):** con Redis spento \`acceptQuest\` committava ma non rispondeva (attesa infinita di \`queue.add\`, client in errore dopo ~100 s); risolto nel quick task 261022-rhs con il timeout sulle chiamate alla coda.`

    Final gate (fix any lint/format issue on touched files, then commit docs as `docs(08): note the travel queue timeout for Redis outages`):
    `npx jest src/travel --selectProjects unit`, `npx jest src/travel src/quests/acceptance --selectProjects integration --runInBand`, `npm run build`, `git diff --exit-code src/schema.gql`, `npx eslint <touched .ts files>`, `npx prettier --check <touched files>`.
  </action>
  <verify>
    <automated>npx jest src/travel --selectProjects unit && npx jest src/travel src/quests/acceptance --selectProjects integration --runInBand && npm run build && git diff --exit-code src/schema.gql && npx eslint src/travel/queue-call-timeout.ts src/travel/queue-call-timeout.spec.ts src/travel/travel-scheduler.service.ts src/travel/travel-planning.module.ts src/travel/travel-planning.int-spec.ts src/travel/travel.resolver.int-spec.ts src/travel/teleport.resolver.int-spec.ts src/quests/acceptance/accept-quest.resolver.int-spec.ts test/travel/fake-travel-queue.ts && npx prettier --check src/travel/queue-call-timeout.ts src/travel/queue-call-timeout.spec.ts src/travel/travel-scheduler.service.ts src/travel/travel-planning.module.ts src/travel/travel-planning.int-spec.ts src/travel/travel.resolver.int-spec.ts src/travel/teleport.resolver.int-spec.ts src/quests/acceptance/accept-quest.resolver.int-spec.ts test/travel/fake-travel-queue.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "hangAdd = true" src/travel/travel.resolver.int-spec.ts src/quests/acceptance/accept-quest.resolver.int-spec.ts` matches in both; `grep -n "hangRemove = true" src/travel/teleport.resolver.int-spec.ts` matches
    - `grep -n "QUEUE_CALL_TIMEOUT" src/travel/travel.resolver.int-spec.ts src/travel/teleport.resolver.int-spec.ts src/quests/acceptance/accept-quest.resolver.int-spec.ts` matches in all three
    - `grep -n "UAT 2026-10-22\|2026-10-22" .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` shows the §6 and §14 lines; `grep -n "Redis giù" .planning/phases/08-travel-lifecycle-travel-01/BACKEND-NOTES.md` shows the §13 bullet
    - `git diff --exit-code src/schema.gql` exits 0; no change to package.json
    - full gate green
  </acceptance_criteria>
  <done>All three travel mutations answer successful: true on the wire with a hanging queue; handoff documents the timeout, the monitoring WARNs and the UAT incident; gate green, SDL unchanged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| API → Redis (Bull) | external dependency whose availability is not guaranteed |
| server → logs | log sink must not receive connection details or secrets |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-q-rhs-01 | D (DoS) | TravelScheduler.schedule/cancel | mitigate | `withinTimeout` races each Bull call against 2000 ms; mutations answer within bound; travel stays valid, sweep/reconciler complete it (D-21) |
| T-q-rhs-02 | D (DoS / process crash) | late Bull rejection after timeout | mitigate | `call.catch(() => undefined)` attached before racing; unit case 'swallows a rejection that arrives after the timeout' |
| T-q-rhs-03 | I (Info disclosure) | Redis error WARN | mitigate | log only `error.code ?? error.name`, never `error.message` (host:port / URL); int case asserts no `127.0.0.1`/`6379` in the message |
| T-q-rhs-04 | D (log flooding) | queue 'error' listener during reconnect loops | mitigate | once-per-process flag `redisWarned` |
| T-q-rhs-05 | T (Tampering / state drift) | job not enqueued or not removed | accept | by design D-12/D-16/D-21: completion is an idempotent conditional update; sweep covers missing jobs, stale jobs are no-ops |
</threat_model>

<verification>
- `npx jest src/travel --selectProjects unit`
- `npx jest src/travel src/quests/acceptance --selectProjects integration --runInBand`
- `npm run build`
- `git diff --exit-code src/schema.gql`
- eslint + prettier on touched files
</verification>

<success_criteria>
- With the fake queue hanging, `schedule`/`cancel` resolve within the injected timeout and WARN with the job id only; startTravel, teleportCharacter and acceptQuest answer `successful: true` on the wire
- No unhandled rejection from late Bull settlements (unit-tested)
- Redis connection error logged once, code/name only
- Existing failAdd/failRemove cases and messages unchanged; SDL unchanged; no new dependency; no env added
- BACKEND-NOTES §6/§13/§14 amended
- TDD order visible in history: test commit before fix commit for Task 1 and Task 2
</success_criteria>

<output>
After completion, create `.planning/quick/261022-rhs-travel-scheduler-bound-the-bull-queue-ca/261022-rhs-SUMMARY.md`
</output>
