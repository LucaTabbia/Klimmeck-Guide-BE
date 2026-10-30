# Runbook — migrazione dei riferimenti `Mixed` (Phase 10, D-17d)

Runbook dell'utente per migrare i riferimenti fra documenti salvati come stringa esadecimale in `ObjectId`, prima e subito dopo il deploy del codice della Phase 10 (wave 8, piani 10-26..10-29). Lo script è `src/migrations/run-mixed-refs.ts`, compilato in `dist/migrations/run-mixed-refs.js`.

**Legame con la PR:** la PR della Phase 10 resta in **draft** finché i passi 1-4 dell'ordine non sono eseguiti e il report JSON di `--verify` della produzione (residui a 0) non è allegato alla PR. Solo allora la PR si marca pronta e si procede al deploy (passi 5-7).

## Perché

Fino alla Phase 9 `@nestjs/mongoose` salvava 34 riferimenti (in 10 collection: `users`, `pendingquests`, `characters`, `quests`, `cities`, `pointsofinterest`, `enemies`, `lore`, `equipmentitems`, `questresults`) come tipo `Mixed`: nel database convivono id salvati come `ObjectId` e id salvati come stringa esadecimale. Il codice della Phase 10 li ritipizza come `ObjectId`; da quel momento Mongoose converte i filtri in `ObjectId` e i riferimenti rimasti in stringa **non vengono più trovati** (corsia standard occupata invisibile, magie attive ed equipaggiamento legacy ignorati da sweep e risoluzioni).

Per questo la migrazione va eseguita in produzione **PRIMA** del deploy del codice di questa fase. Lo script converte solo le stringhe di 24 caratteri esadecimali minuscoli; le altre stringhe restano intatte. È idempotente: una seconda esecuzione modifica 0 documenti. Nello stesso giro normalizza il campo `type` scalare dei punti d'interesse in una lista.

## Prerequisiti

- **MongoDB ≥ 4.2** in produzione e sulla copia (assunzione A1 ancora aperta: va verificata per prima cosa). In mongosh:

    ```bash
    mongosh "<uri di produzione>" --quiet --eval "db.version()"
    ```

    Sotto 4.2 lo script si ferma da solo senza scrivere (exit 2, `{"error":"MongoDB >= 4.2 is required for the reference migration"}`).

- Accesso in **scrittura** al database di produzione e a quello della copia.
- **Node 22** (`node --version`), necessario anche per l'opzione `--env-file`.
- Strumenti `mongodump`, `mongorestore` e `mongosh` installati.
- La build della versione di questa fase disponibile in locale, dalla radice del repo backend sul branch della Phase 10:

    ```bash
    npm ci && npm run build
    ls dist/migrations/run-mixed-refs.js
    ```

- Due file d'ambiente **fuori dal repo** (mai committati), ciascuno con le sole chiavi `MONGO_URI` e `DB_NAME`: uno per la copia (`<file env della copia>`) e uno per la produzione (`<file env di produzione>`). Esempio di forma, con soli placeholder:

    ```bash
    MONGO_URI=<uri della copia>
    DB_NAME=<nome del database>
    ```

## Ordine

Ogni passo si esegue solo se il precedente è andato a buon fine. Ogni comando dello script stampa **una riga JSON**: conservare i report di `--verify` della copia e della produzione (vanno allegati alla PR).

1. **Backup** della produzione:

    ```bash
    mongodump --uri "<uri di produzione>" --out <cartella del backup>
    ```

2. **Ripristino su una copia** (un database o un cluster separato, mai la produzione):

    ```bash
    mongorestore --uri "<uri della copia>" <cartella del backup>
    ```

3. **Prova sulla copia**, nell'ordine:

    ```bash
    node --env-file=<file env della copia> dist/migrations/run-mixed-refs.js --dry-run
    node --env-file=<file env della copia> dist/migrations/run-mixed-refs.js --apply
    node --env-file=<file env della copia> dist/migrations/run-mixed-refs.js --verify
    node --env-file=<file env della copia> dist/migrations/run-mixed-refs.js --apply
    ```

    Atteso: `--dry-run` exit 0 con i residui per percorso (nessuna scrittura); `--apply` exit 0 con i documenti modificati; `--verify` **exit 0** (tutti i `residual` e `poiTypeScalars` a 0); la seconda `--apply` exit 0 con **0 modificati** (tutti i `modified` a 0). Se `--verify` esce 1 sulla copia, fermarsi e non toccare la produzione.

