import { BadRequestException } from '@nestjs/common';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { GameRuleException } from 'src/gameRules/game-rule.exception';

describe('GameRuleException', () => {
    const cases: Array<
        [string, () => GameRuleException, GameRuleErrorCode, string]
    > = [
        [
            'insufficientFunds',
            () => GameRuleException.insufficientFunds(),
            GameRuleErrorCode.INSUFFICIENT_FUNDS,
            'Monete insufficienti',
        ],
        [
            'insufficientPoints',
            () => GameRuleException.insufficientPoints(),
            GameRuleErrorCode.INSUFFICIENT_POINTS,
            'Punti canale insufficienti',
        ],
        [
            'transactionTotalMismatch',
            () => GameRuleException.transactionTotalMismatch(),
            GameRuleErrorCode.TRANSACTION_TOTAL_MISMATCH,
            'Il totale non corrisponde ai prezzi attuali del negozio',
        ],
        [
            'itemNotFound',
            () => GameRuleException.itemNotFound(),
            GameRuleErrorCode.ITEM_NOT_FOUND,
            'Oggetto non trovato nel catalogo',
        ],
        [
            'itemNotTradable',
            () => GameRuleException.itemNotTradable(),
            GameRuleErrorCode.ITEM_NOT_TRADABLE,
            'Oggetto non scambiabile',
        ],
        [
            'itemNotOwned',
            () => GameRuleException.itemNotOwned(),
            GameRuleErrorCode.ITEM_NOT_OWNED,
            'Oggetto non posseduto',
        ],
        [
            'insufficientItemQuantity',
            () => GameRuleException.insufficientItemQuantity(),
            GameRuleErrorCode.INSUFFICIENT_ITEM_QUANTITY,
            'Quantità posseduta insufficiente',
        ],
        [
            'invalidQuantity',
            () => GameRuleException.invalidQuantity(),
            GameRuleErrorCode.INVALID_QUANTITY,
            'Quantità non valida',
        ],
        [
            'questSlotBusy',
            () => GameRuleException.questSlotBusy(),
            GameRuleErrorCode.QUEST_SLOT_BUSY,
            'Hai già una missione in corso',
        ],
        [
            'questFull',
            () => GameRuleException.questFull(),
            GameRuleErrorCode.QUEST_FULL,
            'Non ci sono più posti per il tuo rango',
        ],
        [
            'questAlreadyTaken',
            () => GameRuleException.questAlreadyTaken(),
            GameRuleErrorCode.QUEST_ALREADY_TAKEN,
            'Hai già affrontato questa missione',
        ],
        [
            'questTitleMismatch',
            () => GameRuleException.questTitleMismatch(),
            GameRuleErrorCode.QUEST_TITLE_MISMATCH,
            'Il tuo titolo non permette questa missione',
        ],
        [
            'questNotInCity',
            () => GameRuleException.questNotInCity(),
            GameRuleErrorCode.QUEST_NOT_IN_CITY,
            'Devi trovarti nella città della missione',
        ],
        [
            'questNotAcceptable',
            () => GameRuleException.questNotAcceptable(),
            GameRuleErrorCode.QUEST_NOT_ACCEPTABLE,
            'Missione non disponibile',
        ],
        [
            'questInProgress',
            () => GameRuleException.questInProgress(),
            GameRuleErrorCode.QUEST_IN_PROGRESS,
            'Non puoi muoverti durante una missione in corso',
        ],
        [
            'travelInProgress',
            () => GameRuleException.travelInProgress(),
            GameRuleErrorCode.TRAVEL_IN_PROGRESS,
            'Sei già in viaggio',
        ],
        [
            'travelSameLocation',
            () => GameRuleException.travelSameLocation(),
            GameRuleErrorCode.TRAVEL_SAME_LOCATION,
            'Sei già in questo luogo',
        ],
        [
            'travelDestinationNotAllowed',
            () => GameRuleException.travelDestinationNotAllowed(),
            GameRuleErrorCode.TRAVEL_DESTINATION_NOT_ALLOWED,
            'Puoi viaggiare solo verso una città',
        ],
        [
            'travelNoPath',
            () => GameRuleException.travelNoPath(),
            GameRuleErrorCode.TRAVEL_NO_PATH,
            'Nessuna strada porta a questa meta',
        ],
        [
            'spellNotKnown',
            () => GameRuleException.spellNotKnown(),
            GameRuleErrorCode.SPELL_NOT_KNOWN,
            'Magia non conosciuta',
        ],
        [
            'spellAlreadyActive',
            () => GameRuleException.spellAlreadyActive(),
            GameRuleErrorCode.SPELL_ALREADY_ACTIVE,
            'Magia già attiva',
        ],
        [
            'maxActiveSpellsReached',
            () => GameRuleException.maxActiveSpellsReached(),
            GameRuleErrorCode.MAX_ACTIVE_SPELLS_REACHED,
            'Hai raggiunto il numero massimo di magie attive',
        ],
        [
            'spellNotActive',
            () => GameRuleException.spellNotActive(),
            GameRuleErrorCode.SPELL_NOT_ACTIVE,
            'Magia non attiva',
        ],
        [
            'spellNoUsagesLeft',
            () => GameRuleException.spellNoUsagesLeft(),
            GameRuleErrorCode.SPELL_NO_USAGES_LEFT,
            'Magia senza utilizzi rimasti',
        ],
        [
            'spellRecoveryUnavailable',
            () => GameRuleException.spellRecoveryUnavailable(),
            GameRuleErrorCode.SPELL_RECOVERY_UNAVAILABLE,
            'Recupero della magia non disponibile, riprova',
        ],
        [
            'awaitingAid',
            () => GameRuleException.awaitingAid(),
            GameRuleErrorCode.AWAITING_AID,
            'Il tuo personaggio è in attesa di soccorso',
        ],
        [
            'shopNotInCity',
            () => GameRuleException.shopNotInCity(),
            GameRuleErrorCode.SHOP_NOT_IN_CITY,
            'Il negozio è disponibile solo in città',
        ],
        [
            'outcomeNotParticipant',
            () => GameRuleException.outcomeNotParticipant(),
            GameRuleErrorCode.OUTCOME_NOT_PARTICIPANT,
            'Il personaggio non partecipa a questa missione',
        ],
        [
            'outcomeOverrideInvalid',
            () => GameRuleException.outcomeOverrideInvalid(),
            GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID,
            'Esito non valido per questo personaggio',
        ],
    ];

    it.each(cases)(
        '%s is a 400 with code %s and an italian message',
        (_name, factory, code, message) => {
            const exception = factory();

            expect(exception).toBeInstanceOf(BadRequestException);
            expect(exception.getStatus()).toBe(400);
            expect(exception.code).toBe(code);
            expect(exception.extensions).toEqual({ code });
            expect(exception.getResponse()).toEqual({
                statusCode: 400,
                error: 'Bad Request',
                message,
                code,
            });
        },
    );

    it('covers every GameRuleErrorCode exactly once', () => {
        const producedCodes = cases.map(([, factory]) => factory().code).sort();

        expect(producedCodes).toEqual(Object.values(GameRuleErrorCode).sort());
    });
});
