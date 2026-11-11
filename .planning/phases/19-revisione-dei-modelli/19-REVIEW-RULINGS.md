# Phase 19 — ruling dell'orchestratore sui finding della review (2026-11-12)

Tre reviewer per area (`19-REVIEW-A.md` pet e catalogo, `19-REVIEW-B.md` personaggio e magie, `19-REVIEW-C.md` migratore e mondo): 1 critical, 10 warning, 21 info. Ogni fix è in TDD (RED `test(...)`, poi `fix(...)`/`refactor(...)`), con le regole di `19-REPO-RULES.md`.

## Blocco 1 — migratore e primo boot (fixer 1)

| Finding | Ruling |
|---------|--------|
| C-CR-01 + B-WR-01 (lavori di sottofondo su personaggi non migrati al primo boot) | **FIX.** I passi una tantum girano PRIMA di ogni hook di lifecycle: dentro una factory asincrona di un provider del modulo `ModelReviewMigrationModule` (Nest istanzia tutti i provider, attendendo le factory asincrone, prima di chiamare `onModuleInit` di qualunque modulo: così precedono i processor Bull, gli sweep di quest/viaggi/imboscate/recupero e il taglio di `SpellStateMigrator`). `ModelReviewBoot` non usa più `onApplicationBootstrap`. Il fixer PROVA la semantica con un caso sul boot reale (un provider-sonda il cui `onModuleInit` osserva i passi già conclusi) e, se la factory non potesse garantirlo, si ferma e riferisce. Il runbook tiene comunque il controllo «nulla in scadenza». |
| C-WR-05 (passo fallito = app che serve traffico) | **FIX.** Un passo fallito ferma il boot: la factory rilancia dopo aver loggato la riga `fallito` e una riga di riepilogo; il processo non parte (fail closed). Supera la regola «errore non bloccante» del piano 19-01: il caso della spec cambia di conseguenza. |
| C-WR-01 (il passo delle magie scarta voci e sovrascrive `active` scritti dal codice 19) | **FIX.** Una voce con `active` booleano è stata scritta dal codice nuovo: il suo flag vince e la voce resta anche se la magia non è in `status.spells`; il log delle voci lasciate fuori porta `_id` del personaggio e id delle magie. |
| C-WR-02 (letture seguite da `updateOne({_id})` senza guardia) | **FIX.** Passi delle magie, dei pet posseduti e delle magie dei nemici: la guardia e il valore letto entrano nel filtro della scrittura; una scrittura non applicata si conta e si ritenta al boot successivo. |
| C-WR-03 (rinomina che sovrascrive `assets.wornEquipment` già presente) | **FIX.** Guardia «destinazione assente»; i documenti con entrambi i campi si contano in `senza corrispondenza` e non si toccano. |
| C-WR-04 (copia incorporata non abbinata cancellata) | **FIX.** Se un nemico ha anche una sola copia non abbinata o ambigua, il passo NON scrive quel nemico: le copie restano, il log porta nome della magia e `_id` del nemico (D-02: mai perse in silenzio). |
| C-WR-06 (`cities { pointsOfInterest { id } }` in errore) | **FIX.** `findAll` popola con `cityRelations()` (o equivalente senza N+1) e guadagna un caso int sul filo. Difetto preesistente, corretto qui perché la fase tocca `cityRelations`. |
| C-IN (log «167 senza pool» di `ShopBoot` al primo boot, guardie che trattano `null` come presente, semantica di `alreadyDone`, normalizzazioni non contate) | Chiusi per ruling: annotati nel runbook; i dati reali non hanno `null` (inventario). |

## Blocco 2 — pet, catalogo, personaggio (fixer 2)

| Finding | Ruling |
|---------|--------|
| A-WR-01 (un valore di debolezza fuori enum annulla nemici, quest e risultati sul filo) | **FIX.** Resolver sui campi di `Weaknesses` che filtra ai valori noti (stesso principio del filtro già messo sul motore), con un caso int: valore fuori enum scritto col driver → lista senza quel valore, nessun errore. |
| A-WR-02 (pet `legendary` offerti dalle quest boss di rango hero) | **Nessun cambio di codice — ruling dell'utente (2026-11-12, «Sì dai boss hero»).** Il tetto segue il loot del rango: solo le quest boss di rango hero possono offrire un pet leggendario. L'orchestratore corregge la frase di D-28 in CONTEXT/REPO-RULES/handoff. |
| A-WR-03 (voce di `ownedPets` con `xp`/vita non validi annulla il personaggio sul filo) | **FIX.** Mapper totale: un solo helper condiviso normalizza la voce (xp e vita interi ≥ 0, altrimenti 0; `pet` non leggibile → voce tolta dal filo) usato dal filo e dagli scrittori che riscrivono l'array. |
| A-IN-01 (ciclo d'import `generated-prizes.ts` ↔ `pet-prize.ts`) | **FIX.** Tabelle del loot in un modulo foglia, `import type` dove basta. |
| A-IN-04 (xp frazionario letto come 0 e riscritto più basso) | **FIX.** Si arrotonda per difetto, mai sotto il valore intero già posseduto. |
| A-IN-02, A-IN-05 | **FIX se banali** (lettura dei tetti dopo l'early return; una sola guardia `isObjectId`); altrimenti chiusi con motivo. |
| A-IN-07 (veto del negozio sui leggendari senza test sui pet) | **FIX:** un caso di test. |
| B-IN-04 (`state.active` senza `?.` in `gm-overrides.ts`) | **FIX.** |
| B-IN-06 (residui: `spellBook()` wrapper banale, `StoredSpellState` senza `active`, due commenti «slot») | **FIX.** |
| A-IN-03 (zona con `includes` semplice), A-IN-06, A-IN-08, B-IN-01, B-IN-02, B-IN-03 (coperto dal blocco 1), B-IN-05 | Chiusi per ruling: A-IN-03 è D-28 alla lettera (riga nel runbook); gli altri richiedono dati incoerenti scritti a mano a DB o sono forme già esistenti prima della fase. |
