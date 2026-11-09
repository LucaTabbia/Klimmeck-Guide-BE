# Phase 19: Revisione dei modelli - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 19-revisione-dei-modelli (BE), discussa insieme alla FE Phase 19 dal repo FE, nella stessa sessione della Phase 18 (branch impilato)
**Areas discussed:** Catalogo; Personaggio; Mondo e pulizia; Collocazione · Stato dei pet; XP al pet; Tetto xp
**Mode:** interattivo, 2 chiamate `AskUserQuestion` (4 domande a scelta multipla + 3 di seguito). Fatti letti prima: tutti i file di `src/models` (campi, enum, ref), conteggi d'uso fuori dai modelli in BE e FE, elenco dei tipi dello SDL, due inventari DB di sola lettura (debolezze e magie dei nemici, pet, POI con back-link e quest per marker, personaggi, pool delle città, lore con immagine, magie), i 44 pet con HP, danni, prezzo e vendibilità.

---

## Catalogo (multi-select)

| Option | Selected |
|--------|----------|
| Enemy: `weaknesses { base, energy }` (Recommended) | ✓ |
| Enemy: magie per riferimento | ✓ |
| Pet: via lo stato dal catalogo | ✗ — «I campi dei pet servono, nel motore di combattimento possono ricevere danni e il danno scala in base agli xp accumulati»; da qui la regola nuova «una percentuale degli xp ottenuti in un combattimento vengono dati anche al pet» |
| Spell: `damages` + via `requiredLearnTime` | ✗ — «requiredLearnTime andrà rivisto, ne parleremo in una sessione separata in cui decideremo come vengono selezionate le magie che vengono imparate» |

## Personaggio (multi-select)

| Option | Selected |
|--------|----------|
| Un solo inventario `ownedItems` (Recommended) | ✗ |
| `wornEquipment` e `feet` | ✓ |
| Una sola lista di magie | ✓ |
| Via `maxActiveSpells` dal modello | ✓ (sul filo resta calcolato) |

## Mondo e pulizia (multi-select)

| Option | Selected |
|--------|----------|
| Via il back-link `POI.quest` (Recommended) | ✓ |
| City: `shop { equipment, loot, pets }` | ✓ |
| Nomi: `Lore.imagePath`, enum, `KGNotification` | ✓ |
| FE: parser fragili | ✓ |

## Collocazione

| Option | Selected |
|--------|----------|
| Coppia 19 dopo la 18 (Recommended) | ✓ |
| Prima della 18 | |
| Due coppie (19 catalogo + mondo, 20 personaggio) | |

## Stato dei pet

| Option | Selected |
|--------|----------|
| Stato per pet posseduto sul personaggio (Recommended) | ✓ |
| Lasciare com'è per ora | |

## XP al pet

| Option | Selected |
|--------|----------|
| Piano della fase 19, 25 % (Recommended) | |
| Piano della fase 19, 10 % | ✓ con precisazione: «10 % degli xp ottenuti dal solo nemico (senza quest)» |
| Piano della fase 19, 50 % | |
| Fase separata (20) con il motore | |

## Tetto xp

| Option | Selected |
|--------|----------|
| Nessun tetto, `maxXp` da rivedere (Recommended) | |
| Tetto a `maxXp` | ✓ «vanno rivisti quelli settati a catalogo (aiutami nel deciderli in base a quanto sono rari e forti)» → tabella in `pets-maxxp-proposal.json` (D-05) |

## Aggiunta a discuss chiuso (stessa sera, in chat)

- Utente: «Il modello Pet andrebbe rivisto in modo da dargli damages: { defense: ; attack: } o qualcosa di simile» → poi «la cosa migliore è avere attack: Damages e defense: Damages» → D-15: due campi piatti `Pet.attack` e `Pet.defense` (`Damages { base, energy }`), `Pet.damages` tolto; migratore che sposta i danni attuali in `attack` e lascia `defense` vuoto per la cura a DB.
