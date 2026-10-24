import { Types } from 'mongoose';
import {
    CombatContext,
    CombatResolver,
    ParticipantOutcome,
} from 'src/quests/outcomes/combat/combat-resolver';

export type ScriptedOutcome = Partial<Omit<ParticipantOutcome, 'characterId'>>;

// fake della porta (D-25): il test decide l'esito per personaggio; default = vittoria senza danni
export class ScriptedCombatResolver extends CombatResolver {
    readonly contexts: CombatContext[] = [];
    private readonly scripted = new Map<string, ScriptedOutcome>();

    willResolve(
        characterId: Types.ObjectId | string,
        outcome: ScriptedOutcome,
    ): this {
        this.scripted.set(String(characterId), outcome);
        return this;
    }

    reset(): void {
        this.contexts.length = 0;
        this.scripted.clear();
    }

    resolve(context: CombatContext): ParticipantOutcome[] {
        this.contexts.push(context);
        return context.participants.map((participant) => {
            const script = this.scripted.get(participant.characterId) ?? {};
            return {
                characterId: participant.characterId,
                outcome: script.outcome ?? 'success',
                hpAfter: script.hpAfter ?? participant.currentLifePoints,
                injuriesAdded: script.injuriesAdded ?? [],
                consumablesUsed: script.consumablesUsed ?? [],
                spellsUsed: script.spellsUsed ?? [],
            };
        });
    }
}
