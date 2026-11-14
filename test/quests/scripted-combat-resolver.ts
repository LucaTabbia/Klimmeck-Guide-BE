import { Types } from 'mongoose';
import {
    CombatContext,
    CombatParticipant,
    CombatResolution,
    CombatResolver,
    CombatVerdict,
    ParticipantEffects,
} from 'src/quests/outcomes/combat/combat-resolver';

export type ScriptedEffects = Partial<Omit<ParticipantEffects, 'characterId'>>;

// effetti fissi o in funzione del contesto (es. lo scontro k-esimo di una sequenza)
export type EffectsScript =
    | ScriptedEffects
    | ((context: CombatContext) => ScriptedEffects);

// il compagno esce dallo scontro solo se vi è entrato: assente = nessun compagno (D-03)
const companionEffectsOf = (
    participant: CombatParticipant,
    script: ScriptedEffects,
): Pick<ParticipantEffects, 'companionLifeAfter'> =>
    participant.companion && script.companionLifeAfter !== undefined
        ? { companionLifeAfter: script.companionLifeAfter }
        : {};

// fake della porta (D-25): il test decide il verdetto del combattimento e gli effetti per personaggio; default = vittoria senza danni
export class ScriptedCombatResolver extends CombatResolver {
    readonly contexts: CombatContext[] = [];
    private verdict: CombatVerdict = 'success';
    private verdictRule: ((context: CombatContext) => CombatVerdict) | null =
        null;
    private readonly scripted = new Map<string, EffectsScript>();

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
        effects: EffectsScript,
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

    private scriptOf(
        characterId: string,
        context: CombatContext,
    ): ScriptedEffects {
        const script = this.scripted.get(characterId) ?? {};
        return typeof script === 'function' ? script(context) : script;
    }

    resolve(context: CombatContext): CombatResolution {
        this.contexts.push(context);
        return {
            verdict: this.verdictRule?.(context) ?? this.verdict,
            participants: context.participants.map((participant) => {
                const script = this.scriptOf(participant.characterId, context);
                return {
                    characterId: participant.characterId,
                    hpAfter: script.hpAfter ?? participant.currentLifePoints,
                    injuriesAdded: script.injuriesAdded ?? [],
                    consumablesUsed: script.consumablesUsed ?? [],
                    spellsUsed: script.spellsUsed ?? [],
                    ...companionEffectsOf(participant, script),
                };
            }),
        };
    }
}
