// PROVVISORIO (D-10): l'algoritmo di esplorazione dell'utente sostituisce questo segnaposto via DI; la prova di esplorazione fra le tappe è neutra e non costa nulla
import { Injectable } from '@nestjs/common';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    CombatParticipant,
    CombatResolver,
    ParticipantEffects,
} from '../combat/combat-resolver';
import {
    DungeonContext,
    DungeonResolution,
    DungeonResolver,
} from './dungeon-resolver';

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
});

@Injectable()
export class PlaceholderDungeonResolver extends DungeonResolver {
    constructor(private readonly combat: CombatResolver) {
        super();
    }

    // D-12: una tappa per voce di `enemies`, in sequenza dagli HP residui; la prima sconfitta ferma l'esplorazione
    explore(context: DungeonContext, chance: ChanceSource): DungeonResolution {
        const stagesTotal = context.enemies.length;
        // difensivo: il servizio non chiama la porta senza nemici validi (successo automatico, C6/D-01)
        if (stagesTotal === 0) {
            return {
                verdict: 'success',
                participants: [],
                stagesCleared: 0,
                stagesTotal,
            };
        }
        let participants = context.participants;
        const merged = new Map(
            participants.map((participant) => [
                participant.characterId,
                noEffects(participant),
            ]),
        );
        let stagesCleared = 0;
        for (const enemy of context.enemies) {
            const stage = this.combat.resolve(
                { quest: context.quest, enemies: [enemy], participants },
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
                    merged.set(characterId, mergeEffects(current, effects));
            }
            participants = participants.map((participant) =>
                afterStage(
                    participant,
                    effectsById.get(participant.characterId),
                ),
            );
            if (stage.verdict === 'failure') {
                return this.resolutionOf(
                    'failure',
                    merged,
                    stagesCleared,
                    stagesTotal,
                );
            }
            stagesCleared += 1;
        }
        return this.resolutionOf('success', merged, stagesCleared, stagesTotal);
    }

    private resolutionOf(
        verdict: DungeonResolution['verdict'],
        merged: ReadonlyMap<string, ParticipantEffects>,
        stagesCleared: number,
        stagesTotal: number,
    ): DungeonResolution {
        return {
            verdict,
            participants: [...merged.values()].sort((a, b) =>
                a.characterId.localeCompare(b.characterId),
            ),
            stagesCleared,
            stagesTotal,
        };
    }
}
