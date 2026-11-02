---
phase: 11-popolamento-del-mondo
plan: 15
subsystem: content
tags: [content, lore, BE-CONTENT-01, BE-CONTENT-03]
requires: ["11-13"]
provides:
  - "content/lore/culti-1.yaml: 27 schede (9 culti × god/religion/ceremony, Orgeal … Iarus)"
  - "content/lore/culti-2.yaml: 27 schede (9 culti × god/religion/ceremony, Mirwa … i quattro dei della fortuna in una sola terna)"
  - "content/lore/figure.yaml: 26 schede `character` collegate a regno, regione, culto, era e lore di città"
  - "content/lore/regni.yaml: 26 back-link (religioni principali e sovrani/figure di governo) nei `relatedLore` di 7 stati"
affects: [11-16, 11-17, 11-18, 11-19, 11-20, 11-21, 11-22, 11-23]
tech-stack:
  added: []
  patterns:
    - "generatore usa e getta nello scratchpad: spec JS con chiavi locali → YAML (`|-`, `image: null`, block list `relatedLore` con `# nome` risolto dai file di lore), id consumati in ordine da un solo `--new-id N`; non committato"
    - "back-link aggiunti con uno script python3 utf-8 che inserisce righe in coda al blocco `relatedLore` della voce, senza toccare altri campi"
key-files:
  created:
    - content/lore/culti-1.yaml
    - content/lore/culti-2.yaml
    - content/lore/figure.yaml
  modified:
    - content/lore/regni.yaml
decisions:
  - "Nome delle cerimonie: festa principale nominata dal testo; dove il testo non ne dà una (Ixelia, Iarus, Ueyar, Edite) «Feste del Culto della …», come da piano; Aphine usa il nome del rito «Il Canto dell'eroe»"
  - "La religione principale dell'Unione delle Fiamme è il Culto dei quattro (testo: «culto principale del Belleholm e dell'Unione delle fiamme»), non il Culto delle fiamme di Nydos, che è culto ufficiale dei Valan: il back-link segue il testo"
  - "Harken e Ferrion non riceve back-link: il testo non gli attribuisce né una religione né un sovrano (la governa la Grande Adunanza)"
  - "Liberia riceve i tre culti «principalmente a Liberia» (Mobus, Iarus, Bitya) e non tutte le otto divinità del Tempio dei grandi otto; il tempio è citato nelle singole religioni"
  - "Culti senza luoghi precisi («tutto il continente»): Ymone e Wirasil non puntano a regni; Wirasil punta al Culto delle fiamme (opposto), Xellmar al Vuoto (Piano Demoniaco), Edite alla magia di Klimmeck"
  - "Testo della Festa del massacro attenuato (razzie e ubriachezza, senza la violenza sessuale del documento): app per un pubblico generico"
metrics:
  duration: "~20 min"
  completed: 2026-11-02
  tasks: 3
  files: 6
---

# Phase 11 Plan 15: lore dei culti e delle figure Summary

