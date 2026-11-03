# Phase 12: Negozi per città - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 12-negozi-per-citta
**Areas discussed:** Origine e cura dei pool, Composizione per taglia, Taglie e città speciali, Cura a mano vs regola, Pet (emersa dalle risposte)
**Mode:** interactive (AskUserQuestion, recommended option first; discuss congiunto con la FE Phase 13 dal repo FE). Scouting before the questions: shop code of both repos, `src/schema.gql` on `origin/develop`, Phase 11 handoff, read-only inventory of the dev DB (167 cities: 98 village / 48 city / 12 seaCity / 9 capital; 172 equip and 101 loot by rarity and `sellable`; 13 pets with prices).

Facts stated before the questions: Phase 11 D-36 (the world lives only in the DB, no content files nor CLI) makes «pool caricato dallo script» impossible; the FE already closes the shop off a city marker, during a travel and while awaiting aid; the BE knows neither size nor pools.

---

## Selezione delle aree

| Option | Description | Selected |
|--------|-------------|----------|
| Origine e cura dei pool | Dopo D-36: come nascono i 167 pool e chi li cura | ✓ |
| Composizione per taglia | Quanti oggetti e che mix di rarità; cibo e cure; pet | ✓ |
| Taglie e città speciali | Mare = città? Necrorian, Ferrion, Ko Shaeras, Talmvere | ✓ |
| Cura a mano vs regola | Oggetto fuori regola a DB: venduto o nascosto? | ✓ |

**User's choice:** tutte e quattro. Le scelte tecniche (query dedicata vs campi su `City`, deprecazione delle query globali, codice `ITEM_NOT_IN_SHOP`) lasciate a Claude come default elencati nel riepilogo.

---

## Origine e cura dei pool

| Option | Description | Selected |
|--------|-------------|----------|
| Semina server + cura a DB (Recommended) | Migrazione idempotente al boot riempie solo i pool assenti con la regola di taglia (seme per città), li salva sulla città; poi ritocchi a DB e il server non li tocca più | ✓ |
| Mutation dell'oste (Locanda) | Pool scritti solo da una mutation innkeeper; negozi vuoti fino alla compilazione; UI in una fase futura | |
| Solo regola, niente pool a DB | Pool calcolato da taglia + seme a ogni richiesta; nessuna cura a mano | |

**User's choice:** Semina server + cura a DB.

---

## Taglie e città speciali

| Option | Description | Selected |
|--------|-------------|----------|
| Mare = città, Necrorian senza negozio (Recommended) | SeaCity vende come città; Necrorian pool vuoto e pagina chiusa; Ferrion città; Ko Shaeras capitale; Talmvere villaggio | ✓ |
| Tutti vendono, taglia dal suffisso | Nessuna eccezione, anche Necrorian | |
| Mare = porti ricchi | Le 12 città di mare vendono come capitali | |

**User's choice:** Mare = città, Necrorian senza negozio. Taglia dedotta dal `CityType` ed esposta come `City.size` (premessa della domanda, accettata).

---

## Composizione per taglia

| Option | Description | Selected |
|--------|-------------|----------|
| Tabella proposta (Recommended) | Villaggio 6 + 8 (75/25), città 10 + 12 (50/35/15), capitale 14 + 16 (35/35/20/10) | |
| Pool più ampi | Villaggio 10 + 12, città 16 + 18, capitale 24 + 24, stesso mix | ✓ |
| Pool minimi | Villaggio 4 + 6, città 8 + 8, capitale 12 + 12 | |

**User's choice:** Pool più ampi.

| Option | Description | Selected |
|--------|-------------|----------|
| Cibo e cure sempre (Recommended) | Almeno 2 hunger e 1 heal in ogni pool, dentro la quota loot | ✓ |
| Solo cibo garantito | Almeno 2 hunger | |
| Nessuna garanzia | Puro sorteggio | |

**User's choice:** Cibo e cure sempre.

---

## Cura a mano vs regola

| Option | Description | Selected |
|--------|-------------|----------|
| La mano vince (Recommended) | La regola guida solo la semina; ciò che sta a DB si vende; veto assoluto su legendary e `sellable: false`; report di sola lettura (log al boot + query innkeeper) | ✓ |
| La regola vince | Il server nasconde e rifiuta ogni oggetto fuori regola anche se a DB | |
| Mano vince, nessun controllo | Come la prima senza report | |

**User's choice:** La mano vince.

---

## Pet (area emersa)

