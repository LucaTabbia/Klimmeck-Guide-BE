# Phase 13 — Tabella di revisione dei gioielli (`accessoryUseTypes`)

**Scopo:** valori proposti per i 42 anelli e collane a DB (CONTEXT D-23..D-26). **Tabella APPROVATA dall'utente il 2026-11-04** (34 righe come proposte, 5 righe ambigue corrette, 3 ambigue confermate come proposte); il migratore una tantum scrive `accessoryUseTypes` solo dove il campo manca, usando gli `_id` di questa tabella, e lascia il repo prima della merge (Phase 12 D-25). Dopo, cura a DB.

**Regola applicata (D-25):** magia `attack` → attack; `defense` → defense; `control`/`illusion`/`charm`/`confuse` → attack; `enhance`/`infuse` → attack + defense; senza magia → defense (i `damages` di un gioiello sono protezione); la descrizione aggiunge `defense` se parla di protezione e `attack` se parla di un'azione offensiva; i tipi finali sono l'unione. Le righe marcate **DA RIVEDERE** non hanno un'azione esplicita nella descrizione: proposta = default, decisione dell'utente.

**Riepilogo approvato:** defense = 26, attack = 8, attack+defense = 8 (totale 42).

| # | `_id` | Tipo | Nome | Rarità | Magia (useType) | Proposta `accessoryUseTypes` | Motivazione | Approvato |
|---|---|---|---|---|---|---|---|---|
| 1 | `68c19536541d89c481b832d7` | necklace | Amuleto della Purezza | rare | Aura Radiosa (defense) | `[defense]` | magia defense; «neutralizza veleni e oscurità» | ☑ |
| 2 | `68c19536541d89c481b832cf` | necklace | Amuleto di legno | common | — | `[defense]` | «protezione simbolica e fisica minima» | ☑ |
| 3 | `68c19536541d89c481b832d1` | necklace | Amuleto di rame anti-elettricità | uncommon | — | `[defense]` | «Ottima protezione contro il fulmine» | ☑ |
| 4 | `68c19536541d89c481b832da` | necklace | Collana dell'Essenza | legendary | — | `[defense]` | «indebolisce le magie, soprattutto psichiche» (protezione dalla magia) | ☑ |
| 5 | `68c19536541d89c481b832d2` | necklace | Collana della megera | uncommon | — | `[defense]` | «per proteggerle dalle esalazioni» | ☑ |
| 6 | `68c19536541d89c481b832d4` | necklace | Collana delle Anime | rare | — | `[attack, defense]` | utente 2026-11-04: entrambi (anime intrappolate = aura offensiva e protezione) | ☑ |
| 7 | `68c19536541d89c481b832ce` | necklace | Collana di conchiglie | common | — | `[defense]` | «emana un leggero calore» (resistenza al freddo) | ☑ |
| 8 | `68c19536541d89c481b83254` | necklace | Collana di Mirwa | uncommon | — | `[defense]` | «preghiera molto potente che protegge dal veleno» | ☑ |
| 9 | `68c19536541d89c481b832d8` | necklace | Collare da esecuzione | ultrarare | — | `[defense]` | «in grado di resistere persino alla scure di un boia» | ☑ |
| 10 | `68c19536541d89c481b832d0` | necklace | Collare di ferro | common | — | `[defense]` | «Utile contro i colpi di lama al collo» | ☑ |
| 11 | `68c19536541d89c481b832d5` | necklace | Corno da guerra | ultrarare | Boom Sonico (attack) | `[attack]` | magia attack; «Può scatenare un potente boato»; nessuna protezione | ☑ |
| 12 | `6ae7fdeea808802d838972e5` | necklace | Cuore di golem | ultrarare | — | `[defense]` | «trasmette a chi lo porta la tenacia della pietra» | ☑ |
| 13 | `68c19536541d89c481b832d3` | necklace | Dente di bestia | uncommon | — | `[attack]` | utente 2026-11-04: attack (energia malevola emanata) | ☑ |
| 14 | `6ae7fdeea808802d838972cf` | necklace | Filo del destino | rare | — | `[defense]` | «non si spezzi finché il destino di chi lo porta non è compiuto» | ☑ |
| 15 | `68c19536541d89c481b832dc` | necklace | Manto del cacciatore ancestrale | legendary | — | `[attack, defense]` | utente 2026-11-04: entrambi (medaglione del cacciatore) | ☑ |
| 16 | `6ae7fdeea808802d838972e3` | necklace | Medaglione del Bardo delle leggende | legendary | Stordimento Sonoro (confuse) | `[attack]` | magia confuse → attack; «trova le parole giuste per ogni battaglia»; nessuna protezione | ☑ |
| 17 | `68c19536541d89c481b832d9` | necklace | Medaglione del Vulcano | ultrarare | Infusione di Fiamma (infuse) | `[attack, defense]` | magia infuse → entrambi; «potenza esplosiva» | ☑ |
| 18 | `68c19536541d89c481b832d6` | necklace | Medaglione di Mezaldir | rare | — | `[defense]` | «cerca la sapienza»: nessuna azione esplicita, protezione dei damages (psychic) | ☑ |
| 19 | `6ae7fdeea808802d838972e7` | necklace | Occhio di beholder | ultrarare | Controllo Psichico (control) | `[attack]` | magia control → attack; «piegare le menti… sentire i pensieri dei nemici»; nessuna protezione | ☑ |
| 20 | `68c19536541d89c481b832db` | necklace | Occhio di Kraken | legendary | Lancia di Fulmine (attack) | `[attack, defense]` | magia attack + «resistenza alle gelide acque oceaniche» (protezione) | ☑ |
| 21 | `6ae7fdeea808802d838972d5` | necklace | Spilla piumata di Iarus | rare | — | `[attack]` | utente 2026-11-04: attack (voce che scuote le sale) | ☑ |
| 22 | `68c19536541d89c481b832c8` | ring | Anello con scaglie | ultrarare | Respiro del Drago (enhance) | `[attack, defense]` | magia enhance → entrambi; «sfrutta le abilità e le resistenze» | ☑ |
| 23 | `68c19536541d89c481b832c2` | ring | Anello d'acciaio anti-gelo | uncommon | — | `[defense]` | «mantiene il calore corporeo» | ☑ |
| 24 | `68c19536541d89c481b83253` | ring | Anello d'argento anti-fuoco | rare | — | `[defense]` | «rune naniche per proteggere dal fuoco» | ☑ |
| 25 | `6ae7fdeea808802d838972ce` | ring | Anello dal volto mutevole | ultrarare | Bolla di caos (control) | `[attack]` | magia control → attack; nessuna protezione nella descrizione | ☑ |
| 26 | `6ae7fdeea808802d838972de` | ring | Anello dei quattro | ultrarare | — | `[defense]` | «attirino la buona sorte»: nessuna azione esplicita, protezione dei damages — DA RIVEDERE | ☑ |
| 27 | `68c19536541d89c481b832c5` | ring | Anello del Bardo | rare | Luce Disorientante (control) | `[attack, defense]` | magia control → attack + «nervi d'acciaio e non perdere la concentrazione» (protezione mentale) | ☑ |
| 28 | `68c19536541d89c481b832c6` | ring | Anello del Fulmine | rare | — | `[defense]` | «assorbire energia elettrica» | ☑ |
| 29 | `68c19536541d89c481b832cd` | ring | Anello del Litch | legendary | Abbraccio del Vuoto (attack) | `[attack, defense]` | utente 2026-11-04: entrambi (magia attack + il Filatterio protegge) | ☑ |
| 30 | `68c19536541d89c481b832cb` | ring | Anello del Portale | legendary | Soffio Necrotico (attack) | `[attack, defense]` | magia attack + «proteggendo dalla magia e dagli attacchi mentali» | ☑ |
| 31 | `68c19536541d89c481b832c1` | ring | Anello del viandante | common | — | `[defense]` | «può resistere contro danni da perforazione» | ☑ |
| 32 | `68c19536541d89c481b832cc` | ring | Anello dell'Alto Savio | legendary | — | `[defense]` | «Protegge da quasi tutti i tipi di magia» | ☑ |
| 33 | `6ae7fdeea808802d838972d3` | ring | Anello della passione | rare | Voce Ammaliante (charm) | `[attack]` | magia charm → attack; «voce a cui è difficile dire di no»; nessuna protezione | ☑ |
| 34 | `68c19536541d89c481b832ca` | ring | Anello della Pazienza | ultrarare | — | `[defense]` | «sopporta più facilmente il freddo e tempra la mente» | ☑ |
| 35 | `68c19536541d89c481b832c3` | ring | Anello della Rugiada notturna | uncommon | — | `[defense]` | «resistenza a piccole dosi di Rugiada notturna» | ☑ |
| 36 | `6ae7fdeea808802d838972d9` | ring | Anello delle gemme di Bitya | rare | — | `[defense]` | «augurio di agio e serenità»: nessuna azione esplicita, protezione dei damages — DA RIVEDERE | ☑ |
| 37 | `68c19536541d89c481b832bf` | ring | Anello di bronzo | common | — | `[defense]` | «lieve resistenza alle bruciature» | ☑ |
| 38 | `68c19536541d89c481b832c0` | ring | Anello di ferro | common | — | `[defense]` | «proteggere le dita dai tagli» | ☑ |
| 39 | `68c19536541d89c481b832c9` | ring | Dito della Madre | ultrarare | — | `[defense]` | «renderlo un piccolo scudo in caso di necessità» | ☑ |
| 40 | `6ae7fdeea808802d838972e2` | ring | Sigillo della Banca Faris | legendary | Maschera Illusoria (illusion) | `[attack]` | magia illusion → attack (mappa A); la descrizione non parla di protezione — DA RIVEDERE (la maschera illusoria difende?) | ☑ |
| 41 | `68c19536541d89c481b832c4` | ring | Sigillo della Forza | uncommon | — | `[defense]` | «lieve resistenza alla magia e alle onde d'urto» | ☑ |
| 42 | `68c19536541d89c481b832c7` | ring | Teschio di Corvo | rare | — | `[defense]` | «in grado di assorbire la magia necrotica» | ☑ |

