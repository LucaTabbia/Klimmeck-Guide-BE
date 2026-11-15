// PROVVISORIO (D-10, D-29): l'algoritmo di esplorazione dell'utente sostituisce questo segnaposto via DI; il turno di esplorazione fra gli scontri è sempre superato e non costa nulla
import { Injectable } from '@nestjs/common';
import { COMPANION_LIFE_FLOOR } from 'src/characters/pets/companion-life';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    CombatCompanion,
    CombatEnemy,
    CombatParticipant,
    CombatResolver,
    lastCompanionLifeOf,
    ParticipantEffects,
} from '../combat/combat-resolver';
import {
    type CompanionFight,
    companionEnemiesXpOf,
} from '../pets/companion-enemies-xp';
import {
    DungeonContext,
    DungeonResolution,
    DungeonResolver,
    FailedTurn,
} from './dungeon-resolver';
import { dungeonTurnsOf } from './dungeon-turns';

type DungeonProgress = Pick<
    DungeonResolution,
    'stagesCleared' | 'stagesTotal' | 'turnsCompleted' | 'turnsTotal'
>;

// effetti fusi delle tappe giocate e tappe viste dal compagno (D-13)
interface ParticipantTrack {
    effects: ParticipantEffects;
    fights: CompanionFight[];
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

type ConsumableUse = ParticipantEffects['consumablesUsed'][number];
type SpellUse = ParticipantEffects['spellsUsed'][number];

const totalsOf = <T>(
    entries: readonly T[],
    idOf: (entry: T) => string,
    amountOf: (entry: T) => number,
): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const entry of entries) {
        totals.set(
            idOf(entry),
            (totals.get(idOf(entry)) ?? 0) + amountOf(entry),
        );
    }
    return totals;
};

const consumedOf = (uses: readonly ConsumableUse[]) =>
    totalsOf(
        uses,
        (use) => use.itemId,
        (use) => use.quantity,
    );

const castOf = (uses: readonly SpellUse[]) =>
    totalsOf(
        uses,
        (use) => use.spellId,
        (use) => use.usages,
    );

const noEffects = (participant: CombatParticipant): ParticipantEffects => ({
    characterId: participant.characterId,
    hpAfter: participant.currentLifePoints,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
});

// D-12, D-26: il compagno arrivato a 1 su una tappa è fuori dalle tappe seguenti
const companionAfterStage = (
    companion: CombatCompanion | null,
    companionLifeAfter: number | undefined,
): CombatCompanion | null => {
    if (!companion || companionLifeAfter === undefined) return companion;
    return companionLifeAfter <= COMPANION_LIFE_FLOOR
        ? null
        : { ...companion, currentLifePoints: companionLifeAfter };
};

// T-13-08: consumi e usi scalati fra le tappe, mai sotto 0
const afterStage = (
    participant: CombatParticipant,
    effects: ParticipantEffects | undefined,
): CombatParticipant => {
    if (!effects) return participant;
    const consumed = consumedOf(effects.consumablesUsed);
    const cast = castOf(effects.spellsUsed);
    return {
        ...participant,
        currentLifePoints: effects.hpAfter,
        injuries: unique([...participant.injuries, ...effects.injuriesAdded]),
        consumables: participant.consumables.map((item) => ({
            ...item,
            quantity: Math.max(
                0,
                item.quantity - (consumed.get(item.itemId) ?? 0),
            ),
        })),
        activeSpells: participant.activeSpells.map((spell) => ({
            ...spell,
            usages: Math.max(0, spell.usages - (cast.get(spell.spellId) ?? 0)),
        })),
        companion: companionAfterStage(
            participant.companion,
            effects.companionLifeAfter,
        ),
    };
};

const mergeEffects = (
    merged: ParticipantEffects,
    stage: ParticipantEffects,
): ParticipantEffects => ({
    characterId: merged.characterId,
    hpAfter: stage.hpAfter,
    injuriesAdded: unique([...merged.injuriesAdded, ...stage.injuriesAdded]),
    consumablesUsed: [
        ...consumedOf([...merged.consumablesUsed, ...stage.consumablesUsed]),
    ].map(([itemId, quantity]) => ({ itemId, quantity })),
    spellsUsed: [...castOf([...merged.spellsUsed, ...stage.spellsUsed])].map(
        ([spellId, usages]) => ({ spellId, usages }),
    ),
    ...lastCompanionLifeOf(merged, stage),
});