I 18 culti del documento sono 54 schede (`god` dalla rappresentazione, `religion` da credo, discepoli e luoghi, `ceremony` dalle feste; i quattro dei della fortuna in un'unica terna) e le 26 figure storiche e presenti sono schede `character`, tutte collegate alla geografia e alla storia del piano 11-13; i regni ora rimandano alle loro religioni principali e ai loro sovrani.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | `9f417f9` | feat(content): add the first nine cults |
| 2 | `ac11a48` | feat(content): add the remaining nine cults |
| 3 | `b329cf0` | feat(content): add the historical figures and link the kingdoms |

## Conteggi

| File | god | religion | ceremony | character | totale |
|------|-----|----------|----------|-----------|--------|
| `content/lore/culti-1.yaml` | 9 | 9 | 9 | 0 | 27 |
| `content/lore/culti-2.yaml` | 9 | 9 | 9 | 0 | 27 |
| `content/lore/figure.yaml` | 0 | 0 | 0 | 26 | 26 |

Lore totali: 59 → 139. Figure: 26 (le intestazioni `####` con nome delle righe 1556-1635 sono 26; il «~27» del piano era una stima).

## Id delle schede (per i piani successivi)

- Culti 1 (prefisso `6ae7ff6624214746ad54a`): Orgeal `…ee7` god / `…ee8` Culto della morte / `…ee9` La Luna di Sangue · Teheia `…eea`/`…eeb` Culto del caos/`…eec` · Mobus `…eed`/`…eee` Culto del destino/`…eef` · Aphine `…ef0`/`…ef1` Culto dello scudo/`…ef2` · Nydos `…ef3`/`…ef4` Culto delle fiamme/`…ef5` · Wirasil `…ef6`/`…ef7` Culto della notte/`…ef8` · Ymone `…ef9`/`…efa`/`…efb` · Ixelia `…efc`/`…efd` Culto della sapienza/`…efe` · Iarus `…eff`/`…f00` Culto della bellezza/`…f01`.
- Culti 2 (prefisso `6ae7ffd05fa3295e56e4dc`): Mirwa `29`/`2a` Culto della vita/`2b` · Lizdum `2c`/`2d` Culto delle bestie/`2e` · Naleala `2f`/`30` Culto della madre/`31` · Bitya `32`/`33`/`34` · Ueyar `35`/`36` Culto della comunione/`37` · Enayr `38`/`39` Culto dell'armonia/`3a` · Edite `3b`/`3c`/`3d` · Xellmar `3e`/`3f` Culto della guerra/`40` · I quattro dei della fortuna `41`/`42` Culto dei quattro/`43`.
- Figure (prefisso `6ae8001b906eac0adda59a`): Dummel Regis `35`, Hilword Valantar `36`, Alexander Themoira I `37`, Alexander Themoira XXI `38`, Skargen Monteaspro III `39`, Venis Millhelm `3a`, Rufus Faris `3b`, Wismund Drustea `3c`, Hercia Drustea `3d`, Kolvar Drustea `3e`, Orgeal Indrek `3f`, Urvinass `40`, Horzazu `41`, Tanelia Ularen `42`, Vozaed Ferroscuro `43`, Amaerith `44`, Guerin Kerring `45`, Raybaut Phalan `46`, Azorius Telob `47`, Grande capo Ashen `48`, Aravae Miel `49`, Reavor Kyrell `4a`, Jur'gath `4b`, Solomon Quill `4c`, Alice Quill `4d`, Winmore Lobo `4e`.

## Back-link dei regni (`content/lore/regni.yaml`, +26 righe, solo in `relatedLore`)

| Stato | Religioni | Figure |
|-------|-----------|--------|
| Regno di Drustea | Culto dello scudo | Wismund, Hercia, Kolvar Drustea |
| Repubblica dei Valan | Culto delle fiamme, Culto della sapienza | Hilword Valantar |
| Teocrazia di Mirwa | Culto della vita | Alexander Themoira I, Alexander Themoira XXI |
| Unione delle Fiamme | Culto dei quattro | Guerin Kerring, Raybaut Phalan, Azorius Telob |
| Regno della Madre | Culto della madre | Skargen Monteaspro III, Tanelia Ularen, Vozaed Ferroscuro |
| Liberia | Culto del destino, Culto della bellezza, Culto della provvidenza | Rufus Faris, Venis Millhelm |
| Necrorian e il Glounet | Culto della morte | Orgeal Indrek, Urvinass |
| Harken e Ferrion | — | — |

Altri collegamenti bidirezionali: Orgeal god ↔ Orgeal Indrek; Aphine god ↔ Hilword Valantar; Culto della vita ↔ Alexander Themoira XXI; Culto della madre ↔ Skargen Monteaspro III (4 righe aggiunte ai file dei culti nel commit del Task 3).

## Verifiche

- Task 1, 2, 3: `node dist/content/run-content.js --check` → exit 0, `errors: []`, 155 warning tutti `città senza lore` (invariati, nessun warning di nome doppio); conteggio lore 86 → 113 → 139.
- Task 1, 2, 3: `npx jest src/content/content-tree.spec.ts --selectProjects unit` → `Tests: 2 passed, 2 total`; `pgrep -fl jest` vuoto.
- Acceptance: `grep -c "type: god|religion|ceremony"` = 9/9/9 in entrambi i file dei culti; `grep -c "type: character" content/lore/figure.yaml` = 26; `git diff HEAD~1 -- content/lore/regni.yaml | grep -cE "^\+\s+- '[0-9a-f]{24}'"` = 26 (≥ 8), nessuna riga rimossa.
- Controllo extra: ogni commento `# nome` dei `relatedLore` di `content/lore/*.yaml` coincide col nome della voce puntata (0 discrepanze).
- `git diff --exit-code src/schema.gql` → 0. Nessun accesso al DB, nessun `.env`.

## Deviations from Plan

### Chiarimenti applicati

**1. [Rule 1 - Bug] Back-link dell'Unione delle Fiamme**
- **Trovato durante:** Task 2/3
- **Problema:** il piano dice «Culto delle fiamme ↔ Unione delle Fiamme si collega nel Task 3», ma nel documento il Culto delle fiamme (Nydos) è culto ufficiale della Repubblica dei Valan; il culto principale dell'Unione è il Culto dei quattro.
- **Fix:** Unione delle Fiamme → Culto dei quattro; Repubblica dei Valan → Culto delle fiamme e Culto della sapienza.
- **File:** `content/lore/regni.yaml` · **Commit:** `b329cf0`

**2. [Rule 2 - Coerenza] Back-link dai culti alle figure**
- **Trovato durante:** Task 3
- **Problema:** il piano chiede «Orgeal Indrek ↔ Orgeal, il Dio dei morti» (bidirezionale) ma `files_modified` del Task 3 non include i file dei culti.
- **Fix:** 4 righe aggiunte solo in `relatedLore` di `culti-1.yaml`/`culti-2.yaml` (Orgeal, Aphine, Culto della vita, Culto della madre verso i rispettivi eletti).
- **Commit:** `b329cf0`

Altrimenti il piano è stato eseguito come scritto.

## Known Stubs

Nessuno: `image: null` è il valore atteso fino al passaggio immagini (D-24).

## Self-Check: PASSED

- FOUND: content/lore/culti-1.yaml, content/lore/culti-2.yaml, content/lore/figure.yaml
- FOUND: 9f417f9, ac11a48, b329cf0
