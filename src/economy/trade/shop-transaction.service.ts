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
import { City, CityDocument } from 'src/models/city.model';
import type { CommonResponse } from 'src/models/common/common-response.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
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
    status?: {
        coins?: CoinPurse;
        location?: unknown;
        activeTravel?: unknown;
        awaitingAid?: unknown;
    };
    assets?: InventorySnapshot;
}

interface TraderAtShop {
    characterId: Types.ObjectId;
    location: Types.ObjectId;
}

const TRADE_SUCCEEDED: CommonResponse = {
    response: 'Transazione avvenuta con successo',
    successful: true,
};

const TRADE_SNAPSHOT_PROJECTION = {
    'status.coins': 1,
    'status.location': 1,
    'status.activeTravel.endTime': 1,
    'status.awaitingAid': 1,
    'assets.ownedItems': 1,
    'assets.ownedEquipments': 1,
    'assets.wearedEquipment': 1,
};

// lo slot svuotato vale null, come lo salva equipItem
function inventoryChanges(inventory: InventoryOutcome) {
    const vacated = Object.fromEntries(
        inventory.vacatedSlots.map((slot) => [
            `assets.wearedEquipment.${slot}`,
            null,
        ]),
    );
    return {
        'assets.ownedItems': inventory.ownedItems,
        'assets.ownedEquipments': inventory.ownedEquipments,
        ...vacated,
    };
}

// ordine dei rifiuti: id e quantità (puro) → catalogo → cross-check del totale → personaggio → città (D-18) → possesso → fondi
@Injectable()
export class ShopTransactionService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(City.name)
        private readonly cityModel: Model<CityDocument>,
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
        // scambio vuoto a totale zero (A2): no-op valido senza transazione, ma il personaggio deve esistere (l'innkeeper salta l'ownership) e stare in città
        if (lines.length === 0) {
            await this.assertCharacterCanTrade(characterId);
            return TRADE_SUCCEEDED;
        }
        await this.connection.transaction((session) =>
            this.applyTrade(characterId, lines, netCopper, session),
        );
        return TRADE_SUCCEEDED;
    }

    // stesso esito della transazione per il FE (D-18), senza sessione: nessuna scrittura da proteggere
    private async assertCharacterCanTrade(
        characterId: Types.ObjectId,
    ): Promise<void> {
        const snapshot = await this.characterModel
            .findOne(
                activeCharacterById(characterId),
                TRADE_SNAPSHOT_PROJECTION,
            )
            .lean<TradeSnapshot | null>()
            .exec();
        if (!snapshot) throw ResourceNotFoundException.character();
        await this.shopLocationOrReject(snapshot, null);
    }

    // negozio solo sul marker di una città, fuori dal viaggio e dal soccorso (D-18); session null per lo scambio vuoto
    private async shopLocationOrReject(
        snapshot: TradeSnapshot,
        session: ClientSession | null,
    ): Promise<Types.ObjectId> {
        const location = refIdOf(snapshot.status?.location);
        if (
            !location ||
            snapshot.status?.activeTravel != null ||
            snapshot.status?.awaitingAid != null
        ) {
            throw GameRuleException.shopNotInCity();
        }
        const inCity = await this.cityModel
            .exists({ markerLocation: { $in: idForms(location) } })
            .session(session)
            .exec();
        if (!inCity) throw GameRuleException.shopNotInCity();
        return location;
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
        const location = await this.shopLocationOrReject(snapshot, session);
        const inventory = applyTradeToInventory(snapshot.assets ?? {}, lines);
        if (toCopper(snapshot.status?.coins) < -netCopper) {
            throw GameRuleException.insufficientFunds();
        }
        await this.writeInventory(
            { characterId, location },
            lines,
            inventory,
            session,
        );
        // l'unico scrittore dei coins (04 D-04): la sua guard $expr è l'autorità dei fondi
        if (netCopper !== 0) {
            await this.wallet.applyCharacterCoinsDelta(
                characterId,
                netCopper,
                session,
            );
        }
    }

    // città e quantità vendute riaffermate nel filtro (rete di sicurezza, 04 D-10): la contesa la risolve il WriteConflict della transazione
    private async writeInventory(
        { characterId, location }: TraderAtShop,
        lines: readonly TradeLine[],
        inventory: InventoryOutcome,
        session: ClientSession,
    ): Promise<void> {
        const written = await this.characterModel
            .updateOne(
                {
                    ...activeCharacterById(characterId),
                    'status.location': { $in: idForms(location) },
                    'status.activeTravel': null,
                    'status.awaitingAid': null,
                    ...soldQuantityGuards(lines),
                },
                { $set: inventoryChanges(inventory) },
                { session },
            )
            .exec();
        if (written.matchedCount === 0) {
            throw GameRuleException.insufficientItemQuantity();
        }
    }
}