4. **Produzione, con il codice ATTUALE ancora in esecuzione** (il codice precedente legge già sia gli `ObjectId` sia le stringhe, quindi non si interrompe nulla):

    ```bash
    node --env-file=<file env di produzione> dist/migrations/run-mixed-refs.js --dry-run
    node --env-file=<file env di produzione> dist/migrations/run-mixed-refs.js --apply
    node --env-file=<file env di produzione> dist/migrations/run-mixed-refs.js --verify
    ```

    Atteso: `--verify` exit 0. Allegare alla PR il report JSON di `--verify` della copia (passo 3) e della produzione (questo passo), poi marcare la PR pronta.

5. **Deploy** del codice di questa fase (merge della PR e rilascio come di consueto).

6. **OBBLIGATORIO subito dopo il deploy**: di nuovo `--apply` e poi `--verify` in produzione. Chiude la finestra in cui il codice vecchio, ancora in esecuzione fra il passo 4 e il deploy, poteva scrivere riferimenti in stringa; essendo idempotente non tocca i documenti già migrati.

    ```bash
    node --env-file=<file env di produzione> dist/migrations/run-mixed-refs.js --apply
    node --env-file=<file env di produzione> dist/migrations/run-mixed-refs.js --verify
    ```

7. **Controllo del log al boot**: il verificatore di sola lettura (`MixedRefsVerifier`) gira all'avvio del backend. Nei log del primo avvio dopo il deploy NON deve comparire l'ERROR «Ref stringa ancora da migrare: …» (riporta solo `collection:path=n`). Se compare, rieseguire `--apply` e poi `--verify` come al passo 6 (rimedio); il verificatore non blocca mai l'avvio.

## Rollback

- **Codice:** il codice precedente legge anche gli `ObjectId`, quindi per tornare indietro basta ridistribuire la versione precedente. La migrazione **non** si annulla: i riferimenti convertiti restano `ObjectId` e sono letti correttamente dal codice vecchio.
- **Dati:** ripristinare il dump SOLO se lo script ha prodotto dati sbagliati (per esempio un riferimento convertito che non doveva esserlo). Il ripristino sovrascrive le collection con lo stato del passo 1 e perde le scritture successive:

    ```bash
    mongorestore --uri "<uri di produzione>" --drop <cartella del backup>
    ```

## Dopo la verifica

- I lettori tolleranti del codice (`refIdOf`, `idForms`, `sameId`, `objectIdFromHex`) **restano** in questa fase: dopo la migrazione sono innocui e coprono la finestra fra il passo 4 e il passo 6.
- La loro rimozione è nel backlog v1.1 e si fa solo dopo che l'utente ha confermato la produzione migrata (report di `--verify` a 0 e nessun ERROR del verificatore al boot).
- La verifica manuale è registrata in `.planning/phases/10-hardening-trasversale/10-VALIDATION.md` (tabella Manual-Only): finché non è fatta, la PR resta draft.

## Codici d'uscita e report

| Exit | Significato                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | esecuzione riuscita (`--dry-run`, `--apply`, oppure `--verify` senza residui)                                                                                                  |
| 1    | `--verify` ha trovato riferimenti in stringa ancora da migrare (almeno un `residual` > 0) o punti d'interesse con `type` scalare (`poiTypeScalars` > 0)                        |
| 2    | uso errato (nessuna modalità, modalità sconosciuta o più di una, `--help`, `MONGO_URI` o `DB_NAME` mancanti: nessuna connessione) oppure MongoDB sotto 4.2 (nessuna scrittura) |
| 3    | errore durante l'esecuzione (connessione, permessi, rete): la riga JSON contiene solo nome e codice dell'errore                                                                |

Senza modalità lo script stampa la riga d'uso ed esce 2. Esattamente una fra `--dry-run`, `--apply` e `--verify` è ammessa.

Il report è una sola riga JSON con **soli conteggi** (mai URI, host, nome del database o contenuto dei documenti):

```json
{
    "mode": "verify",
    "serverVersion": "<versione di MongoDB>",
    "paths": [
        {
            "collection": "characters",
            "path": "status.spells",
            "residual": 0,
            "modified": 0
        }
    ],
    "poiTypeScalars": 0,
    "poiTypeNormalized": 0
}
```

`paths` contiene una voce per ciascuno dei 34 percorsi: `residual` conta i documenti che, a fine esecuzione, hanno ancora riferimenti esadecimali in stringa (dopo `--apply` è 0), `modified` i documenti modificati da `--apply` (0 in `--dry-run` e `--verify`). `poiTypeScalars` conta i punti d'interesse con `type` ancora scalare, `poiTypeNormalized` quelli normalizzati in lista da `--apply`. In errore la riga è `{"error": "<nome o codice dell'errore>"}`.