| Option | Description | Selected |
|--------|-------------|----------|
| No, fuori scope (Recommended) | Pool = equip + loot; stalle in backlog | |
| Sì, terzo tipo nel pool | I pet entrano nei pool e nel foglio di acquisto come terza lista; `doTransaction` esteso | ✓ (free text) |

**User's choice (verbatim):** «SI, terzo tipo nel pool. In questo caso però i pet sono posizionati in base alla lore (di cui hai il contesto) e venduti in pochi posti (un villaggio e la capitale o una città e la capitale) inoltre alcuni non possono rientrare nella lista, in quanto si possono ottenere solo tramite quest. In vendita ci sono: cavallo leggero, cavallo da viaggio, cammello del mar sabbioso, tartaruga gigante delle isole».

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, si può vendere (Recommended) | Un legendary posseduto si vende ovunque; `sellable: false` = mai sullo scaffale | ✓ |
| No, i leggendari non si vendono | Rifiuto `ITEM_NOT_TRADABLE` | |

**User's choice:** Sì, si può vendere.

| Option | Description | Selected |
|--------|-------------|----------|
| Tabella proposta (Recommended) | Cavallo leggero → Fineglen + Valantar; Cammello → Shadmus + Valantar; Tartaruga → Croce Marina + Bellport; Cavallo da viaggio → Talmvere + Cliffbreak | ✓ |
| Cavallo da viaggio a Flinas | Flinas + Cliffbreak | |
| Villaggi del deserto e delle isole diversi | Scelti dall'utente fra gli elenchi | |

**User's choice:** Tabella proposta.

| Option | Description | Selected |
|--------|-------------|----------|
| Rifiuta: prima vendi (Recommended) | `PET_ALREADY_OWNED` con un solo slot | |
| Permuta automatica | Vecchio pet venduto nella stessa transazione | |

**User's choice (verbatim):** «Bisogna distinguere il pet equipaggiato dai pet posseduti» → riproposto come modello posseduti + slot.

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, ovunque al sellPrice (Recommended) | Vendita del pet come gli altri oggetti | ✓ |
| No, i pet non si rivendono | Solo acquisto | |

**User's choice:** Sì, ovunque al sellPrice.

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, così (Recommended) | `ownedPets` + slot, niente doppioni, primo pet montato subito, vendita da entrambi, migrazione | |
| Sì, ma niente sella automatica | Comprare non equipaggia mai | ✓ |
| Sì, ma i doppioni sono ammessi | Quantità per pet | |

**User's choice:** Sì, ma niente sella automatica.

| Option | Description | Selected |
|--------|-------------|----------|
| Slot «Cavalcatura» nel Diario (Recommended) | BE: `mountPet`/`unmountPet`; FE: slot nel Diario | ✓ (con correzione del titolo) |
| Solo BE ora, UI più avanti | Mutation sole, UI rinviata | |
| Dal foglio di vendita del negozio | Tocco «monta» accanto al pet posseduto | |

**User's choice (verbatim):** «Come risposta 1, ma il pet non essendo necessariamente un animale da sella (può essere un gatto o un cane) deve avere un titolo diverso, cavalcatura non va bene».

| Option | Description | Selected |
|--------|-------------|----------|
| «Compagno» / «Compagni» (Recommended) | Slot «Compagno», lista «Compagni»; velocità mostrata solo se da sella | ✓ |
| «Animale» / «Animali» | | |
| «Bestia» / «Bestie» | | |

**User's choice:** «Compagno» / «Compagni». Mutation BE `equipPet` / `unequipPet` (premessa accettata).

---

## Claude's Discretion

- Contratto verso il client: `cityShop(cityId)` non owner-aware, `City.size` e `City.hasShop` su `cities`, deprecazione con `deprecationReason` delle query globali, `sellable` nello schema, codici `ITEM_NOT_IN_SHOP` / `PET_ALREADY_OWNED` / `PET_NOT_OWNED`, `petAssets` su `TransactionItems` (D-17..D-21, elencati per il veto).
- Nomi dei campi e dei moduli, algoritmo del sorteggio seminato, testi delle eccezioni, migrazione di `ownedPets` e `Pet.sellable`.

## Deferred Ideas

- Premi pet dalle quest (9 pet solo-quest) → Phase 13 o quest fisse.
- Cura dei pool dall'app (mutation innkeeper + UI Locanda).
- Crescita/combattimento dei pet; prezzi dei cavalli da rivedere a DB; rimozione delle query di catalogo deprecate.