const stageFightOf = (
    enemy: CombatEnemy,
    { companionLifeAfter }: ParticipantEffects,
): CompanionFight => ({
    enemiesXp: enemy.xp * enemy.quantity,
    ...(companionLifeAfter === undefined ? {} : { companionLifeAfter }),
});

const trackedStage = (
    track: ParticipantTrack,
    enemy: CombatEnemy,
    stage: ParticipantEffects,
): ParticipantTrack => ({
    effects: mergeEffects(track.effects, stage),
    fights: [...track.fights, stageFightOf(enemy, stage)],
});

const trackedEffectsOf = ({
    effects,
    fights,
}: ParticipantTrack): ParticipantEffects => ({
    ...effects,
    ...companionEnemiesXpOf(fights),
});

@Injectable()
export class PlaceholderDungeonResolver extends DungeonResolver {
    constructor(private readonly combat: CombatResolver) {
        super();
    }

    // D-12, D-13: i turni di dungeonTurnsOf in sequenza dagli HP residui fino a lastTurnIndex; la prima sconfitta ferma l'esplorazione
    explore(context: DungeonContext, chance: ChanceSource): DungeonResolution {
        const turns = dungeonTurnsOf(context.enemies.length);
        const totals = {
            stagesTotal: context.enemies.length,
            turnsTotal: turns.length,
        };
        // difensivo: il servizio non chiama la porta senza nemici validi (successo automatico, C6/D-01)
        if (turns.length === 0) {
            return {
                verdict: 'success',
                participants: [],
                stagesCleared: 0,
                turnsCompleted: 0,
                failedTurn: null,
                ...totals,
            };
        }
        const lastTurnIndex = context.lastTurnIndex ?? turns.length - 1;
        let participants = context.participants;
        const merged = new Map<string, ParticipantTrack>(
            participants.map((participant) => [
                participant.characterId,
                { effects: noEffects(participant), fights: [] },
            ]),
        );
        const progress = { stagesCleared: 0, turnsCompleted: 0, ...totals };
        for (const turn of turns.filter(
            (entry) => entry.index <= lastTurnIndex,
        )) {
            // D-29: il segnaposto supera sempre l'esplorazione e non consuma tiri
            if (turn.kind === DungeonTurnKind.exploration) {
                progress.turnsCompleted += 1;
                continue;
            }
            const enemy = context.enemies[turn.enemyIndex];
            const stage = this.combat.resolve(
                {
                    quest: context.quest,
                    enemies: [enemy],
                    participants,
                },
                chance,
            );
            const effectsById = new Map(
                stage.participants.map((effects) => [
                    effects.characterId,
                    effects,
                ]),
            );
            for (const [characterId, effects] of effectsById) {
                const current = merged.get(characterId);
                if (current)
                    merged.set(
                        characterId,
                        trackedStage(current, enemy, effects),
                    );
            }
            participants = participants.map((participant) =>
                afterStage(
                    participant,
                    effectsById.get(participant.characterId),
                ),
            );
            if (stage.verdict === 'failure') {
                return this.resolutionOf('failure', merged, progress, {
                    index: turn.index,
                    kind: turn.kind,
                });
            }
            progress.stagesCleared += 1;
            progress.turnsCompleted += 1;
        }
        return this.resolutionOf('success', merged, progress, null);
    }

    private resolutionOf(
        verdict: DungeonResolution['verdict'],
        merged: ReadonlyMap<string, ParticipantTrack>,
        progress: DungeonProgress,
        failedTurn: FailedTurn | null,
    ): DungeonResolution {
        return {
            verdict,
            participants: [...merged.values()]
                .map(trackedEffectsOf)
                .sort((a, b) => a.characterId.localeCompare(b.characterId)),
            ...progress,
            failedTurn,
        };
    }
}
