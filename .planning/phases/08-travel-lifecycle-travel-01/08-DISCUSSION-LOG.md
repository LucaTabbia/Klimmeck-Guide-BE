# Phase 8: Travel Lifecycle (TRAVEL-01) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-21
**Phase:** 08-travel-lifecycle-travel-01
**Areas discussed:** Destinazioni e trigger, Durata/ETA/road (+ velocità del pet), Completamento e reconciler, Teleport/ownership/codici

---

## Destinazioni e trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Solo marker delle città | Meta valida = `City.markerLocation` (Phase 7 D-10) | ✓ (free text) |
| Città + marker quest attive | Anche il marker delle quest nelle corsie | |
| Qualunque POI | Ogni POI raggiungibile | |

**User's choice (free text):** "Il giocatore può spostarsi liberamente solo di città in città. Quando accetta una quest in una città parte in automatico il viaggio verso la markerLocation di quella quest (se diverso dal POI della città). Quando un personaggio si trova su un markerLocation che non è una città, può spostarsi liberamente verso qualsiasi città. Se il personaggio ha già un viaggio attivo, allora non può iniziarne un altro. Se un personaggio ha una pendingQuest attiva, allora non può spostarsi liberamente. Può farlo solo a quest conclusa."

| Option | Description | Selected |
|--------|-------------|----------|
| Solo il giocatore (startTravel) | acceptQuest non muove il personaggio | |
| Anche acceptQuest, per tutti i tipi | Viaggio automatico per ogni tipo | |
| Automatico solo per alcuni tipi | Alcuni tipi partono verso il marker | ✓ |

| Option (multi) | Description | Selected |
|--------|-------------|----------|
| Meta = posizione attuale | Rifiuto dedicato | ✓ |
| pendingQuest in corso | La corsia standard blocca il viaggio | ✓ |
| Story/worldMission in corso | Anche le altre corsie bloccano | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, mai | Nessun annullamento né cambio meta | ✓ |
| Sì, cancelTravel | Nuova mutation di annullamento | |
| Sì, cambio meta in corsa | startTravel sostituisce il viaggio | |

Follow-up:

| Option | Description | Selected |
|--------|-------------|----------|
| Tutta la corsia standard | Ogni tipo che finisce in pendingQuest | ✓ ("se porta verso un markerLocation diverso da quello della città stessa") |
| Solo tipi di combattimento | hunt, enemy, boss, dungeon | |
| Tutti i tipi, story e worldMission inclusi | Anche le corsie GM | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fallisce, niente scritto | Fail-closed TRAVEL_NO_PATH | |
| Riesce senza viaggio | Il personaggio resta in città | |
| Riesce con salto istantaneo | location = marker, nessun activeTravel | ✓ ("Non dovrebbe esistere una possibilità simile. Nel caso il viaggio avviene istantaneamente") |

| Option | Description | Selected |
|--------|-------------|----------|
| All'accettazione (come oggi) | Phase 7 D-16 invariato | |
| All'arrivo al marker | Il completamento del viaggio scrive startDate | ✓ |
| All'accettazione, ma allungato | waitingTime + durata viaggio | |

---

## Durata, ETA e road

| Option | Description | Selected |
|--------|-------------|----------|
| Minuti | Viaggi brevi, si guarda la pedina | |
| Ore | Viaggi lunghi, la push è il richiamo | ✓ |
| Secondi | Effetto visivo | |

| Option | Description | Selected |
|--------|-------------|----------|
| Env con default + clamp | Fattore e limiti via variabili d'ambiente | |
| Costante nel codice | Fattore fisso | |
| Solo speedFactor delle strade | Nessuna scala globale | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Polilinea unica del percorso | Tipo dedicato calcolato dal cammino | ✓ |
| Riusare il tipo Road | Road sintetica | |
| Lista delle Road attraversate | Il FE concatena | |