## Descrizioni complete (per la revisione)

1. **Amuleto della Purezza** (necklace, rare): Un amuleto fatto di radici e vinacce benedetto da Enayr, che neutralizza veleni e oscurità. — _Magia Aura Radiosa (defense): Emette una luce accecante e sacra che respinge le creature oscure e fornisce resistenza ai danni necrotici._
2. **Amuleto di legno** (necklace, common): Un semplice amuleto di legno intagliato, che si pone sul cuore. Offre una protezione simbolica e fisica minima.
3. **Amuleto di rame anti-elettricità** (necklace, uncommon): Un amuleto di rame che dissipa le scariche elettriche. Ottima protezione contro il fulmine.
4. **Collana dell'Essenza** (necklace, legendary): Contiene una goccia di pura energia magica proveniente dalla fonte, la cui influenza indebolisce le magie, soprattutto psichiche.
5. **Collana della megera** (necklace, uncommon): Collana indossata dalle megere più deboli, per proteggerle dalle esalazioni e dai liquidi dei loro stessi intrugli.
6. **Collana delle Anime** (necklace, rare): Un medaglione che contiene delle anime intrappolate. Si dice che il precedente possessore fosse un mago oscuro in cerca della vita eterna.
7. **Collana di conchiglie** (necklace, common): Una collana di semplici conchiglie che emana un leggero calore.
8. **Collana di Mirwa** (necklace, uncommon): Una collana indossata dai sacerdoti di Mirwa. In essa è infusa una preghiera molto potente che protegge dal veleno.
9. **Collare da esecuzione** (necklace, ultrarare): Collare fatto con il Sundenim che copre tutto il collo, in grado di resistere persino alla scure di un boia.
10. **Collare di ferro** (necklace, common): Un collare spesso di ferro, usato dai soldati in battaglia. Utile contro i colpi di lama al collo.
11. **Corno da guerra** (necklace, ultrarare): Un corno da guerra infuso di magia e legato ad una catenella. Può scatenare un potente boato all'occorrenza. — _Magia Boom Sonico (attack): Genera un'esplosione di onde sonore che infligge danni massicci e può stordire i nemici._
12. **Cuore di golem** (necklace, ultrarare): Il nucleo runico che dava vita a un golem, montato su una catena di ferro. Pulsa ancora di un ordine antico e trasmette a chi lo porta la tenacia della pietra. I maghi pagherebbero qualunque prezzo per studiarlo.
13. **Dente di bestia** (necklace, uncommon): Un dente di una bestia non morta che emana ancora l'energia malevola con cui è stata riportata in vita.
14. **Filo del destino** (necklace, rare): Un sottile filo grigio intrecciato a collana, simbolo dei fili che Mobus tiene fra le dita. I fedeli del culto del destino lo indossano per ricordare che ogni cosa era già scritta. Si dice che non si spezzi finché il destino di chi lo porta non è compiuto.
15. **Manto del cacciatore ancestrale** (necklace, legendary): Un medaglione molto antico, tramandato di cacciatore in cacciatore. L'ultimo ad averlo indossato si dice sia morto abbattendo un Goristro da solo e pare che l'ultimo suono da lui emesso fosse un ululato.
16. **Medaglione del Bardo delle leggende** (necklace, legendary): Il medaglione di Venis Millhelm, il Bardo delle leggende che accompagnò Hilword Valantar in guerra e ne cantò le gesta. Il Collegio Millhelm lo custodisce come la sua reliquia più cara. Chi lo indossa trova le parole giuste per ogni battaglia. — _Magia Stordimento Sonoro (confuse): Emette un rumore così forte che il bersaglio perde l'equilibrio per un breve periodo e attacca in modo scoordinato._
17. **Medaglione del Vulcano** (necklace, ultrarare): Un medaglione che si dice sia emerso dal vulcano più grande del Belleholm e che ne conservi la potenza esplosiva. — _Magia Infusione di Fiamma (infuse): Ricopre la lama con fiamme, aggiungendo danni da Fuoco e causando ustioni gravi._
18. **Medaglione di Mezaldir** (necklace, rare): Una collana donata da Mezaldir ai suoi discepoli più meritevoli. Chiunque lo indossa cerca la sapienza.
19. **Occhio di beholder** (necklace, ultrarare): L'occhio centrale di un beholder, essiccato e chiuso in una gabbia d'argento da portare al collo. Anche morto continua a fissare e a piegare le menti di chi lo incrocia. Chi lo indossa giura di sentire i pensieri dei nemici. — _Magia Controllo Psichico (control): Prende il controllo dell'avversario per un breve periodo. Più il nemico è indebolito, più la magia ha effetto._
20. **Occhio di Kraken** (necklace, legendary): Occhio di un Kraken ucciso da un guerriero leggendario. Chi lo indossa ottiene gran parte delle caratteristiche del Kraken, compresa la resistenza alle gelide acque oceaniche. — _Magia Lancia di Fulmine (attack): Un fascio di elettricità ad alta velocità che può colpire più bersagli in linea retta._
21. **Spilla piumata di Iarus** (necklace, rare): Una spilla d'oro a forma di piuma d'oca, come quelle che spuntano dalle tasche di Iarus, il dio delle arti. Il culto della bellezza la dona agli artisti che migliorano la propria arte con diligenza. Chi la porta canta e recita con una voce che scuote le sale.
22. **Anello con scaglie** (ring, ultrarare): Un anello fatto di scaglie di vari mostri rari di cui sfrutta le abilità e le resistenze. — _Magia Respiro del Drago (enhance): Potenzia le vie respiratorie e le surriscalda, permettendo di sputare getti di fuoco per un breve periodo._
23. **Anello d'acciaio anti-gelo** (ring, uncommon): Un anello che mantiene il calore corporeo grazie ad una potente runa incisa al suo interno
24. **Anello d'argento anti-fuoco** (ring, rare): Un semplice anello, ma che riporta su di esso delle rune naniche per proteggere dal fuoco.
25. **Anello dal volto mutevole** (ring, ultrarare): Un anello la cui pietra cambia forma e colore a ogni sguardo, come il corpo mai uguale di Teheia, la dea della follia. I discepoli del caos lo portano per accogliere l'imprevedibile. Chi lo fissa troppo a lungo giura di averci visto un volto. — _Magia Bolla di caos (control): Il caos contenuto nell'incantatore si condensa in una sfera tremolante che scoppia in mezzo ai nemici. Tutto ciò che si trova nei paraggi viene schiacciato e tr_
26. **Anello dei quattro** (ring, ultrarare): Un anello diviso in quattro spicchi, uno per ciascuno degli dei della fortuna: Oaldir, Fasmos, Mezaldir e Itris. È la reliquia del culto più nuovo del continente, molto venerato nell'Unione delle Fiamme. Chi lo porta crede che le proprie azioni attirino la buona sorte.
27. **Anello del Bardo** (ring, rare): Il miglior compagno di un bardo. Aiuta ad avere nervi d'acciaio e non perdere la concentrazione. — _Magia Luce Disorientante (control): Un lampo di luce Radiosa che acceca temporaneamente i nemici in un'ampia area._
28. **Anello del Fulmine** (ring, rare): Anello forgiato con una runa capace di assorbire energia elettrica.
29. **Anello del Litch** (ring, legendary): Un anello che si dice essere esso stesso un Filatterio, rendendo l'utilizzatore molto più vicino al mondo dei morti che a quello dei vivi. — _Magia Abbraccio del Vuoto (attack): Corrode l'essenza vitale di un bersaglio, prosciugando permanentemente la sua forza e resistenza con l'energia data dal Vuoto._
30. **Anello del Portale** (ring, legendary): Un anello che distorce lo spazio intorno all'utilizzatore, proteggendo dalla magia e dagli attacchi mentali. — _Magia Soffio Necrotico (attack): Una nube di aria mefitica in grado di far decadere le cellule che entrano in contatto con essa._
31. **Anello del viandante** (ring, common): Un anello usato per sigillare lettere con una punta metallica. Se usato nel modo giusto, può resistere contro danni da perforazione.
32. **Anello dell'Alto Savio** (ring, legendary): Anello incantato dal primo Alto Savio di Klimmeck, per poterlo proteggere in caso di tradimento. Protegge da quasi tutti i tipi di magia.
33. **Anello della passione** (ring, rare): Un anello d'argento con una pietra rossa come l'abito di Ymone, la dea della passione. Le sacerdotesse lo donano a chi celebra l'amore in ogni sua forma. Chi lo porta ha una voce a cui è difficile dire di no. — _Magia Voce Ammaliante (charm): Sussurra parole potenti direttamente nella mente del bersaglio, convincendolo a eseguire un'azione semplice._
34. **Anello della Pazienza** (ring, ultrarare): Anello creato con un blocco di ghiaccio perenne. Indossarlo è una prova di resistenza e chi ci riesce sopporta più facilmente il freddo e tempra la mente.
35. **Anello della Rugiada notturna** (ring, uncommon): Trattato per dare resistenza a piccole dosi di Rugiada notturna. Solitamente indossato da chi la produce.
36. **Anello delle gemme di Bitya** (ring, rare): Un anello d'oro incastonato di gemme, come i borselli che Bitya, la dea della ricchezza, porta sempre con sé. I discepoli della provvidenza lo considerano un augurio di agio e serenità. Le sue pietre brillano più forte quando la borsa è piena.
37. **Anello di bronzo** (ring, common): Un semplice anello di bronzo. Ha una runa che dona una lieve resistenza alle bruciature.
38. **Anello di ferro** (ring, common): Un anello semplice e sorprendentemente pesante. Aiuta a proteggere le dita dai tagli.
39. **Dito della Madre** (ring, ultrarare): Un anello forgiato dai nani di Morrulir, con una strana tecnologia runica al suo interno in grado di renderlo un piccolo scudo in caso di necessità.
40. **Sigillo della Banca Faris** (ring, legendary): L'anello con il sigillo della Banca Faris, portato dai fiduciari di Rufus Faris, capo e tesoriere di Liberia. Apre porte che restano chiuse a chiunque altro. Si dice che apra anche le vie segrete della gilda di ladri sotto le rovine di Valantar. — _Magia Maschera Illusoria (illusion): Cambia il proprio aspetto. Utile per infiltrarsi o confondere l'avversario._
41. **Sigillo della Forza** (ring, uncommon): Un anello che incanala la Forza, offrendo una lieve resistenza alla magia e alle onde d'urto.
42. **Teschio di Corvo** (ring, rare): Un anello scuro a forma di teschio di corvo che si dice porti sfortuna. Chi lo usa però sa bene che è in grado di assorbire la magia necrotica.

---

*Stato: APPROVATA il 2026-11-04 — tutte le 42 righe ☑. Correzioni dell'utente sulle righe ambigue: Collana delle Anime → entrambi, Dente di bestia → attack, Manto del cacciatore ancestrale → entrambi, Spilla piumata di Iarus → attack, Anello del Litch → entrambi; confermate come proposte Anello dei quattro (defense), Anello delle gemme di Bitya (defense), Sigillo della Banca Faris (attack). Il migratore una tantum copia `_id` e valori da questa tabella.*
