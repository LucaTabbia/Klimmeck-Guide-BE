---
phase: 10-hardening-trasversale
plan: 03
subsystem: ci/secrets
tags: [gitleaks, secrets, env-template, ci, BE-HARD-03]
requires: []
provides:
  - "workflow `Secret scan` (.github/workflows/gitleaks.yml, job `gitleaks`) con gitleaks/gitleaks-action@v3 e GITLEAKS_VERSION 8.24.3"
  - ".gitleaks.toml: regole di default (useDefault = true) + tabella singola [allowlist] per template, spec e test/"
  - ".gitleaksignore: registro datato delle fingerprint (D-10), vuoto"
  - "src/config/env-example.secrets.spec.ts: guardia unit sulle chiavi segrete vuote di .env.example"
affects: [10-07, 10-15, 10-20, 10-24, 10-30, 10-31]
tech-stack:
  added: []
  patterns:
    - "guardia unit sul template letto da disco (readFileSync su .env.example), nessun valore d'ambiente letto"
    - "workflow CI separato per l'audit dei secret, storia completa solo da workflow_dispatch e schedule"
key-files:
  created:
    - .github/workflows/gitleaks.yml
    - .gitleaks.toml
    - .gitleaksignore
    - src/config/env-example.secrets.spec.ts
    - .planning/phases/10-hardening-trasversale/10-03-SUMMARY.md
  modified: []
decisions:
  - "Chiavi segrete del template riconosciute da SECRET_KEY_PATTERN (suffissi SECRET, _KEY, TOKEN, SERVICE_ACCOUNT più SIGHTENGINE_USER_ID): le 9 attese dal piano, nessuna in più"
  - "Il workflow YAML resta a 2 spazi come ci.yml (Prettier del repo lo vorrebbe a 4, ma ci.yml non è formattato da Prettier): nessun npx prettier --write sul YAML"
  - "Nessuna GITLEAKS_LICENSE (repo di account personale); commenti PR disattivati, permessi contents/pull-requests in sola lettura"
metrics:
  duration: "~5 min"
  completed: 2026-10-29
  tasks: 2
  files: 4
---

# Phase 10 Plan 03: audit dei secret con gitleaks v3 e guardia sul template Summary

Job CI `gitleaks` (workflow `Secret scan`) con gitleaks-action v3 e gitleaks fissato a 8.24.3, allowlist a tabella singola per template e fixture di test, registro datato delle fingerprint in `.gitleaksignore`, e una spec unit che tiene vuote le 9 chiavi segrete di `.env.example`.

## Task eseguiti

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | guardia unit sulle chiavi segrete del template | `c7e0e1f` | `src/config/env-example.secrets.spec.ts` |
| 2 | workflow gitleaks v3, configurazione e registro delle fingerprint | `2924c9f` | `.github/workflows/gitleaks.yml`, `.gitleaks.toml`, `.gitleaksignore` |

## TDD

- **Task 1 — verde al primo colpo (atteso dal piano):** il template ha già tutte le chiavi segrete vuote, quindi la spec è una guardia di regressione. Per provare che morde, la riga `JWT_SECRET=` del template è stata riempita temporaneamente con `fake-value`: `keeps every secret key of the template empty (D-09)` è diventato rosso (1 fallito, 1 passato), poi il template è stato ripristinato con `git checkout` (nessuna modifica committata). Esito finale: 2/2 verdi.
- **Task 2 — nessun ciclo RED/GREEN:** il task non è `tdd` nel piano; il workflow non si può eseguire localmente (nessun download di gitleaks, nessun `act`), quindi la verifica è statica: tutti i grep di `<verify>` e di `<acceptance_criteria>` verdi (4 trigger, `GITLEAKS_CONFIG` 1 riga, `[allowlist]` 1, `[[allowlists]]` 0, `.gitleaksignore` senza voci), il TOML si carica con `tomllib` e il YAML con `js-yaml` (trigger `push`, `pull_request`, `workflow_dispatch`, `schedule` col cron del lunedì alle 06:00 UTC).

## Azione dell'utente dopo il push

1. Dopo il push di `feat/10-hardening`, lanciare il workflow `Secret scan` con `workflow_dispatch` sul branch: `GH_TOKEN=$(gh auth token --user LucaTabbia) gh workflow run gitleaks.yml --ref feat/10-hardening` (è l'unico modo, insieme allo schedule settimanale, di scansionare la storia completa: push e PR scansionano solo i commit dell'evento).
2. Leggere il summary del job e l'artifact SARIF.
3. Per ogni finding reale: ruotare il secret alla fonte (Mongo, JWT, Twitch, Cloudinary, Firebase, Sightengine), poi aggiungere la fingerprint (`commit:file:rule-id:line`) in `.gitleaksignore` con sopra un commento datato «AAAA-MM-GG — secret ruotato alla fonte da …, motivo». Nessuna riscrittura della storia (D-10).
4. Per un falso positivo in `.planning/`: aggiungere `'''^\.planning/'''` ai `paths` dell'`[allowlist]` di `.gitleaks.toml` (mai `[[allowlists]]` finché la versione resta 8.24.3).
5. Se l'allowlist risulta ignorata (A8: sintassi non riconosciuta), i falsi positivi delle spec e di `test/` faranno fallire il job: va segnalato nel handoff del 10-30.

## Deviazioni dal piano

- **Prettier non applicato al YAML del workflow:** `npx prettier --check` sul workflow chiede l'indentazione a 4 spazi (tabWidth del repo); il file resta a 2 spazi come il blocco del piano e come `ci.yml` (che non è a sua volta formattato da Prettier). Nessun impatto sui grep di accettazione.
- **Task 2 senza commit RED:** il task non è TDD (configurazione CI non eseguibile in locale); la verifica è quella statica prevista dal piano.

Nient'altro: piano eseguito come scritto.

## Threat model

- T-10-08: mitigata dal workflow (push/PR + storia completa con `workflow_dispatch`/schedule); la prima scansione completa resta un'azione manuale.
- T-10-09: mitigata da `keeps every secret key of the template empty (D-09)`.
- T-10-10: mitigata da `permissions: contents: read, pull-requests: read` e `GITLEAKS_ENABLE_COMMENTS: 'false'`.
- T-10-11: accettata; allowlist limitata a `.env.example`, `*.spec.ts`, `*.int-spec.ts`, `test/`.

## Known Stubs

Nessuno. `.gitleaksignore` è volutamente senza voci: si popola solo con i risultati della prima scansione completa.

## Self-Check: PASSED

- FOUND: `.github/workflows/gitleaks.yml`, `.gitleaks.toml`, `.gitleaksignore`, `src/config/env-example.secrets.spec.ts`
- FOUND: commit `c7e0e1f`, `2924c9f`
- `git diff --exit-code src/schema.gql` esce 0; righe rimosse rispetto a `origin/develop`: 0
