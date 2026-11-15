# Phase 24: Origini delle magie, quest void e shamanic - Context

**Raccolto:** 2026-11-15 (discuss interattivo, congiunto con la FE Phase 23 «Spell Origins, Void and Shamanic Quests»)
**Stato:** pronto per il plan — ramo `feat/24-origini-magie-quest-void-shamanic` impilato su `fix/23-dungeon-xp-and-innkeeper-corrections` (PR #43 draft).

Il contesto autorevole per entrambe le fasi è nel repo FE:
`/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/23-spell-origins-void-and-shamanic-quests/23-CONTEXT.md` (decisioni D-01..D-19, stessa numerazione).

## Parte BE delle decisioni

- D-01, D-04: origine su ogni magia (`void`, `arcane`, `shamanic`; emendato il 2026-11-15: `arcane` e non `magic`, il tipo di quest resta `magic` e insegna l'origine `arcane`), solo classificazione, nessun effetto sul combattimento.
- D-02, D-03: origini e circa 45 magie nuove scritte a DB dall'orchestratore dopo la revisione dell'utente; niente contenuto nel repo.
- D-07, D-08: livello minimo al posto di `minXpToLearn` (cambio SDL non additivo dichiarato; conversione con `level-table.ts`); tutti i lettori passano al livello (sorteggio delle quest, premi per titolo, opzioni e rivalidazione dei premi dell'oste).
- D-09, D-10: tipi di quest `shamanic` e `void` identici a `magic`; il sorteggio prende solo le magie dell'origine del tipo.
- D-11, D-12: `void` solo a Necrorian; `shamanic` nelle due capitali nuove, da mage in su; il generatore non crea quest di Necrorian con titolo minimo sotto mage.
- D-15, D-16: tipi di città `aarakocraCapital`, `dragonbornCapital` (taglia `capital`), `dragonbornVillage` (villaggio); le tre città a DB hanno già il tipo nuovo e restano senza taglia finché il BE non li conosce.
- D-18: città di nascita: dragonborn → `dragonbornCapital`, aarakocra → `aarakocraCapital`; solo personaggi nuovi.

## Emendamenti del 2026-11-15 (vincono sul testo sopra)

- D-20: anche il tipo di quest `magic` diventa `arcane` (tipi di scuola: `arcane`, `shamanic`, `void`); i dati a DB con `magic` si migrano.
- D-22: heal e negozi di Murnborim e Thengran da città, non da capitale (contenuto a DB); la taglia resta `capital`.
- D-23: lore delle tre città cambiate riscritta (contenuto a DB).
- D-24: la prima magia imparata di un'origine sblocca la lore di quell'origine: `Spell.relatedLore`, sbloccata a ogni magia imparata.
