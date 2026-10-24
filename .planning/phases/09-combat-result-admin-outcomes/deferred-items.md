# Deferred items — Phase 9

## 09-04

- `src/models/enemy.model.ts`: `locations` è dichiarato `@Prop({ type: String, enum: Object.values(PoiType) })` mentre il tipo TS e il campo GraphQL sono `PoiType[]` / `[PoiType]`. Un array (anche vuoto) fallisce il cast (`Cast to string failed for value "[]"`), e un valore stringa salvato romperebbe il campo lista non nullo sul filo. Fix atteso: `@Prop({ type: [String], enum: Object.values(PoiType), default: [] })` (il file non è Prettier-clean: commit `style(...)` separato prima). Fuori scope in 09-04 (il piano vieta di modificare il modello); la fixture `buildEnemy` omette `locations`.

## 09-14

- `test/app.int-spec.ts` › `global auth guard › rejects an existing query without a bearer or with a forged one`: fallito una sola volta (40/41) al primo run dopo il montaggio di `QuestOutcomesModule`, poi 41/41 in quattro run consecutivi. Dettaglio non catturato. Da tenere d'occhio nel gate 09-16: se si ripresenta, catturare l'errore (ipotesi da verificare: concorrenza con il reconciler al boot, mai atteso, su DB vuoto).

## 09-16

- Flaky 09-14 del boot reale (`global auth guard › rejects an existing query without a bearer or with a forged one`): **non riprodotto** nel gate 09-16 (suite integration completa 72/72 suite e due run isolati di `test/app.int-spec.ts`, 43/43 ciascuno). Resta da tenere d'occhio in CI; riportato nel handoff (`BACKEND-NOTES.md` §14).
- Il bug `Enemy.locations` (09-04) resta aperto ed è riportato nel handoff (`BACKEND-NOTES.md` §14, note per la BE Phase 10).
