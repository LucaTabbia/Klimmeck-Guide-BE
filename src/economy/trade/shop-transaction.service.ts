import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { requireCharacterObjectId } from 'src/characters/character-id';
import { toCopper, type CoinPurse } from 'src/economy/coins';
import { WalletService } from 'src/economy/wallet.service';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import type { CommonResponse } from 'src/models/common/common-response.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';
import { CatalogPricesReader } from './catalog-prices.reader';
import type { TradeLine } from './trade-line';
import {
    applyTradeToInventory,
    soldQuantityGuards,
    type InventoryOutcome,
    type InventorySnapshot,
} from './trade-inventory';
import {
    assertClientTotalMatches,
    planTradeLines,
    priceTrade,
} from './trade-pricing';

interface TradeSnapshot {
    status?: { coins?: CoinPurse };
    assets?: InventorySnapshot;
}

const TRADE_SNAPSHOT_PROJECTION = {
    'status.coins': 1,
    'assets.ownedItems': 1,
    'assets.ownedEquipments': 1,
};

// ordine dei rifiuti: id e quantità (puro) → catalogo → cross-check del totale → personaggio → possesso → fondi
@Injectable()
export class ShopTransactionService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly catalogPrices: CatalogPricesReader,
        private readonly wallet: WalletService,
    ) {}

    // fattibilità prima della scrittura, inventario + coins in un'unica transazione (04 D-07); il prezzo lo decide il catalogo (D-06)
    async execute(request: TransactionRequest): Promise<CommonResponse> {
        const characterId = requireCharacterObjectId(request.id);
        const lines = planTradeLines(request);
        const { netCopper } = priceTrade(
            lines,
            await this.catalogPrices.read(lines),
        );
        assertClientTotalMatches(request, netCopper);
        await this.connection.transaction((session) =>
            this.applyTrade(characterId, lines, netCopper, session),
        );
        return {
            response: 'Transazione avvenuta con successo',
            successful: true,
        };
    }

    // rieseguibile dal driver sui WriteConflict: niente side effect, niente letture parallele in sessione (04 Pitfall 6)
    private async applyTrade(
        characterId: Types.ObjectId,
        lines: readonly TradeLine[],
        netCopper: number,
        session: ClientSession,
    ): Promise<void> {
        const snapshot = await this.characterModel
            .findOne(
                activeCharacterById(characterId),
                TRADE_SNAPSHOT_PROJECTION,
            )
            .session(session)
            .lean<TradeSnapshot | null>()
            .exec();
        if (!snapshot) throw ResourceNotFoundException.character();
        const inventory = applyTradeToInventory(snapshot.assets ?? {}, lines);
        if (toCopper(snapshot.status?.coins) < -netCopper) {
            throw GameRuleException.insufficientFunds();
        }
        if (lines.length > 0) {
            await this.writeInventory(characterId, lines, inventory, session);
        }
        // l'unico scrittore dei coins (04 D-04): la sua guard $expr è l'autorità dei fondi
        if (netCopper !== 0) {
            await this.wallet.applyCharacterCoinsDelta(
                characterId,
                netCopper,
                session,
            );
        }
    }

    // le quantità vendute riaffermate nel filtro (rete di sicurezza): la contesa la risolve il WriteConflict della transazione
    private async writeInventory(
        characterId: Types.ObjectId,
        lines: readonly TradeLine[],
        inventory: InventoryOutcome,
        session: ClientSession,
    ): Promise<void> {
        const written = await this.characterModel
            .updateOne(
                {
                    ...activeCharacterById(characterId),
                    ...soldQuantityGuards(lines),
                },
                {
                    $set: {
                        'assets.ownedItems': inventory.ownedItems,
                        'assets.ownedEquipments': inventory.ownedEquipments,
                    },
                },
                { session },
            )
            .exec();
        if (written.matchedCount === 0) {
            throw GameRuleException.insufficientItemQuantity();
        }
    }
}
