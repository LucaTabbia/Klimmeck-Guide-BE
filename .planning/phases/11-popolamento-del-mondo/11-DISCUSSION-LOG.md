# Phase 11: Popolamento del mondo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-01
**Phase:** 11-popolamento-del-mondo
**Areas discussed:** Intake nemici e fasce, Catalogo esistente e file, Quest fisse e premi, Lore, immagini e script
**Mode:** interactive (AskUserQuestion, recommended option first; blocks of four questions per area; free-text answers re-proposed for confirmation). Scouting before the questions: Explore agent on the BE schemas/CLI/prior decisions, read-only inventory of the dev DB, extraction of the 106 creature cards from the source text, fetch of the bestiary site the user pointed to.

---

## Intake nemici e fasce

### Famiglie di nemici nuovi (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Umani ostili | Briganti, cultisti, pirati, mercenari, necromanti… | ✓ |
| Giganti | Colline, gelo, fuoco, tempeste | ✓ (solo delle colline) |
| Orchi e tribali | Orco, capo orco, sciamano goblin, bugbear | ✓ |
| Leggendari come boss | Le 14 schede leggendarie come nemici per i boss della Phase 13 | ✓ |

**User's choice:** tutte e quattro, con la correzione «I giganti sono solo delle colline, non ne esistono di altri tipi» e il riferimento https://dungeonedraghi.it/compendio/bestiario/ «per tutto ciò che riguarda le entry».

### Schede multi-variante

| Option | Description | Selected |
|--------|-------------|----------|
| Una voce per variante (Recommended) | Fascia e XP propri, lore condivisa per scheda | ✓ |
| Una voce per scheda, fascia più bassa | Meno nemici | |
| Una voce per scheda, fascia media | XP medio | |

### Umani ostili: gruppi dei 21 PNG del bestiario (multi-select)

| Option | Description | Selected |
|--------|-------------|----------|
| Criminali | Bandito 25, Picchiatore 100, Capo dei Banditi 450, Assassino 3.900 | ✓ |
| Cultisti e incantatori oscuri | Cultista 25, Cultista Fanatico 450, Sacerdote corrotto 450, Mago rinnegato 2.300, Arcimago 8.400 | ✓ |
| Guerrieri e mercenari | Combattente Tribale 25, Berserker 450, Veterano 700, Cavaliere rinnegato 700, Gladiatore 1.800 | ✓ |
| Bande solo come quantità | Nessuna voce «banda»: N × Bandito in `infos.enemies` (Phase 13) | ✓ |

### Fasce e titoli

| Option | Description | Selected |
|--------|-------------|----------|
| rookie 1–2, adventurer 3–4, paladin 5–10, mage 11–16, hero 17–20, legend = leggendari (Recommended) | Il rookie affronta lupi, cinghiali, scheletri, banditi (PE ≤ 100) | ✓ |
| rookie solo livello 1 | PE ≤ 50 | |
| Nessun nemico rookie | Il documento parte da avventuriero | |

### XP dei nemici

| Option | Description | Selected |
|--------|-------------|----------|
| Scalati alla LEVEL_TABLE, ÷7 arrotondati (Recommended) | xp = PE × 50.000 / 355.000 | ✓ |
| Tali e quali dal documento | Clamp a 50.000 | |
| Scalati ÷10 | Progressione più lenta | |

### HP, danni e debolezze

| Option | Description | Selected |
|--------|-------------|----------|
| Dal bestiario, scala ×100 (Recommended) | PF ×100, danno medio per round per tipo ×100, vulnerabilità + deduzioni dal testo | ✓ |
| Tabella per fascia | HP/danni fissi per titolo | |
| Dal bestiario, scala da decidere nella ricerca | Il researcher misura gli equipaggiamenti a DB | |

**Notes:** la scala degli equipaggiamenti già a DB rispetto al placeholder resta un research flag (CONTEXT D-12).

---

## Catalogo esistente e file

### Origine dei file rispetto al catalogo a DB

| Option | Description | Selected |
|--------|-------------|----------|
| Esporta e poi estendi (Recommended) | Esportatore una tantum, poi aggiunte nei file | ✓ |
| Riscrivi tutto dal documento | Catalogo attuale sostituito | |
| Solo le collezioni nuove nei file | Equip/loot/magie restano a mano | |

### Formato e layout

| Option | Description | Selected |
|--------|-------------|----------|
| YAML, una cartella per collezione, un file per tema (Recommended) | Prosa in blocchi `\|`, file da 20–40 voci, dipendenza `yaml` | ✓ |
| JSON, un file per collezione | Nessuna dipendenza, prosa poco leggibile | |
| JSON, un file per entità | ~600 file | |
| YAML, un file per collezione | Un unico file lungo | |

### Chiave naturale e unicità

| Option | Description | Selected |
|--------|-------------|----------|
| Nome come chiave + indice unico (Recommended) | Upsert per nome, indice case-insensitive | ✓ (poi superata) |
| Chiave stabile `key` (slug) | Campo interno additivo | |
| Nome come chiave, senza indice | Solo controllo nello script | |

**Notes:** alla domanda successiva sulle due «Flinas» l'utente ha respinto il nome come identità («metti un id univoco nelle città… che senso ha usare un nome come ID?») e, alla proposta di una chiave nuova, ha precisato «le entry a DB hanno già un id univoco» → **decisione finale: identità = `_id` Mongo nei file** (CONTEXT D-01); la città `northVillage` si chiama **Kliever**.

### Orfani e cancellazioni

| Option | Description | Selected |
|--------|-------------|----------|
| Report e flag esplicito (Recommended) | `--verify` elenca, `--apply` non cancella, `--prune <collezione>` esplicito | ✓ (scelta di Claude dopo le risposte) |
| Il file è la verità | `--apply` allinea tutto | |
| Mai cancellare | Pulizia manuale | |

