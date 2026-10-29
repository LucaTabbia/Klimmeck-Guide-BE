---
phase: 10-hardening-trasversale
plan: 17
subsystem: moderation
tags: [moderation, sightengine, cloudinary, upload, fail-closed, D-12, D-14, BE-HARD-05]
requires:
  - "10-16: porta ImageModerator, SightengineImageModerator, DisabledImageModerator, ImageRejectedException, ImageModerationUnavailableException, FakeImageModerator"
  - "10-15: MODERATION_CONFIG e moderationConfigProvider (src/config/moderation-config.ts)"
  - "10-12: detectImageMimetype e imageFilePipe del controller"
  - "10-13/10-14: @Throttled() su uploadImage (EXPECTED_THROTTLED_HANDLERS a 8 voci)"
provides:
  - "src/rest/cloudinary/portrait-upload.service.ts: PortraitUploadService.upload(file): Promise<string>"
  - "src/moderation/moderation.module.ts: ModerationModule (monta moderationConfigProvider, provider ImageModerator scelto da MODERATION_CONFIG, ModerationStartupReporter; esporta ImageModerator)"
  - "src/moderation/moderation-startup.reporter.ts: ModerationStartupReporter (WARN al boot con moderazione disattivata)"
  - "test/auth/auth-test-app.ts: AuthTestApp.moderator: FakeImageModerator, montato come ImageModerator"
affects: [10-30]
tech-stack:
  added: []
  patterns:
    - "servizio applicativo che compone porta di moderazione e storage: moderazione prima, upload solo se approvato"
    - "factory di modulo che sceglie l'adapter dalla configurazione validata (Sightengine o disattivato)"
key-files:
  created:
    - src/rest/cloudinary/portrait-upload.service.ts
    - src/rest/cloudinary/portrait-upload.service.spec.ts
    - src/moderation/moderation.module.ts
    - src/moderation/moderation-startup.reporter.ts
    - src/moderation/moderation-startup.reporter.spec.ts
  modified:
    - src/rest/cloudinary/cloudinary.controller.ts
    - src/rest/cloudinary/cloudinary.module.ts
    - src/rest/cloudinary/cloudinary.controller.int-spec.ts
    - test/auth/auth-test-app.ts
    - test/app.int-spec.ts
decisions:
  - "Il mimetype passato al moderatore nasce da detectImageMimetype(file.buffer), mai dal tipo dichiarato dal client; il filename è file.originalname"
  - "Se la firma non è riconosciuta (impossibile dopo la pipe) il servizio lancia BadUserInputException.of(['file']) come difesa"
  - "Il reporter usa il logger 'Moderation' e tace con la moderazione attiva (secondo caso unit dedicato)"
  - "ModerationModule è importato solo da CloudinaryModule (non da AppModule): il reporter si monta attraverso CloudinaryModule"
metrics:
  duration: "~15 min (di cui ~4 min per npm run test:int)"
  completed: 2026-10-29
---

# Phase 10 Plan 17: moderazione nel flusso di upload Summary

Ogni `POST /cloudinary/uploadImage` passa ora da `PortraitUploadService`: il buffer già validato dalla pipe del piano 10-12 viene moderato con il tipo rilevato dalla firma e caricato su Cloudinary solo se approvato; un rifiuto risponde 422 `IMAGE_REJECTED` con le sole categorie, un Sightengine irraggiungibile 503 `IMAGE_MODERATION_UNAVAILABLE`, e in entrambi i casi Cloudinary non viene mai chiamato. Senza chiavi Sightengine (fuori produzione) si monta `DisabledImageModerator` con un WARN al boot; l'harness monta sempre `FakeImageModerator`.

## Task e commit

| Task | Nome | Commit | Tipo |
|------|------|--------|------|
| 1 RED | servizio moderato, modulo e reporter (unit) | `1302118` | test |
| 1 GREEN | `PortraitUploadService`, `ModerationModule`, `ModerationStartupReporter` | `1f82e77` | feat |
| 2 RED | boot reale e flusso sul filo, `moderator` nell'harness | `1b83963` | test |
| 3 GREEN | montaggio nel controller, nel modulo REST e nell'harness | `e95d2db` | feat |

