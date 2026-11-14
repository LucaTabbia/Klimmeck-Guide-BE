import { BadRequestException } from '@nestjs/common';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';

export interface GameRuleExtensions {
    code: GameRuleErrorCode;
    recoveryUntil?: string;
    imprisonedUntil?: string;
}

export class GameRuleException extends BadRequestException {
    readonly code: GameRuleErrorCode;
    readonly extensions: GameRuleExtensions;

    private constructor(
        code: GameRuleErrorCode,
        message: string,
        extra: Omit<GameRuleExtensions, 'code'> = {},
    ) {
        super({ statusCode: 400, error: 'Bad Request', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions; formatDomainError ripristina il codice dopo la riscrittura di Nest
        this.extensions = { code, ...extra };
    }

    static insufficientFunds(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.INSUFFICIENT_FUNDS,
            'Monete insufficienti',
        );
    }

    static insufficientPoints(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.INSUFFICIENT_POINTS,
            'Punti canale insufficienti',
        );
    }

    static transactionTotalMismatch(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRANSACTION_TOTAL_MISMATCH,
            'Il totale non corrisponde ai prezzi attuali del negozio',
        );
    }

    static itemNotFound(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.ITEM_NOT_FOUND,
            'Oggetto non trovato nel catalogo',
        );
    }

    static itemNotTradable(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.ITEM_NOT_TRADABLE,
            'Oggetto non scambiabile',
        );
    }

    static itemNotOwned(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.ITEM_NOT_OWNED,
            'Oggetto non posseduto',
        );
    }

    static insufficientItemQuantity(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.INSUFFICIENT_ITEM_QUANTITY,
            'Quantità posseduta insufficiente',
        );
    }

    static invalidQuantity(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.INVALID_QUANTITY,
            'Quantità non valida',
        );
    }

    static questSlotBusy(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_SLOT_BUSY,
            'Hai già una missione in corso',
        );
    }

    static questFull(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_FULL,
            'Non ci sono più posti per il tuo rango',
        );
    }

    static questAlreadyTaken(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_ALREADY_TAKEN,
            'Hai già affrontato questa missione',
        );
    }

    static questTitleMismatch(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_TITLE_MISMATCH,
            'Il tuo titolo non permette questa missione',
        );
    }

    static questNotInCity(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_NOT_IN_CITY,
            'Devi trovarti nella città della missione',
        );
    }

    static questNotAcceptable(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_NOT_ACCEPTABLE,
            'Missione non disponibile',
        );
    }

    static questInProgress(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_IN_PROGRESS,
            'Non puoi muoverti durante una missione in corso',
        );
    }

    static participantQuestInProgress(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_IN_PROGRESS,
            'Il personaggio è impegnato in una missione in corso',
        );
    }

    static travelInProgress(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRAVEL_IN_PROGRESS,
            'Sei già in viaggio',
        );
    }

    static travelSameLocation(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRAVEL_SAME_LOCATION,
            'Sei già in questo luogo',
        );
    }

    static travelDestinationNotAllowed(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRAVEL_DESTINATION_NOT_ALLOWED,
            'Puoi viaggiare solo verso una città',
        );
    }

    static travelNoPath(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRAVEL_NO_PATH,
            'Nessuna strada porta a questa meta',
        );
    }

    // un solo codice per partenza libera e viaggio automatico della quest (Phase 14 D-11): nessuna scrittura
    static travelStarving(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.TRAVEL_STARVING,
            'Non hai cibo a sufficienza per il viaggio',
        );
    }

    static spellNotKnown(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.SPELL_NOT_KNOWN,
            'Magia non conosciuta',
        );
    }

    static spellAlreadyActive(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.SPELL_ALREADY_ACTIVE,
            'Magia già attiva',
        );
    }

    static maxActiveSpellsReached(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.MAX_ACTIVE_SPELLS_REACHED,
            'Hai raggiunto il numero massimo di magie attive',
        );
    }

    static spellNotActive(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.SPELL_NOT_ACTIVE,
            'Magia non attiva',
        );
    }

    static spellNoUsagesLeft(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.SPELL_NO_USAGES_LEFT,
            'Magia senza utilizzi rimasti',
        );
    }

    // in attesa di soccorso (D-07): blocca viaggio e accettazione, non il teleport del GM
    static awaitingAid(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.AWAITING_AID,
            'Il tuo personaggio è in attesa di soccorso',
        );
    }

    // abbandono solo sul marker in attesa del gruppo: né in viaggio né dopo l'avvio (utente 2026-10-25)
    static questNotWaiting(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_NOT_WAITING,
            'La missione non è in attesa del gruppo',
        );
    }

    // negozio solo nel marker di una città, fuori dal viaggio e dal soccorso (D-18)
    static shopNotInCity(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.SHOP_NOT_IN_CITY,
            'Il negozio è disponibile solo in città',
        );
    }

    // override del GM su un personaggio fuori dalla richiesta (D-04)
    static outcomeNotParticipant(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.OUTCOME_NOT_PARTICIPANT,
            'Il personaggio non partecipa a questa missione',
        );
    }

    // override del GM fuori dai limiti dello snapshot (D-04, Open Q 14)
    static outcomeOverrideInvalid(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
            'Esito non valido per questo personaggio',
        );
    }

    // acquisto fuori dal pool della città del marker, leggendario o sellable false (D-05, D-19)
    static itemNotInShop(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.ITEM_NOT_IN_SHOP,
            'Questo oggetto non è in vendita in questa città',
        );
    }

    // lo stesso pet non si compra due volte (D-14)
    static petAlreadyOwned(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.PET_ALREADY_OWNED,
            'Possiedi già questo compagno',
        );
    }

    // si equipaggia solo un pet posseduto (D-15)
    static petNotOwned(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.PET_NOT_OWNED,
            'Compagno non posseduto',
        );
    }

    // solo le pozioni heal con una ricarica valida si bevono dal Diario (Phase 18 D-17, D-23)
    static itemNotUsable(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.ITEM_NOT_USABLE,
            'Questo oggetto non si può usare',
        );
    }

    // ricarica globale delle pozioni (D-15): la data di fine viaggia solo nelle extensions
    static potionRecovering(until: Date): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.POTION_RECOVERING,
            "Il tuo corpo non reggerebbe un'altra pozione: aspetta che la prima si sia posata",
            { recoveryUntil: until.toISOString() },
        );
    }

    // nessun consumo e nessuna ricarica se la pozione non cambierebbe nulla (D-23)
    static itemNoEffect(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.ITEM_NO_EFFECT,
            'Questa pozione non ti farebbe nulla adesso',
        );
    }

    // una heal che non cambierebbe nulla non si accetta (Phase 18 D-25): nessuna corsia, nessun punto, nessun viaggio
    static questNoEffect(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.QUEST_NO_EFFECT,
            'Queste cure non ti servirebbero adesso',
        );
    }

    // prigione dopo l'arresto in una crime (quick 261110-cgd): blocca quel che blocca l'attesa di soccorso; la data di fine viaggia solo nelle extensions
    static characterImprisoned(until: Date): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.CHARACTER_IMPRISONED,
            'Il tuo personaggio è in prigione',
            { imprisonedUntil: until.toISOString() },
        );
    }

    // D-23: esce solo dopo i cinque codici di D-23, dove l'azione oggi passerebbe
    static missionInProgress(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.MISSION_IN_PROGRESS,
            'Missione in corso: azione non disponibile fino al risultato',
        );
    }
}
