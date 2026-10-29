import { Types } from 'mongoose';
import {
    CombatContext,
    CombatResolution,
    CombatResolver,
    CombatVerdict,
    ParticipantEffects,
} from 'src/quests/outcomes/combat/combat-resolver';

export type ScriptedEffects = Partial<Omit<ParticipantEffects, 'characterId'>>;

// fake della porta (D-25): il test decide il verdetto del combattimento e gli effetti per personaggio; default = vittoria senza danni
export class ScriptedCombatResolver extends CombatResolver {
    readonly contexts: CombatContext[] = [];
    private verdict: CombatVerdict = 'success';
    private verdictRule: ((context: CombatContext) => CombatVerdict) | null =
        null;
    private readonly scripted = new Map<string, ScriptedEffects>();

    willEnd(verdict: CombatVerdict): this {
        this.verdict = verdict;
        return this;
    }

    // verdetto in funzione del contesto (es. il numero dei combattenti), prevale su willEnd
    willEndBy(rule: (context: CombatContext) => CombatVerdict): this {
        this.verdictRule = rule;
        return this;
    }

    willResolve(
        characterId: Types.ObjectId | string,
        effects: ScriptedEffects,
    ): this {
        this.scripted.set(String(characterId), effects);
        return this;
    }

    reset(): void {
        this.contexts.length = 0;
        this.verdict = 'success';
        this.verdictRule = null;
        this.scripted.clear();
    }

    resolve(context: CombatContext): CombatResolution {
        this.contexts.push(context);
        return {
            verdict: this.verdictRule?.(context) ?? this.verdict,
            participants: context.participants.map((participant) => {
                const script = this.scripted.get(participant.characterId) ?? {};
                return {
                    characterId: participant.characterId,
                    hpAfter: script.hpAfter ?? participant.currentLifePoints,
                    injuriesAdded: script.injuriesAdded ?? [],
                    consumablesUsed: script.consumablesUsed ?? [],
                    spellsUsed: script.spellsUsed ?? [],
                };
            }),
        };
    }
}