## Rossi attesi visti

- Task 1: le due spec unit falliscono in compilazione, `Could not locate module src/moderation/moderation-startup.reporter` e `./portrait-upload.service` (moduli non ancora creati).
- Task 2 (4 rossi su 72):
  - boot reale `mounts the image moderation disabled without Sightengine keys (D-14)`: `ImageModerator` non registrato in `AppModule`;
  - `answers 422 IMAGE_REJECTED with the categories and never reaches Cloudinary (D-12)`: atteso 422, ricevuto 201;
  - `answers 503 IMAGE_MODERATION_UNAVAILABLE and never reaches Cloudinary (D-14)`: atteso 503, ricevuto 201;
  - `moderates the detected image type before uploading (D-12)`: `moderator.calls` vuoto.
- Il caso esistente `uploads a JPEG sent as octet-stream (C11)` è rimasto verde anche durante il RED (il fake approva di default).

## Verdi finali

- Unit `npx jest src/rest src/moderation --selectProjects unit`: 7 suite / 74 test.
- Integration mirata `npx jest src/rest src/moderation test/app.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 72 test (controller 11, boot reale 61).
- `npm run test:int`: 92 suite / 1207 test (233 s).
- `src/config/env-example.drift.spec.ts`: 3/3 (nessuna lettura env nuova).
- `npm run build` esce 0; `git diff --exit-code src/schema.gql` esce 0; righe rimosse dallo schema contro `origin/develop`: 0.
- `EXPECTED_THROTTLED_HANDLERS` invariato a 8 voci: `uploadImage` resta `@Throttled()` sul controller.

## Contratto REST finale di `uploadImage`

- 201 `{ url }` con immagine approvata (o moderazione disattivata fuori produzione).
- 422 `{ statusCode: 422, code: 'IMAGE_REJECTED', message: 'Immagine non ammessa', reasons: [...] }`: nessun punteggio, Cloudinary non chiamato.
- 503 `{ statusCode: 503, code: 'IMAGE_MODERATION_UNAVAILABLE', message: 'Moderazione delle immagini non disponibile, riprova più tardi' }`: Cloudinary non chiamato.
- Restano: 400 `BAD_USER_INPUT` «Input non valido: file» (file mancante, non immagine, due file), 413 oltre 5 MiB, 429 dal throttler, 500 codificato in produzione per gli errori di Cloudinary.

## Deviazioni dal piano

- `moderation-startup.reporter.spec.ts` ha un secondo caso, `stays silent at boot when image moderation is enabled (D-14)`, per la regola «nessun WARN se enabled» del behavior (il piano la elencava nello stesso `it`).
- Nel boot reale il caso controlla anche che `ModerationStartupReporter` sia montato, come chiesto dall'orchestratore.

Nessun'altra deviazione: piano eseguito come scritto.

## Threat model

- T-10-65: mitigata da `PortraitUploadService` (moderazione prima dell'upload) e dai casi «never reaches Cloudinary».
- T-10-66: mitigata dal 503 senza upload (caso unit e caso sul filo).
- T-10-67: boot rifiutato in produzione senza chiavi (piano 10-15) più WARN del reporter fuori produzione.
- T-10-68: boot reale con chiavi svuotate (adapter disattivato), harness con il fake; nessuna chiamata di rete a Sightengine o Cloudinary nei test.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/rest/cloudinary/portrait-upload.service.ts`, `src/rest/cloudinary/portrait-upload.service.spec.ts`, `src/moderation/moderation.module.ts`, `src/moderation/moderation-startup.reporter.ts`, `src/moderation/moderation-startup.reporter.spec.ts`.
- Commit presenti: `1302118`, `1f82e77`, `1b83963`, `e95d2db`.