**User's choice (free text):** «Elencami i 6 POI errati e che errore hanno, così li fixiamo. Le quest di prova si possono eliminare» e poi «Cosa non è presente nei file?». I 6 POI sono stati elencati con città, errore e correzione; dopo l'export nulla del catalogo resta fuori dai file, quindi gli unici orfani sono le quest di prova: cancellate da una voce esplicita di `content/fixes/`; per il futuro vale la prima opzione (CONTEXT D-05).

### Pet, magie e oggetti

| Option | Description | Selected |
|--------|-------------|----------|
| Pet nuovi, oggetti unici, cibo tarato; magie solo se mancano (Recommended) | 6–8 cavalcature + 3–4 nuove, ~20 equip unici, `power` del cibo sulla regola 1 power = 3 min, magie sciamaniche/del Vuoto assenti | ✓ |
| Solo pet e oggetti unici | Magie e loot invariati | |
| Revisione completa | Anche le 77 magie e i 228 oggetti | |

---

## Quest fisse e premi

### Quali città ricevono crime, guard e study

| Option | Description | Selected |
|--------|-------------|----------|
| Per taglia e carattere (Recommended) | Villaggi heal + job/hunt; città + guard; capitali + guard + crime; crime anche a Ferrion, Necrorian, città di mare di Liberia; study senza magia nelle capitali e a Liberia; study con magia solo a Valantar | ✓ con modifiche |
| Solo per taglia | Study solo a Valantar | |
| Tutte le città hanno tutto | | |

**User's choice:** opzione 1 modificata: study sorteggiata anche nelle città (non tutte); **Necrorian senza heal, study, job, crime, guard** (lore); **Ferrion senza crime** (è già una prigione); crime sorteggiata anche nelle città; hunt sempre con un animale e mai troppo complessa; job e hunt ovunque come via di guadagno facile a ogni livello; job più facile della hunt con premi adeguati.

### Regola job vs hunt

| Option | Description | Selected |
|--------|-------------|----------|
| Hunt dove la zona ha animali, altrimenti job (Recommended) | Animale dalla zona | ✓ con modifica |
| Hunt nei villaggi, job in città e capitali | | |
| Metà e metà per regno | | |

**User's choice:** opzione 1 «ma fa in modo che sia anche randomico. Non tutti i villaggi della stessa zona hanno hunt, altrimenti un avventuriero di livello 1, con sole quest hunt attorno potrebbe essere bloccato».

### Conferma della lettura (job e hunt)

| Option | Description | Selected |
|--------|-------------|----------|
| Confermo (Recommended) | Una sola fra job e hunt per città, hunt solo animali facili, al massimo una città su due per regione | ✓ con eccezione |
| Job ovunque, hunt in più dove ci sono animali | | |

**User's choice:** «Confermo tutto ad eccezione di una regola: una città può avere sia un job sia un hunt» → job ovunque (eccetto Necrorian) e hunt in più, sorteggiata (CONTEXT D-17).

### Tabella premi per tipo × fascia

| Option | Description | Selected |
|--------|-------------|----------|
| Va bene così (Recommended) | Moltiplicatori 1/2/5/12/25; job 40 rame + 10 XP; hunt 1 argento + 30 XP; guard 2 argento + 40 XP; crime 3 argento + 40 XP; study 60 XP; heal nulla; dungeon 4 argento + 80 XP + randomLoot | ✓ con modifica |
| Più generosa | ×2 | |
| Più avara | ÷2 | |

**User's choice:** «Va bene così, tanto le andrò a modificare io nel caso. I job non danno xp» → job 0 XP (CONTEXT D-19).

---

## Lore, immagini e script

### Lore.unlocked

| Option | Description | Selected |
|--------|-------------|----------|
| true su tutte le lore (Recommended) | Campo a schema, Phase 16 lo ridefinisce | |
| true solo sulle 12 lore di città | Le nuove restano chiuse | |
| Rimuovo il campo ora | Modifica SDL non additiva da dichiarare; FE da allineare | ✓ |

**Notes:** il FE seleziona `unlocked` in `lib/graphql/queries/lore_queries.dart`: serve un quick task FE prima della merge della PR BE (CONTEXT D-25).

### Ambienti e chi lancia lo script

| Option | Description | Selected |
|--------|-------------|----------|
| Dev ora (Claude), staging/produzione l'utente col runbook (Recommended) | Come la migrazione 10-26 | ✓ |
| Anche produzione in questa fase | Report `--verify` allegato alla PR | |
| Solo dev adesso | Produzione rinviata | |

### Tie-break dei nomi doppi e immagini

Non chiesti: risolti dalla decisione sull'identità per `_id` (i nomi possono ripetersi fra tipi) e dalla decisione del 2026-10-29 sulle immagini (mappa `id → URL` compilata dall'utente, CONTEXT D-24).

---

## Claude's Discretion

Raggruppamento e nomi dei file; libreria YAML e risoluzione del percorso di `content/`; proposte di pet, magie, oggetti unici e cibo regionale; deduzione di habitat, debolezze e magie dei nemici; livelli dei PNG e dei leggendari dalla tabella «Medio»; sorteggi con seme e testi delle quest fisse; forma del report e codici d'uscita.

## Deferred Ideas

Formula del party per i boss leggendari e bande come quantità (Phase 13); `City.size` dal suffisso di `CityType` e incoerenza `LootItemInput` (Phase 12); rilettura dei `power` del cibo se la costante della Phase 14 cambia; conoscenza per personaggio (Phase 16); mutation admin di catalogo (hardening).
