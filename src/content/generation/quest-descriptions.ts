// D-32: annunci in italiano nella voce di chi li ha affissi, varianti estratte dal generatore col seme
export type DescriptionKind =
    | 'heal'
    | 'job'
    | 'guard'
    | 'crime'
    | 'study'
    | 'spellStudy'
    | 'hunt'
    | 'dungeon';

export interface DescriptionNames {
    city: string;
    enemy: string;
}

type Notice = (names: DescriptionNames) => string;

export const QUEST_DESCRIPTIONS: Readonly<
    Record<DescriptionKind, readonly Notice[]>
> = {
    heal: [
        () =>
            'A tutti gli avventurieri feriti! Abbiamo allestito una piccola clinica nei pressi del tempio, attendiamo il vostro arrivo con la speranza di poter alleggerire il vostro dolore.',
        ({ city }) =>
            `I sacerdoti del tempio di ${city} offrono riposo e bende pulite a chi torna dalla strada. Nessuno sarà mandato via: portate le vostre ferite, ce ne prenderemo cura noi.`,
        ({ city }) =>
            `Il tempio di ${city} apre le sue porte ai viandanti stanchi e ai combattenti feriti. Una notte fra le nostre mura e ripartirete come nuovi.`,
    ],
    job: [
        ({ city }) =>
            `Cerco braccia robuste per la mia bottega di ${city}: casse da scaricare, scaffali da riordinare e qualche consegna in città. Paga onesta, niente domande.`,
        ({ city }) =>
            `Il mercato di ${city} non aspetta nessuno e io sono rimasto senza garzone. Chi ha voglia di lavorare un paio d'ore si presenti al mio bancone.`,
        ({ city }) =>
            `Bottega di ${city} cerca aiuto! Lavoro semplice e senza pericoli, pagato a fine giornata.`,
    ],
    guard: [
        ({ city }) =>
            `Per ordine del capitano della guardia di ${city}: cerchiamo spade fidate per il turno sulle mura. Chi si presenta sobrio e puntuale sarà ricompensato.`,
        ({ city }) =>
            `La guardia di ${city} è a corto di uomini. Servono avventurieri disposti a sorvegliare le porte fino all'alba.`,
        ({ city }) =>
            `Il capitano della guardia cerca volontari per le ronde fra i vicoli di ${city}. Paga della guarnigione e un pasto caldo al cambio del turno.`,
    ],
    crime: [
        ({ city }) =>
            `Un amico di un amico ha un lavoretto a ${city} che richiede mani leste e bocca cucita. Chiedete di me alla taverna, dopo il tramonto.`,
        ({ city }) =>
            `Cerco gente discreta per una faccenda delicata qui a ${city}. Se le guardie vi conoscono di vista, lasciate perdere.`,
        ({ city }) =>
            `Merce da spostare, una porta da aprire, un nome da dimenticare. Chi è interessato lasci un segno sul muro dietro il mercato di ${city}.`,
    ],
    study: [
        ({ city }) =>
            `La biblioteca di ${city} cerca menti curiose per riordinare antichi registri e cronache dimenticate. Chi sa leggere fra le righe potrebbe scoprire più di quanto immagina.`,
        ({ city }) =>
            `Cerco un assistente per le mie ricerche sulla storia di ${city}: pergamene da trascrivere, mappe da confrontare. Pazienza e occhi buoni sono tutto ciò che chiedo.`,
        ({ city }) =>
            `Gli archivi di ${city} traboccano di carte che nessuno legge da secoli. Offro una ricompensa a chi mi aiuterà a dar loro un ordine.`,
    ],
    spellStudy: [
        ({ city }) =>
            `I maestri di ${city} aprono le loro aule a chi vuole avvicinarsi alle arti arcane. Nessuno sa quale incantesimo vi sceglierà: lo scoprirete fra queste mura.`,
        ({ city }) =>
            `Un circolo di studiosi di ${city} cerca allievi dotati per le sue ricerche sulla magia. Portate pazienza e rispetto, il resto ve lo insegneranno i libri.`,
        ({ city }) =>
            `Le biblioteche arcane di ${city} custodiscono segreti per chi è pronto a impararli. Chiedete dello studioso di turno all'ingresso.`,
    ],
    hunt: [
        ({ city, enemy }) =>
            `Nei campi intorno a ${city} il bestiame sparisce e le tracce non mentono: il pericolo ha un nome, ${enemy}. Chi ci libera dalla bestia avrà la gratitudine di tutti noi.`,
        ({ city, enemy }) =>
            `Sono un cacciatore di ${city} e da solo non ce la faccio più. Cerco compagni per stanare una preda pericolosa: ${enemy}.`,
        ({ city, enemy }) =>
            `I contadini di ${city} non osano più uscire dopo il tramonto. Chi sa usare un'arma ci aiuti a cacciare quel flagello: ${enemy}.`,
    ],
    dungeon: [
        ({ city, enemy }) =>
            `La gilda degli esploratori segnala un luogo dimenticato non lontano da ${city}, sorvegliato da ${enemy}. Cerchiamo una compagnia preparata: chi torna avrà la sua parte del bottino.`,
        ({ city, enemy }) =>
            `Rovine, gallerie e tesori sepolti attendono chi ha il coraggio di scendere vicino a ${city}. Attenzione: gli ultimi esploratori parlano di ${enemy}.`,
        ({ city, enemy }) =>
            `Per conto della gilda degli esploratori: cerchiamo avventurieri esperti per una spedizione nei pressi di ${city}. Portate provviste, luce e armi adatte, perché laggiù dovrete affrontare ${enemy}.`,
    ],
};
