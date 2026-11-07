---
phase: 16-lore-sbloccabili
fixed: 2026-11-07
fixed_at: 2026-11-07T13:55:36Z
source: 16-REVIEW.md
review_path: .planning/phases/16-lore-sbloccabili/16-REVIEW.md
rulings_path: .planning/phases/16-lore-sbloccabili/16-REVIEW-RULINGS.md
iteration: 1
fix_scope: all
findings_total: 9
findings_in_scope: 9
fixed_count: 4
skipped_count: 0
not_needed_count: 5
deferred_count: 0
status: all_fixed
---

# Phase 16: report dei fix della code review

**Data dei fix:** 2026-11-07
**Review di partenza:** `.planning/phases/16-lore-sbloccabili/16-REVIEW.md` (gruppi A/B/C, dettagli in `16-REVIEW-A.md`, `16-REVIEW-B.md`, `16-REVIEW-C.md`)
**Ruling applicati:** `.planning/phases/16-lore-sbloccabili/16-REVIEW-RULINGS.md`
**Base:** `0102a79` su `feat/16-lore-sbloccabili`
**Iterazione:** 1

**Esito:** 9 finding (1 critical, 0 warning, 8 info) → 4 corretti (A-CR-01, A-IN-03, B-IN-02, B-IN-03), 5 `not_needed` per ruling (A-IN-01, A-IN-02, B-IN-01, C-IN-01, C-IN-02), 0 saltati, 0 rinviati. 6 commit, più questo report.

## Tabella dei finding

| Finding | Esito | Commit | Note |
| --- | --- | --- | --- |
| A-CR-01 | fixed | `39b4f01` (RED), `dc287a5` (GREEN) | `ViewerKnowledgeService` ha una cache a due livelli: `WeakMap<object, Map<string, Promise<LoreVisibility>>>`, chiave esterna `viewerCacheKeyOf(context, info)` (invariata), chiave interna `${identity?.role ?? ''}:${identity?.userId ?? ''}` (innkeeper e viewer senza identità hanno la loro chiave). Firma pubblica invariata. RED: `viewer-knowledge.service.int-spec.ts` «serves each viewer its own knowledge on a shared root value (D-07, Pitfall 1)» (stesso `rootValue`, due context, prima il secondo viewer riceveva `true`, ora due visibilità diverse e due `findOne` del Character) e `known-enemies.resolver.int-spec.ts` «serves each subscriber its own known on one questUpdated event (D-07, Pitfall 1)» (due socket con due bearer sulla stessa `questUpdated(id)`, snapshot poi un tocco della quest: prima i due subscriber ricevevano lo stesso `known`, ora `true` e `false`). Spec esistenti invariate e verdi. Riga del handoff `BACKEND-NOTES.md` §2.6 aggiornata («per viewer»). |
| A-IN-01 | not_needed | — | Una lettura rifiutata resta in cache solo per la richiesta o l'evento che l'ha generata ed è fail-closed; con la chiave per viewer di A-CR-01 non tocca altri viewer. |
| A-IN-02 | not_needed | — | Gli insiemi nascono da `@Prop([ObjectId])` e `refIdOf` rifiuta già le stringhe non esadecimali; nessun `_id` legacy non esadecimale fra le lore: il `CastError` non ha uno scenario raggiungibile. |
| A-IN-03 | fixed | `f1bb00f` (RED), `7204f3f` (GREEN) | `LoreGeographyReader.ofMarker` passa `sort: { _id: 1 }` al `findOne` del driver nativo. RED in `lore-geography.reader.int-spec.ts` «picks the city with the lowest id when two cities share a marker (D-03)» (due città sullo stesso marker inserite in ordine inverso agli id: prima vinceva l'ordine naturale, ora la città con `_id` minore). Riga del handoff §2.2 aggiornata. |
| B-IN-01 | not_needed | — | Il secondo `updateOne` dell'arrivo gira nella stessa transazione del `findOneAndUpdate` che ha appena riaffermato `completionFilter`: il predicato in più non cambierebbe mai l'esito. |
| B-IN-02 | fixed (solo handoff) | `16ead7b` | La riga del handoff §2.2 citava già i due eventi del change stream; aggiunto che il primo porta la posizione nuova con le lore di prima e il secondo lo stato finale, e che il FE confronta gli insiemi di `unlockedLore` (FE 17 D-05). Nessun codice. |
| B-IN-03 | fixed (refactor) | `93d30ac` | Tolte le registrazioni `{ name: Lore.name, schema: LoreSchema }` e gli import da `travel.module.ts`, `quest-acceptance.module.ts`, `character-creation.module.ts` (nessun provider li inietta; `AmbushModule` e `LoreGeographyModule` mantengono le loro). Refactor senza RED: verdi le int-spec del ruling (266/266) e le unit dei tre moduli (34 suite / 492 test). |
| C-IN-01 | not_needed | — | `src/migrations/lore-backfill/` esce dal repo prima della merge (D-11). |
| C-IN-02 | not_needed | — | Stesso schema di `QuestMaintenanceBoot`, coerente con D-11 (il boot prosegue anche in errore). |

Prettier ed eslint puliti su ogni file `.ts` toccato, uno per uno. `tsc` a 0 su ogni commit.

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest src/lore src/travel src/quests src/characters src/models src/config --selectProjects unit` | 138 suite / 1712 test verdi |
| `npx jest src/lore/viewer-knowledge.service.int-spec.ts --selectProjects integration --runInBand` | 7/7 |
| `npx jest src/lore/known-enemies.resolver.int-spec.ts --selectProjects integration --runInBand` | 8/8 |
| `npx jest src/lore/lore-geography.reader.int-spec.ts --selectProjects integration --runInBand` | 8/8 |
| `npx jest src/lore/lore-related.int-spec.ts --selectProjects integration --runInBand` | 10/10 |
| `npx jest src/travel/travel-completion.int-spec.ts src/travel/teleport.resolver.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts src/characters/creation/character-creation.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | 5 suite / 266 test verdi |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql`, righe tolte | 0 |
| `Math.random` / `Date.now` / `process.env.` aggiunti sotto `src/` | 0 |
| trailer vietati in `0102a79..HEAD` | 0 (controllato dopo ogni commit) |
| `git status --short` / `pgrep -fl 'bin/jest'` a fine lavoro | vuoti |
| processo BE dell'utente (pid 99707) | vivo, `dist/` non toccato (nessuna build) |

Nessun test instabile osservato, nessuna int-spec appesa.

## Note per il handoff FE

- **Contratto FE:** nessun cambio di SDL, di nomi né di payload; `src/schema.gql` invariato.
- **A-CR-01 (semantica per viewer, correzione di una fuga):** su `questUpdated` ogni subscriber riceve ora il proprio `QuestEnemy.known`; prima due giocatori sulla stessa quest potevano ricevere la conoscenza dell'altro. Nessun cambio di forma, la regola di D-07 era già quella del handoff. `BACKEND-NOTES.md` §2.6 aggiornato.
- **A-IN-03:** due città sullo stesso marker (dato ambiguo, oggi assente) danno sempre la geografia di quella con l'id minore. `BACKEND-NOTES.md` §2.2 aggiornato.
- **B-IN-02:** un arrivo che insegna produce due `characterUpdated` (posizione nuova poi geografia); il secondo è lo stato finale. Il FE confronta gli insiemi ed è già indifferente. `BACKEND-NOTES.md` §2.2 aggiornato.
- B-IN-03 è interno (registrazioni Mongoose inutili): nessun effetto.

---

_Fixed: 2026-11-07T13:55:36Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
