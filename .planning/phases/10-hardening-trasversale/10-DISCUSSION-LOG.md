# Phase 10: Hardening Trasversale - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 10-hardening-trasversale
**Areas discussed:** Validazione input (BE-HARD-01), Introspection/CORS/errori (BE-HARD-02), Secret audit e .env.example (BE-HARD-03), Coverage e debiti rinviati (BE-HARD-04)
**Mode:** interactive (AskUserQuestion, recommended option first); same session as the FE Phase 8 discuss and the insertion of BE Phase 9.1.

---

## Validazione input (BE-HARD-01)

### Proprietà non dichiarate

| Option | Description | Selected |
|--------|-------------|----------|
| Scartate in silenzio (Recommended) | `whitelist: true` senza `forbidNonWhitelisted` | ✓ |
| Rifiutate con errore | `forbidNonWhitelisted: true` | |

### Codice degli errori di validazione

| Option | Description | Selected |
|--------|-------------|----------|
| `BAD_USER_INPUT` (Recommended) | Stesso codice della coercizione degli scalari di Apollo; un solo codice per il FE | ✓ |
| `VALIDATION_FAILED` dedicato | Codice proprio con `extensions.fields` | |

### Id Mongo malformati

| Option | Description | Selected |
|--------|-------------|----------|
| `@IsMongoId()` ovunque (Recommended) | Respinti prima del service come `BAD_USER_INPUT`; handoff emendati | ✓ |
| Nessuna validazione sugli id | Classificazione di dominio di oggi, BE-HARD-01 da emendare | |

---

## Introspection, CORS, errori (BE-HARD-02)

### Introspection e landing page

| Option | Description | Selected |
|--------|-------------|----------|
| Legato a `NODE_ENV` (Recommended) | Accese solo se `NODE_ENV !== 'production'` | ✓ |
| Variabile dedicata | `GRAPHQL_INTROSPECTION` riaccendibile su prod | |

**Notes:** the user first asked «Spiega meglio questo punto»; the explanation given (introspection = schema download without token because it bypasses the resolvers' guard; landing page = Apollo HTML page on `GET /api/graphql`; the FE schema check does not use introspection) is summarised in CONTEXT D-05.

### CORS

| Option | Description | Selected |
|--------|-------------|----------|
| Allowlist da env, vuota = chiuso (Recommended) | `CORS_ORIGINS`, pronta per un futuro client web | |
| Chiuso e basta | Nessuna configurazione, nessuna variabile | ✓ |
| Aperto a tutti (`*`) | Sconsigliato | |

### Sanitizzazione degli errori

| Option | Description | Selected |
|--------|-------------|----------|
| Messaggio generico + log server (Recommended) | `INTERNAL_SERVER_ERROR` + `requestId`, suggerimenti dello schema spenti | ✓ |
| Solo niente stacktrace | Messaggio originale conservato | |

### Throttling (fuori requisiti)

| Option | Description | Selected |
|--------|-------------|----------|
| Rinviare al backlog (Recommended) | Fase sui quattro requisiti + debiti | |
| Includere, minimo | Solo login/refresh/OAuth/webhook/upload, limiti da env | ✓ |

---

## Secret audit e .env.example (BE-HARD-03)

### Strumento

| Option | Description | Selected |
|--------|-------------|----------|
| gitleaks-action v3 (Recommended) | Job CI, gratuito per repo personali, `.gitleaks.toml` | ✓ |
| Script grep custom | Pattern mirati mantenuti a mano | |
| Entrambi | | |

### Secret nella storia

| Option | Description | Selected |
|--------|-------------|----------|
| Ruotare il secret + allowlist del commit (Recommended) | Storia intatta, valore trapelato inutile | ✓ |
| Riscrivere la storia | `git filter-repo` + force-push | |
| Scansione solo dei nuovi commit | Non soddisfa «nessun secret è nel repo» | |

---

## Coverage e debiti rinviati (BE-HARD-04)

### Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Soglie per area che fanno fallire la CI (Recommended) | `coverageThreshold` per cartella, baseline − 2 | ✓ |
| Soglia globale unica | | |
| Solo report | | |

### Debiti rinviati (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Resilienza publisher e code (Recommended) | Change stream con backoff, `removeOnFail`, `KeyedSingleFlight` utenti | ✓ |
| Indici e bug di schema (Recommended) | Indici sweep, `Enemy.locations`, `PointOfInterest.type`, tsconfig jest | ✓ |
| Refactor interni | `commitRescue`, helper di priming, `@AuditTarget` | ✓ |
| Ritipizzazione dei ref `Mixed` | Migrazione, rischio più alto (sconsigliata) | ✓ |

**Notes:** the user included the `Mixed` retyping despite the warning; CONTEXT D-17d isolates it in the last wave with its own gate.

### Moderazione delle immagini (debito BE-CHAR-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Rinviare a v1.1 (Recommended) | Add-on esterno, costi e policy da decidere | |
| Includere con Cloudinary Moderation | `moderation: aws_rek` | |
| Sightengine | — | ✓ (free text) |

**User's choice (verbatim):** *«Utilizziamo sightengine con questi modelli: models=nudity-2.1,offensive-2.0,text-content,face-age,gore-2.0,text,qr-content,self-harm. Nel backend è già stata aggiunta la secret e lo user id con queste chiavi: SIGHTENGINE_USER_ID SIGHTENGINE_API_SECRET.»*

#### Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Severa (Recommended) | Rifiuto su ogni classe esplicita/offensiva/gore/self-harm/minori/testo volgare o personale/QR; `text` a log | ✓ |
| Essenziale | Solo nudità esplicita, gore, self-harm, simboli offensivi | |

#### Fail mode

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-closed (Recommended) | 503 `IMAGE_MODERATION_UNAVAILABLE`, nessun upload; chiavi obbligatorie in prod | ✓ |
| Fail-open con log | Upload comunque + WARN | |

---

## Claude's Discretion

- Limiti numerici di validazione non fissati prima; `extensions.fields`; `requestId`; default del throttler; struttura del modulo di moderazione; soglie iniziali di coverage; ordine delle wave.

## Deferred Ideas

- Storage Redis del throttler; allowlist CORS da env; moderazione dei testi liberi; lista `questResults`; hook pre-commit.
