# Deferred Items — Phase 01

Out-of-scope discoveries logged during execution. Do NOT fix inline.

## From Plan 01-02 (fixtures)

- **`tsconfig.json` `types: ["node", "Multer"]` excludes Jest globals from `tsc`.**
  Pre-existing (already affects Plan 01's `test/harness/replset.int-spec.ts`): running
  `npx tsc --noEmit -p tsconfig.json` reports `Cannot find name 'describe'/'it'/'expect'`
  on every `*.spec.ts` / `*.int-spec.ts` file. Tests still pass because ts-jest resolves
  `@types/jest` at runtime. The pure fixture files (`build*/persist*`) are clean under tsc.
  Fix (out of scope here): add `"jest"` to `tsconfig.json` `types`, or add a
  `tsconfig` for tests including `@types/jest`. Not touched to keep the harness stable.

- **`src/models/point-of-interest.model.ts` schema/GraphQL mismatch on `type`.**
  The Mongoose `@Prop` is a scalar `String` (enum) while the GraphQL `@Field` is
  `[PoiType]` (array). The fixture conforms to the runtime Mongoose schema
  (`type: 'city'`). Reconciling the model itself is out of scope (could affect FE contract).