| Option | Description | Selected |
|--------|-------------|----------|
| Preview completa, getPath resta | duration + distance + polilinea, owner-guarded | ✓ |
| Preview minima, getPath resta | Solo duration e distance | |
| Estendere getPath | PathResponse esteso | |

**Note aggiunte dall'utente (chiusura area):** "Il pet equipaggiato dovrebbe avere un modificatore di velocità (parametro nullabile nel caso in cui non possa essere usato come cavalcatura). La velocità del personaggio base dovrebbe essere 10, se l'animale ha velocità 2 allora la velocità del personaggio è 20."

| Option | Description | Selected |
|--------|-------------|----------|
| Campo nullable sul Pet | Campo additivo sul catalogo Pet, velocità = 10 × modificatore | ✓ |
| Campo sul Pet + velocità base sul personaggio | Base 10 come campo del Character | |
| Tabella fissa nel codice | Mappa pet → modificatore | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tutti i viaggi | Liberi e automatici | ✓ |
| Solo viaggi liberi | Gli automatici a velocità base | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nessun effetto | Velocità fotografata alla partenza | ✓ |
| Ricalcolo dell'ETA | Ricalcolo a ogni cambio pet | |

---

## Completamento e reconciler

| Option | Description | Selected |
|--------|-------------|----------|
| Job Bull + boot + sweep periodico | Trigger + reconciler al boot + sweep | ✓ |
| Job Bull + solo boot | Come deciso in Phase 2 | |
| Nessun Bull: solo sweep DB | Poller periodico | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre al proprietario | Ogni completamento invia travelEnd | |
| Solo viaggi liberi | Mai per i viaggi automatici da quest | ✓ |
| Solo sopra una soglia | Push solo oltre una durata minima | |

| Option | Description | Selected |
|--------|-------------|----------|
| endTime pianificato | startDate = endTime del viaggio | ✓ |
| Ora del completamento effettivo | startDate = Clock.now() | |

---

## Teleport, ownership, codici

| Option | Description | Selected |
|--------|-------------|----------|
| Qualsiasi POI | Il GM è libero | ✓ |
| Solo marker città | Stesse regole del viaggio libero | |
| Città + marker quest | Città o marker di quest | |

| Option | Description | Selected |
|--------|-------------|----------|
| Arrivo solo se la meta è il marker | startDate se la meta è il marker | |
| Countdown parte comunque | startDate = ora | |
| Quest mai toccata | Nessuna scrittura sulla PendingQuest | |

**User's choice (free text):** "Il GM non può teletrasportare durante una quest attiva" → follow-up: solo `pendingQuest` blocca (✓), non tutte e tre le corsie.

| Option | Description | Selected |
|--------|-------------|----------|
| Solo il proprietario | Owner-only come acceptQuest | ✓ |
| Bypass innkeeper auditato | Come equip/shop | |

| Option | Description | Selected |
|--------|-------------|----------|
| Confermo la proposta | TRAVEL_IN_PROGRESS, TRAVEL_SAME_LOCATION, TRAVEL_DESTINATION_NOT_ALLOWED, TRAVEL_NO_PATH, QUEST_IN_PROGRESS | ✓ |
| Codice dedicato per il guard quest | es. CHARACTER_TRAVELLING | |
| Un solo codice generico | TRAVEL_NOT_ALLOWED | |

---

## Claude's Discretion

Nomi e collocazione (modulo, tipi, operazioni, campo del pet, coda, codici definitivi); esporre meta e tipo di viaggio su `activeTravel`; identità del job Bull e rimozione best-effort; intervallo dello sweep; ordine dei rifiuti e guard nel filtro; composizione di `RoadsService` con l'accettazione; split in wave con il contratto schema per primo.

## Deferred Ideas

Fine quest e ritorno in città (Phase 9); velocità base come attributo del personaggio; admin CRUD pet/strade/POI; ricalcolo ETA al cambio pet (escluso); annullamento/cambio meta (escluso by design); push per i viaggi automatici (esclusa); query viaggi per l'admin panel (già coperta da `characters`); indice su `activeTravel.endTime` (Phase 10).
