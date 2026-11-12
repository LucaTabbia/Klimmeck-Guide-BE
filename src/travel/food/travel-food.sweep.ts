import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { describeError } from 'src/mongo/mongo-errors';
import {
    FOOD_LEG_PROJECTION,
    foodLegOf,
    foodProgressSetOf,
    reachedKmOf,
    settlementGuardsOf,
    settlementIsDue,
    settlementOf,
    settlementSetOf,
} from './travel-food-settlement';
import {
    foodTravellerFilter,
    foodTravellersFilter,
} from './travel-food.updates';
import { TravelPantryReader } from './travel-pantry.reader';

interface FoodTraveller {
    _id: Types.ObjectId;
    status: {
        activeTravel: {
            startTime: Date;
            duration: number;
            road: { distance: number };
            ambush?: { km?: unknown } | null;
            food?: unknown;
        };
    };
}

interface CurveChange {
    before: number;
    after: number;
}

interface SettleOutcome {
    settled: boolean;
    curve: CurveChange | null;
}

const NOTHING_SETTLED: SettleOutcome = { settled: false, curve: null };

// passo «fame» dello sweep (Phase 20 D-01, D-03, D-15): nessuna scrittura nel tratto coperto, pasto al confine, fame a scatti di km oltre
@Injectable()
export class TravelFoodSweep {
    private readonly logger = new Logger(TravelFoodSweep.name);

    constructor(
        @InjectConnection() private readonly connection: Connection,
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        private readonly pantry: TravelPantryReader,
    ) {}

    async settleDue(now: Date): Promise<number> {
        const travellers = await this.characterModel
            .find(foodTravellersFilter(), FOOD_LEG_PROJECTION)
            .lean<FoodTraveller[]>()
            .exec();
        let settled = 0;
        // in serie: una transazione per personaggio sullo stesso pool (D-14)
        for (const traveller of travellers) {
            if (await this.settleSafely(traveller, now)) settled++;
        }
        if (settled > 0) {
            this.logger.log(`Sweep della fame: ${settled} viaggi assestati`);
        }
        return settled;
    }

    // un personaggio rotto non ferma gli altri: ogni lettura del documento sta nel try, nei log solo id e nome/codice dell'errore (D-15)
    private async settleSafely(
        traveller: FoodTraveller,
        now: Date,
    ): Promise<boolean> {
        const id = traveller._id.toHexString();
        try {
            const travel = traveller.status.activeTravel;
            const leg = foodLegOf(travel);
            if (!leg) {
                this.logger.warn(
                    `Viaggio del personaggio ${id}: piano del cibo non valido, ignorato`,
                );
                return false;
            }
            // niente transazione né characterUpdated quando non c'è nulla da scrivere (Pitfall 6)
            if (!settlementIsDue(leg, reachedKmOf(travel, now))) return false;
            const outcome = await this.settleOne(traveller, now);
            this.logCurveChange(id, outcome.curve);
            return outcome.settled;
        } catch (error) {
            this.logger.error(
                `Fame del viaggio del personaggio ${id} fallita: ${describeError(error)}`,
            );
            return false;
        }
    }

    // lettura in sessione e scrittura guardata da settledKm: una pozione bevuta in mezzo resta nel conto (D-09, D-14)
    private async settleOne(
        traveller: FoodTraveller,
        now: Date,
    ): Promise<SettleOutcome> {
        let outcome = NOTHING_SETTLED;
        await this.connection.transaction(async (session) => {
            // il callback viene rieseguito sui WriteConflict: l'esito riparte da zero
            outcome = NOTHING_SETTLED;
            outcome = await this.settleInSession(traveller, now, session);
        });
        return outcome;
    }

    private async settleInSession(
        traveller: FoodTraveller,
        now: Date,
        session: ClientSession,
    ): Promise<SettleOutcome> {
        const filter = foodTravellerFilter(
            traveller._id,
            traveller.status.activeTravel.startTime,
        );
        const current = await this.characterModel
            .findOne(filter, FOOD_LEG_PROJECTION)
            .session(session)
            .lean<FoodTraveller | null>()
            .exec();
        const travel = current?.status?.activeTravel;
        const leg = travel ? foodLegOf(travel) : null;
        if (!travel || !leg) return NOTHING_SETTLED;
        const pantry = await this.pantry.read(traveller._id, session);
        const settlement = settlementOf({
            leg,
            targetKm: reachedKmOf(travel, now),
            moment: 'progress',
            lifeNow: pantry.hpBefore,
            assets: pantry.assets,
            stacks: pantry.stacks,
            now,
        });
        if (!settlement) return NOTHING_SETTLED;
        const written = await this.characterModel
            .updateOne(
                {
                    ...filter,
                    ...settlementGuardsOf(leg.food, settlement, pantry.hpRaw),
                },
                {
                    $set: {
                        ...settlementSetOf(settlement),
                        ...foodProgressSetOf(settlement),
                    },
                },
                { session },
            )
            .exec();
        const settled = written.matchedCount === 1;
        const curve =
            settled && settlement.curve
                ? {
                      before: leg.food.uncoveredKm,
                      after: settlement.curve.uncoveredKm,
                  }
                : null;
        return { settled, curve };
    }

    // il fail-safe del confine (D-19): solo id e km scoperti
    private logCurveChange(id: string, curve: CurveChange | null): void {
        if (!curve) return;
        this.logger.warn(
            `Viaggio del personaggio ${id}: cibo cambiato al confine, km scoperti ${curve.before} → ${curve.after}`,
        );
    }
}
