# Phase 24 — regole comuni degli esecutori

Parte del contesto di OGNI piano `24-NN-PLAN.md` (citato con `@`). Scritto dall'orchestratore il 2026-11-15 dopo la ricerca.

## Regole ereditate

Le sezioni «Repo, branch, esecuzione», «Lint, format, test» e «Segreti e database reale» di `.planning/phases/23-sconfitta-riposo-recupero-compagni/23-REPO-RULES.md` valgono parola per parola (leggerle), con queste differenze:

- Branch `feat/24-origini-magie-quest-void-shamanic` già attivo, impilato su `fix/23-dungeon-xp-and-innkeeper-corrections` (PR #43).
- Scope dei commit di codice: `spells`, `quests`, `cities`, `characters`, `generation`, `gm`; documenti `docs(phase-24)`. Nessun trailer di attribuzione (`Co-Authored-By`, `Generated with`, `Claude-Session`), mai.
- Requisiti `BE-ORIGIN-NN`, da aggiungere a `REQUIREMENTS.md` nel primo piano.
- **Nessun file di contenuto nel repo:** origini, magie nuove, livelli e le tre quest nuove le scrive a DB l'orchestratore con script fuori dal repo dopo la revisione dell'utente. Il migratore è one-off: l'orchestratore lo toglie dopo il boot reale.
- Mai `npm run build` / `nest build` / `npm run lint`: il BE dell'utente gira da `dist/`.

## Contratto e nomi fissati (ruling dell'orchestratore, 2026-11-15)

| Cosa | Nome | Note |
|------|------|------|
| Origine (D-01) | enum TS `SpellOrigin { void, arcane, shamanic }` in `src/models/enums/spell-origin.enum.ts`; `Spell.origin: String!` sul filo, come `useType`, con validazione enum di Mongoose | `arcane`, mai `magic`; il tipo di quest `magic` insegna l'origine `arcane`: la tabella tipo → origine è esplicita, mai un'identità |
| Livello minimo (D-07) | `Spell.minLevelToLearn: Int!`; `minXpToLearn` tolto da modello e SDL (non additivo, dichiarato nel handoff) | conversione con `levelRowFor`; il cancello confronta il livello del personaggio (`progression.level`, `levelRowFor(status.xp).level` per le opzioni dell'oste) |
| `SpellInput` | cancellato | codice morto, assente dallo SDL |
| Tipi di quest (D-09) | `QuestType.shamanic`, `QuestType.void` | `String!` sul filo: nessun cambio SDL; identici a `magic` in `REPEATABLE_TYPES`, `readStudyLorePool` e ovunque `magic` sia nominato |
| Sorteggio (D-10) | filtro per origine in `readSpellPool`, alimentato dal tipo della quest | solo per `magic`/`shamanic`/`void`; ogni altro tipo con `spellDraw: true` continua a pescare dall'intero catalogo come oggi; nessun tiro di dado aggiunto o spostato; le magie dei soli nemici restano sorteggiabili come oggi |
| Necrorian (D-12) | pavimento di titolo per tipo di città (`CITY_RANK_FLOORS`, `necrorianCity → mage`) in `generation-rules.ts`, applicato nella composizione; nessun boss misto sotto il pavimento | le spec a seme fisso non cambiano; nessun report di boot per le quest scritte a mano |
| Tipi di città (D-15, D-16) | `CityType.aarakocraCapital`, `dragonbornCapital` (taglia `capital`), `dragonbornVillage` (`village`) | additivo allo SDL; **primo piano della fase**: oggi la query `cities` fallisce sul BE vero («Enum "CityType" cannot represent value: "dragonbornCapital"», verificato dall'orchestratore il 2026-11-15) |
| Città di nascita (D-18) | `RACE_HOME_CITY_TYPES`: dragonborn → `dragonbornCapital`, aarakocra → `aarakocraCapital` | solo personaggi nuovi |
| Migratore | un passo idempotente prima di ogni hook, sul modello di `src/migrations/model-review/` della Phase 19 (commit `0822feee` lo rimuove): scrive `minLevelToLearn` da `minXpToLearn` e `origin: 'arcane'` dove manca; **lascia `minXpToLearn` a DB** | il campo vecchio lo toglie l'orchestratore dopo la merge; le origini vere arrivano dallo script di contenuto |

## Ordine dei piani

città → modello della magia additivo → cancello di livello nelle quest → cancello di livello dell'oste → via `minXpToLearn` → tipi di quest → sorteggio per origine → pavimento di Necrorian → migratore → gate → handoff (`BACKEND-NOTES.md` con SDL diff, finestra FE: la FE di oggi seleziona `minXpToLearn`, quindi dopo il riavvio dal ramo serve la build della FE Phase 23; `void` è parola riservata in Dart).

Fuori scope: riscrittura delle quest heal e dei negozi di Murnborim e Thengran come capitali (contenuto a DB, decisione dell'utente).
