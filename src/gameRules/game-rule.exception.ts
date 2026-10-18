import { BadRequestException } from '@nestjs/common';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';

export class GameRuleException extends BadRequestException {
    readonly code: GameRuleErrorCode;
    readonly extensions: { code: GameRuleErrorCode };

    private constructor(code: GameRuleErrorCode, message: string) {
        super({ statusCode: 400, error: 'Bad Request', message, code });
        this.code = code;
        // graphql-js copia originalError.extensions; formatDomainError ripristina il codice dopo la riscrittura di Nest
        this.extensions = { code };
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

    static spellRecoveryUnavailable(): GameRuleException {
        return new GameRuleException(
            GameRuleErrorCode.SPELL_RECOVERY_UNAVAILABLE,
            'Recupero della magia non disponibile, riprova',
        );
    }
}
