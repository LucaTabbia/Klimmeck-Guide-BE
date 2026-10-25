// PROVVISORIO (D-02): regole di combattimento dell'utente in arrivo; ogni formula di combattimento vive solo in questo file, i malus delle ferite solo in injury-rules.ts
import { Injectable } from '@nestjs/common';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { injuryModifiersOf } from 'src/quests/outcomes/injuries/injury-rules';
import {
    CombatConsumable,
    CombatContext,
    CombatDamages,
    CombatParticipant,
    CombatResolution,
    CombatResolver,
    ParticipantEffects,
} from './combat-resolver';

export const PLACEHOLDER_RULES = {
    // probabilità fissa di una ferita per partecipante
    injuryChance: 0.2,
    // sotto il 30% degli HP massimi si beve una pozione heal
    potionThreshold: 0.3,
    // in vittoria si perde metà dei danni del nemico
    victoryHpLossFactor: 0.5,
    defeatHpLossFactor: 1,
} as const;

const EVEN_ODDS = 0.5;

const sumPower = (entries: readonly { power: number }[]): number =>
    entries.reduce((total, entry) => total + entry.power, 0);

const damagePower = (damages: CombatDamages): number =>
    sumPower(damages.base) + sumPower(damages.energy);

const hasUsages = (spell: { usages: number }): boolean => spell.usages >= 1;

// D-07: mai sotto 1 HP, anche se i massimi fossero malformati
const clampLifePoints = (value: number, maxLifePoints: number): number =>
    Math.max(1, Math.min(maxLifePoints, value));

const participantPower = (participant: CombatParticipant): number => {
    const gear = participant.equipment.reduce(
        (total, item) => total + damagePower(item.damages),
        0,
    );
    const spells = sumPower(
        participant.activeSpells
            .filter(hasUsages)
            .flatMap((spell) => (spell.damage ? [spell.damage] : [])),
    );
    return (
        (gear + spells) * injuryModifiersOf(participant.injuries).damageFactor
    );
};

const winChanceOf = (context: CombatContext): number => {
    const partyPower = context.participants.reduce(
        (total, participant) => total + participantPower(participant),
        0,
    );
    const total = partyPower + context.enemy.lifePoints;
    return total > 0 ? partyPower / total : EVEN_ODDS;
};

const newInjuryOf = (
    participant: CombatParticipant,
    chance: ChanceSource,
): InjuryType[] => {
    if (chance.next() >= PLACEHOLDER_RULES.injuryChance) return [];
    const candidates = Object.values(InjuryType).filter(
        (injury) => !participant.injuries.includes(injury),
    );
    if (candidates.length === 0) return [];
    const index = Math.min(
        candidates.length - 1,
        Math.floor(chance.next() * candidates.length),
    );
    return [candidates[index]];
};

const healPotionOf = (
    participant: CombatParticipant,
): CombatConsumable | undefined =>
    participant.consumables.find(
        (item) => item.effect === EffectType.heal && item.quantity >= 1,
    );

@Injectable()
export class PlaceholderCombatResolver extends CombatResolver {
    // A3: la vittoria si tira una volta sola per il gruppo, poi danni, ferite e pozioni per partecipante
    resolve(context: CombatContext, chance: ChanceSource): CombatResolution {
        const winChance = winChanceOf(context);
        const enemyDamage = damagePower(context.enemy.damages);
        const share = Math.max(1, context.participants.length);
        const victory = chance.next() < winChance;
        return {
            verdict: victory ? 'success' : 'failure',
            participants: [...context.participants]
                .sort((a, b) => a.characterId.localeCompare(b.characterId))
                .map((participant) =>
                    this.resolveParticipant(participant, {
                        chance,
                        victory,
                        enemyDamage: enemyDamage / share,
                    }),
                ),
        };
    }

    private resolveParticipant(
        participant: CombatParticipant,
        round: { chance: ChanceSource; victory: boolean; enemyDamage: number },
    ): ParticipantEffects {
        const { maxLifePoints } = participant;
        const lossFactor = round.victory
            ? PLACEHOLDER_RULES.victoryHpLossFactor
            : PLACEHOLDER_RULES.defeatHpLossFactor;
        const loss = Math.round(
            (round.enemyDamage * lossFactor) /
                injuryModifiersOf(participant.injuries).lifePointsFactor,
        );
        let hpAfter = clampLifePoints(
            participant.currentLifePoints - loss,
            maxLifePoints,
        );
        const injuriesAdded = newInjuryOf(participant, round.chance);
        const potion =
            hpAfter < PLACEHOLDER_RULES.potionThreshold * maxLifePoints
                ? healPotionOf(participant)
                : undefined;
        if (potion) {
            hpAfter = clampLifePoints(
                hpAfter + Math.max(0, potion.power),
                maxLifePoints,
            );
        }
        return {
            characterId: participant.characterId,
            hpAfter,
            injuriesAdded,
            consumablesUsed: potion
                ? [{ itemId: potion.itemId, quantity: 1 }]
                : [],
            spellsUsed: participant.activeSpells
                .filter(hasUsages)
                .map((spell) => ({ spellId: spell.spellId, usages: 1 })),
        };
    }
}
