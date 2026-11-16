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

## Emendamenti del 2026-11-16 (utente, durante la UAT su device — vincono sul testo sopra)

- D-26: `Spell.requiredLearnTime` era servito ma mai usato. Le quest con sorteggio di magia (arcane, shamanic, void e ogni quest di studio con `spellDraw`) hanno due parti: la «Fase di ricerca» è la durata standard della quest e finisce col tiro; se il tiro dà una magia si aggiunge una parte di apprendimento lunga quanto il `requiredLearnTime` di quella magia, il personaggio resta impegnato e la magia (con la lore della sua origine, D-24/D-25) è conosciuta solo alla fine dell'apprendimento. Se il tiro non dà nulla la quest finisce come oggi.
- D-27: tempi di apprendimento riscritti a DB: 30 minuti al livello 6 fino a 12 ore al livello 20, a scalare col livello con un ritocco per potenza. Contenuto scritto dall'orchestratore, non codice del repo.
- D-28: il foglio della magia nel FE non mostra più il tempo di apprendimento (il campo resta servito: serve al FE per la fase di apprendimento).
- D-29: push alla fine della «Fase di ricerca»: riuscita (nome della magia e quanto dura l'apprendimento) oppure fallita. Lo stesso dato deve essere leggibile dal FE in sessione.
- D-30: il tempo di apprendimento vale solo per le quest con tiro. Le magie date come premio fisso (oste, premio per titolo, missioni guidate) restano immediate.
- D-31 (utente, 2026-11-16: «Io un foglio di esito per indicare la magia ottenuta lo metterei però»; ruling dell'orchestratore, vince sulla decisione di disegno 1 del piano 24-13): alla fine della «Fase di ricerca» con una magia trovata il `QuestResult` normale si scrive e si consegna SUBITO, con tutti i numeri di oggi, `spellLearned` nullo e il campo nuovo annullabile `spellFound: Spell` (la magia sorteggiata; la FE mostra «magia scoperta» e la durata da `spellFound.requiredLearnTime`); nessun foglio trattenuto sulla `PendingQuest`; il push `spellResearchSucceeded` porta l'id di quel foglio. La `PendingQuest` si riarma comunque per l'apprendimento. Alla fine dell'apprendimento si scrive un SECONDO `QuestResult`, piccolo, per la stessa quest e lo stesso personaggio: `spellLearned` = la magia, `loreUnlocked` = la lore della magia, ogni guadagno a zero o vuoto, `spellFound` nullo, `spellResearchFailed` falso; push `questEnd` col suo id. Il primo foglio non elenca la lore dell'origine, il secondo sì. Senza magia nulla cambia (`spellResearchFailed` vero, push `spellResearchFailed`). `QuestPrizes.spellDraw` resta pubblico.
- D-33 (utente, UAT 2026-11-16: «nelle quest magiche la possibilità di apprendere delle nozioni dovrebbe essere minore. Mettiamo 15%»): nelle tre quest di scuola (arcane, shamanic, void) il tiro della lore di studio riesce col 15% (`SPELL_SCHOOL_LORE_STUDY_CHANCE`); le quest `study` tengono la probabilità configurata (`LORE_STUDY_CHANCE`, default 0.5).
