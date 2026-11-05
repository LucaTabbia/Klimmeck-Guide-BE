# BACKEND-NOTES — Phase 13.1 Correzioni generazione quest (handoff FE)

- **Fase BE:** 13.1-correzioni-generazione-quest (requisiti BE-QGEN-12..BE-QGEN-16; decisioni D-01..D-08 in `13.1-CONTEXT.md`).
- **Data:** 2026-11-05. Documento di fine fase (piano 13.1-08), scritto dopo il gate 13.1-07.
- **Branch:** `feat/13.1-correzioni-generazione-quest` → PR verso `develop`, in draft fino al primo boot reale dal branch (dopo il popolamento del DB) e alla rimozione dei one-off.
- **Origine:** UAT su device della FE Phase 14 (2026-11-05): animali nelle quest normali, generate `legend` irraggiungibili, tabellone con le quest di tutto il mondo.
- **Regole del generatore e runbook:** `.planning/phases/13-generazione-quest/BACKEND-NOTES.md` §7 (regole, annotate «13.1 D-0x»), §9 (cura a DB) e §11 (f) (primo boot reale dal branch 13.1 e rimozione dei one-off).
- **Regola dei letterali:** operatori Mongo e letterali GraphQL solo in code span; nessun URI, host, nome di database né id reale: solo placeholder (`<uri>`, `<db>`, `<id>`).

---

## 0. TL;DR per il FE

1. **SDL identico a `develop`:** nessun campo tolto né aggiunto (`git diff origin/develop -- src/schema.gql` vuoto, verificato al gate 13.1-07). Nessun piano FE gated.
2. **`quests` è per area** (D-05): la stessa query restituisce solo le quest dell'area del personaggio corrente, le `story` del suo titolo e le quest delle sue corsie (§1). La FE deve rileggerla quando il personaggio si sposta (§2).
3. **Due quick task FE:** «rilettura delle quest al cambio di posizione» (§2) e «legend sui posti hero» (§3 bis, specchio di Phase 8 D-32).
4. **UAT su device:** la Mappa mostra solo i segnalini dell'area (non più tutto il mondo); posti 1 o 2 sulle `enemy`; un legend accetta le hero.
5. Il quick task `heal` delle magie è già aperto (BE PR #20, FE PR #39): non fa parte di questa fase.

---

## 1. `quests` per area (D-05)

Firma invariata: `quests: [Quest!]!`, query autenticata senza ruoli. Il chiamante è risolto dal token; il personaggio è il suo personaggio corrente.

**Cosa arriva:**

- le quest aperte (`concludedAt` nullo) sui POI della città in cui sta il personaggio corrente, **marker della città compreso** (la città è quella il cui marker o uno dei cui `pointsOfInterest` è `status.location`, la stessa regola dell'accettazione);
- le `story` aperte con `minTitle` uguale al titolo del personaggio, da qualunque città;
- le quest delle tre corsie del personaggio (`quests.pendingQuest`, `quests.activeStoryQuest`, `quests.activeWorldMissionQuest`), anche se stanno altrove (invariante del foglio strappato sulla Mappa).

**Cosa non arriva:**

- le quest di altre città;
- nulla (lista vuota) per un utente senza personaggio corrente, oste (innkeeper) compreso, o con il personaggio archiviato o morto;
- in viaggio o su strada (`status.location` fuori da ogni città): solo le corsie e le `story` del titolo.

**Invariati:** `quest(id)` e la subscription `questUpdated`: una quest altrove resta leggibile per id. I filtri lato client della FE restano come difesa.

---

## 2. Quando rileggere `quests`

Nessun evento nuovo. Rifare la query `quests` quando `characterUpdated` cambia:

- `status.location` (arrivo in una città, partenza per un viaggio);
- `status.title` (cambiano le `story` visibili);
- una delle corsie: `quests.pendingQuest`, `quests.activeStoryQuest`, `quests.activeWorldMissionQuest`.

**Quick task FE:** al ricevere `characterUpdated` con uno di questi campi diverso dal valore in cache, rileggere `quests` in background (nessun loading bloccante in sessione attiva). Le generate nuove compaiono comunque alla prossima apertura del tabellone (Phase 13 D-18).

---

## 3. Posti sulle `enemy` (D-02, D-03)

- Una generata `enemy` può avere `requiredAdventurers = [{ title: R, count: 2 }]` come i boss (S = 1 in due casi su tre, S = 2 nel resto). Parte solo a party completo (Phase 9), come i boss: la FE mostra già i posti dei boss, stessa resa.
- Fasce di xp contigue a cinque ranghi (rookie 1–20, adventurer 21–69, paladin 70–224, mage 225–548, hero 549–803); il budget di una `enemy` è [S × lo, S × hi].
- **Nessuna generata `legend`:** `legend` è solo un titolo, i personaggi legend giocano le quest hero (`minTitle` ≤ titolo).

### 3 bis. Legend sui posti hero (D-08)

- Il BE ora ammette un personaggio `legend` su un posto `hero`, **dopo** gli eventuali posti `legend`; nessun altro titolo scala; il jolly resta il jolly (un legend su un posto hero si conta prima dei posti jolly).
- La FE specchia la regola dei posti a titolo esatto (Phase 8 D-32, caso canonico condiviso). **Quick task FE:** aggiornare il suo `hasSeatFor` con gli stessi conteggi ripiegati (i legend oltre i posti legend si contano sui posti hero) e portare i casi di `src/quests/acceptance/quest-capacity.spec.ts`: `lets a legend take a hero seat`, `fills the legend seats before the hero seats`, `counts a legend on a hero seat before the wildcards`, `scales no other title`.
- Senza il quick task la FE nasconderebbe il pulsante di accettazione a un legend su una quest hero che il BE accetta.

---

## 4. Reset al primo boot reale (D-06, D-07)

- Al primo boot dal branch le generate aperte non registrate né in corsia vengono **cancellate e ricreate**: cambiano id. La FE non deve tenere in cache id di generate fra due sessioni.
- Le hunt aperte possono cambiare preda, `minTitle`, titolo, descrizione e lore (la caccia segue la preda della zona).
- Le dungeon aperte e non avviate possono cambiare le tappe (`infos.enemies`, 2–4) e, se cambia il primo nemico, il titolo; la descrizione resta.
- Il boot lo lancia l'orchestratore (runbook in `.planning/phases/13-generazione-quest/BACKEND-NOTES.md` §11 (f)); dopo il boot i one-off escono dal repo.

---

## 5. Animali e taglie delle città

- **Animali (D-01):** un nemico con una `relatedLore` di tipo `animal` non entra mai in una generata né in una tappa di dungeon; resta solo nelle hunt. Dettagli in `.planning/phases/13-generazione-quest/BACKEND-NOTES.md` §7 e §9.
- **Taglie (D-04):** tetto di generate attive per città villaggio 1, città 2, capitale 4 (entro i POI liberi), peso di sorteggio per taglia; target globale invariato. Dettagli in `.planning/phases/13-generazione-quest/BACKEND-NOTES.md` §7 e §11 (f).
- **Zona `dungeon`:** dopo la cura a DB del 2026-11-05 49 nemici hanno la zona `dungeon`: i POI dungeon pescano anche da questi.
