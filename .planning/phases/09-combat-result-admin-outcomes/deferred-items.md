# Deferred items — Phase 9

## 09-04

- `src/models/enemy.model.ts`: `locations` è dichiarato `@Prop({ type: String, enum: Object.values(PoiType) })` mentre il tipo TS e il campo GraphQL sono `PoiType[]` / `[PoiType]`. Un array (anche vuoto) fallisce il cast (`Cast to string failed for value "[]"`), e un valore stringa salvato romperebbe il campo lista non nullo sul filo. Fix atteso: `@Prop({ type: [String], enum: Object.values(PoiType), default: [] })` (il file non è Prettier-clean: commit `style(...)` separato prima). Fuori scope in 09-04 (il piano vieta di modificare il modello); la fixture `buildEnemy` omette `locations`.
