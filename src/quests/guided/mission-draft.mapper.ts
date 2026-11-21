import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ENEMY_WIRE_POPULATE } from 'src/enemies/enemies.service';
import { withoutOrphanRelatedLore } from 'src/lore/related-lore';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { handInflictedOf } from 'src/quests/outcomes/injuries/innkeeper-injuries';
import {
    MissionBackgroundAdditionRecord,
    MissionCompanionRecord,
    MissionDraftParticipant,
    MissionDraftRecord,
    MissionFightEffectsRecord,
    MissionFightEnemyRecord,
    MissionFightOutcomeRecord,
    MissionFightRecord,
    MissionItemUsageRecord,
    MissionPrizeRecord,
    MissionSpellUsageRecord,
} from './mission-draft.model';
import { hexOf } from './ids';
import {
    MissionBackgroundAddition,
    MissionCompanion,
    MissionDraftView,
    MissionFight,
    MissionFightEffects,
    MissionFightEnemy,
    MissionFightOutcome,
    MissionItemUsage,
    MissionParticipant,
    MissionPrize,
    MissionSpellUsage,
} from './mission-draft.wire';

type Bestiary = ReadonlyMap<string, Enemy>;

function nullableHexOf(id: Types.ObjectId | null | undefined): string | null {
    return id ? hexOf(id) : null;
}

function itemUsageOf(usage: MissionItemUsageRecord): MissionItemUsage {
    return { item: hexOf(usage.item), quantity: usage.quantity };
}

function spellUsageOf(usage: MissionSpellUsageRecord): MissionSpellUsage {
    return { spell: hexOf(usage.spell), usages: usage.usages };
}

function effectsOf(
    effects: MissionFightEffectsRecord,
    innkeeperInjuries: readonly InjuryType[],
): MissionFightEffects {
    return {
        hpAfter: effects.hpAfter,
        injuriesAdded: [...effects.injuriesAdded],
        injuriesRemoved: [...(effects.injuriesRemoved ?? [])],
        innkeeperInjuries: [...innkeeperInjuries],
        consumablesUsed: effects.consumablesUsed.map(itemUsageOf),
        spellsUsed: effects.spellsUsed.map(spellUsageOf),
        companionLifeAfter: effects.companionLifeAfter ?? null,
    };
}

// il motore non toglie ferite e non ne infligge a nome dell'oste (Phase 25 D-12)
function simulatedEffectsOf(
    outcome: MissionFightOutcomeRecord,
): MissionFightEffects | null {
    if (!outcome.simulated) return null;
    return effectsOf({ ...outcome.simulated, injuriesRemoved: [] }, []);
}

// origine derivata con la regola del completamento, mai salvata nella bozza (Phase 25 D-12, D-16)
function correctedEffectsOf(
    outcome: MissionFightOutcomeRecord,
): MissionFightEffects | null {
    const { corrected } = outcome;
    if (!corrected) return null;
    return effectsOf(
        corrected,
        handInflictedOf(corrected, outcome.simulated?.injuriesAdded ?? []),
    );
}

function companionOf(
    companion: MissionCompanionRecord | null | undefined,
): MissionCompanion | null {
    if (!companion) return null;
    return {
        lifeBefore: companion.lifeBefore,
        maxLifePoints: companion.maxLifePoints,
        name: companion.name,
        pet: hexOf(companion.pet),
    };
}

function outcomeOf(outcome: MissionFightOutcomeRecord): MissionFightOutcome {
    return {
        character: hexOf(outcome.character),
        hpBefore: outcome.hpBefore,
        injuriesBefore: [...outcome.injuriesBefore],
        innkeeperInjuriesBefore: [...(outcome.innkeeperInjuriesBefore ?? [])],
        consumablesAvailable: outcome.consumablesAvailable.map(itemUsageOf),
        spellsAvailable: outcome.spellsAvailable.map(spellUsageOf),
        companion: companionOf(outcome.companion),
        simulated: simulatedEffectsOf(outcome),
        corrected: correctedEffectsOf(outcome),
    };
}

// Enemy! sul filo: una voce col nemico cancellato si scarta, mai un null (T-22-22)
function fightEnemiesOf(
    entries: readonly MissionFightEnemyRecord[],
    enemies: Bestiary,
): MissionFightEnemy[] {
    return entries.flatMap((entry) => {
        const enemy = enemies.get(hexOf(entry.enemy));
        return enemy ? [{ enemy, quantity: entry.quantity }] : [];
    });
}

function fightOf(fight: MissionFightRecord, enemies: Bestiary): MissionFight {
    return {
        enemies: fightEnemiesOf(fight.enemies, enemies),
        verdict: fight.verdict ?? null,
        outcomes: fight.outcomes.map(outcomeOf),
    };
}

function participantOf(
    participant: MissionDraftParticipant,
): MissionParticipant {
    return {
        character: hexOf(participant.character),
        pendingQuest: hexOf(participant.pendingQuest),
        name: participant.name,
        title: participant.title,
        maxLifePoints: participant.maxLifePoints,
    };
}

function prizeOf(prize: MissionPrizeRecord): MissionPrize {
    return {
        character: hexOf(prize.character),
        coins: {
            gold: prize.coins.gold,
            silver: prize.coins.silver,
            copper: prize.coins.copper,
        },
        xp: prize.xp,
        items: prize.items.map((entry) => ({
            item: hexOf(entry.item),
            quantity: entry.quantity,
        })),
        pet: nullableHexOf(prize.pet),
        spell: nullableHexOf(prize.spell),
        cure: prize.cure
            ? {
                  lifePointsShare: prize.cure.lifePointsShare,
                  canHeal: [...prize.cure.canHeal],
              }
            : null,
    };
}

function backgroundAdditionOf(
    addition: MissionBackgroundAdditionRecord,
): MissionBackgroundAddition {
    return { character: hexOf(addition.character), text: addition.text };
}

export function toMissionDraftWire(
    record: MissionDraftRecord,
    enemies: Bestiary,
): MissionDraftView {
    return {
        id: hexOf(record._id),
        quest: hexOf(record.quest),
        questType: record.questType,
        step: record.step,
        place: nullableHexOf(record.place),
        participants: record.participants.map(participantOf),
        fights: record.fights.map((fight) => fightOf(fight, enemies)),
        prizes: record.prizes.map(prizeOf),
        // una bozza aperta prima della sezione non ha il campo (Phase 25 D-05)
        backgroundAdditions: (record.backgroundAdditions ?? []).map(
            backgroundAdditionOf,
        ),
        startedAt: record.startedAt,
        updatedAt: record.updatedAt,
    };
}

function fightEnemyIdsOf(record: MissionDraftRecord): Types.ObjectId[] {
    return record.fights.flatMap((fight) =>
        fight.enemies.map((entry) => entry.enemy),
    );
}

@Injectable()
export class MissionDraftPresenter {
    constructor(
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
    ) {}

    async present(record: MissionDraftRecord): Promise<MissionDraftView> {
        return toMissionDraftWire(record, await this.bestiaryOf(record));
    }

    private async bestiaryOf(record: MissionDraftRecord): Promise<Bestiary> {
        const ids = fightEnemyIdsOf(record);
        if (ids.length === 0) return new Map();
        const enemies = await this.enemyModel
            .find({ _id: { $in: ids } })
            .populate(ENEMY_WIRE_POPULATE)
            .exec();
        return new Map(
            enemies.map((enemy) => [
                String(enemy._id),
                withoutOrphanRelatedLore(enemy) as Enemy,
            ]),
        );
    }
}
