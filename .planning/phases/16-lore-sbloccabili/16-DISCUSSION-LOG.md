# Phase 16: Lore sbloccabili - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 16-lore-sbloccabili (BE), discussa insieme alla FE Phase 17 dal repo FE
**Areas discussed:** Dati e wire; Geografia; Nemico noto; Studio (fondazioni BE); Foglio esiti; Fuori Biblioteca; Ritratto; Biblioteca (FE)
**Mode:** interattivo, 2 chiamate `AskUserQuestion` da quattro domande condivise con il discuss FE; fatti letti prima delle domande (modulo lore, modelli, creazione, completamento viaggio, teleport, salto dell'accettazione, risoluzione individuale e di party, publisher dei personaggi; due inventari DB di sola lettura: 473 lore per tipo e matrice dei collegamenti, 167 città tutte con pagina che collega 1–3 regioni e 1 stato, 206 nemici con 1–2 lore e 16 pagine condivise, 750 quest per tipo e marker, 30 study, 4 personaggi, 26 esiti). La parte FE è in `../Klimmeck-Guide/.planning/phases/17-unlockable-lore/17-DISCUSSION-LOG.md`.

---

## Dati e wire

| Option | Description | Selected |
|--------|-------------|----------|
| Lista di id sul personaggio (Recommended) | `Character.status.unlockedLore: [ID!]!` a DB e sul filo; il FE rilegge `lores` solo al cambio e sa quali voci sono nuove (~26 byte per lore a evento) | ✓ |
| Solo un contatore sul filo | Lista a DB, `status.unlockedLoreCount: Int!` sul filo | |
| Nulla sul filo | Lista interna; il FE rilegge a ogni `characterUpdated` | |
| Collezione dedicata | `characterlore { character, lore, unlockedAt, source }` + id sul filo; `characterUpdated` riemesso a mano | |

## Geografia

Dati nella domanda: ogni lore di città collega 1 stato e 1–3 regioni (88 → 1, 74 → 2, 5 → 3); 17 regioni, 8 stati; es. Murnborim → Regno della Madre, Lamstone, Lontano Nord. Arrivo = marker della città (POI `city`); i 475 POI del territorio non contano.

| Option | Description | Selected |
|--------|-------------|----------|
| Città + regioni + stato, nascita e arrivo (Recommended) | Stesso pacchetto nei due casi; nessuna cascata sulle altre lore collegate | ✓ |
| Nascita città + regioni; arrivo solo città | Lettura letterale del 29/10: 16 regioni e 8 stati mai sbloccati viaggiando | |
| Città + regioni, nascita e arrivo (niente stati) | Stati solo dallo studio | |

## Nemico noto

Dati: 206 nemici con 1–2 lore (167 enemy, 43 animal, 2 character); 116 pagine di bestiario per 167 nemici, 16 condivise (Draghi cuccioli 8, Draghi adulti 8, Licantropo 6, Orchi e goblinoidi 6, Goblin 4, Golem 3…).

| Option | Description | Selected |
|--------|-------------|----------|
| Conosce la specie (Recommended) | `known` = tutte le lore del nemico sbloccate; nessun secondo elenco a DB | |
| Solo il nemico esatto sconfitto | Secondo insieme `knownEnemies` (id); la pagina «Goblin» si apre ma il Goblin boss resta in ombra | ✓ |

## Studio

Dati: 30 «Ricerche in biblioteca a <città>», nessuna con magia fissa né sorteggio; pool di 110 lore (knowledge 13, god 18, religion 18, ceremony 18, material 9, state 8, character 26).

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre, 100 % (Recommended) | Env con default 1, UAT deterministica | |
| 50 % | Metà delle ricerche a vuoto | ✓ |
| 25 % | Rara | |

## Foglio esiti (FE, con ricaduta sul contratto)

| Option | Description | Selected |
|--------|-------------|----------|
| Studio e prima pagina del bestiario (Recommended) | Righe «Conoscenza appresa» e «Nuova pagina del Bestiario»; il BE aggiunge `QuestResult.loreUnlocked: [Lore!]!` con le sole lore nuove | ✓ |
| Solo lo studio | | |
| Nulla sul foglio | | |

## Fuori Biblioteca (FE, con ricaduta sul contratto)

| Option | Description | Selected |
|--------|-------------|----------|
| Mappa: solo il nome; quest intere (Recommended) | `City.relatedLore` null per i giocatori finché chiusa; `Quest.infos.relatedLore` intera | ✓ |
| Nessun filtro fuori dalla Biblioteca | | |
| Filtro ovunque | | |

## Ritratto e Biblioteca (FE)

Silhouette nera (Recommended) scelta; segnalibro «Nuovo» scelto al posto di «Nessun segno» (Recommended): dettagli nel log FE.

## Claude's Discretion

Forma della funzione di geografia, del field resolver e della cache; sede del filtro; forma del backfill one-off e del report; nome dell'env; ordine delle `loreUnlocked`; fixture e harness; l'imboscata vinta segue la regola dei nemici (default tecnico da vetare).

## Deferred Ideas

Conoscenza per specie; collezione dedicata con storico; conoscenza comune; filtro della narrativa; lore da quest narrative, negozi, pet; link fra lore (v2); storia delle scoperte.
