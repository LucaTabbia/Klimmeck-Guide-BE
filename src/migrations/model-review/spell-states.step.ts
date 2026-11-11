// UNA TANTUM (Phase 19 D-12): fonde le tre liste di magie del personaggio in una sola in ordine di apprendimento — esce dal repo dopo il boot reale
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection, Types } from 'mongoose';
import { Character } from 'src/models/character/character.model';
import { Spell } from 'src/models/spell.model';
import { refIdOf } from 'src/mongo/document-id';
import {
    MODEL_REVIEW_LOG_PREFIX,
    type ModelReviewStep,
    type ModelReviewStepReport,
} from './model-review.step';

const LABEL = 'lista delle magie';

interface LegacySpellState {
    spell?: unknown;
    usages?: unknown;
    recoveries?: unknown;
    active?: unknown;
}

interface LegacyActiveSpell {
    spell?: unknown;
    usages?: unknown;
}

export interface LegacySpellLists {
    // status.spells
    spells?: readonly unknown[] | null;
    spellStates?: readonly LegacySpellState[] | null;
    // assets.activeSpells
    activeSpells?: readonly LegacyActiveSpell[] | null;
}

export interface MergedSpellState {
    spell: Types.ObjectId;
    usages: number;
    recoveries: Date[];
    active: boolean;
}

export interface MergedSpellLists {
    spellStates: MergedSpellState[];
    // usi diversi fra voce e lista delle equipaggiate: vince la voce
    usageConflicts: number;
    // equipaggiate di magie non conosciute, per id: nessuna voce
    unknownActive: string[];
    // stati lasciati fuori, per id della magia: legacy di magie non conosciute, doppi, senza riferimento
    droppedStates: string[];
}

const NO_REFERENCE = '<senza riferimento>';

// guardia di idempotenza: uno dei due campi vecchi presente, mai il flag sulle voci; nessun filtro sugli archiviati
const WITH_OLD_LISTS = {
    $or: [
        { 'status.spells': { $exists: true } },
        { 'assets.activeSpells': { $exists: true } },
    ],
};

const DROP_OLD_LISTS = {
    'status.spells': '',
    'assets.activeSpells': '',
    'status.maxActiveSpells': '',
};

const hexOf = (ref: unknown): string | undefined => refIdOf(ref)?.toHexString();

const listOf = <T>(value: readonly T[] | null | undefined): readonly T[] =>
    Array.isArray(value) ? (value as readonly T[]) : [];

const usagesOf = (entry: { usages?: unknown } | undefined) =>
    typeof entry?.usages === 'number' ? entry.usages : undefined;

const recoveriesOf = (state: LegacySpellState | undefined): Date[] =>
    Array.isArray(state?.recoveries)
        ? state.recoveries.filter(
              (instant): instant is Date => instant instanceof Date,
          )
        : [];

const referenceLabelOf = (entry: { spell?: unknown } | undefined): string =>
    hexOf(entry?.spell) ?? NO_REFERENCE;

// il modello vecchio non aveva il flag: una voce che lo porta booleano l'ha scritta il codice nuovo
const isWrittenByNewCode = (
    state: LegacySpellState | undefined,
): state is LegacySpellState & { active: boolean } =>
    typeof state?.active === 'boolean';

export function mergeSpellLists(
    lists: LegacySpellLists,
    maxUsagesOf: ReadonlyMap<string, number>,
): MergedSpellLists {
    const states = listOf(lists.spellStates);
    const equipped = listOf(lists.activeSpells);
    // senza la lista delle equipaggiate (già tolta a mano) nessuna voce legacy è attiva
    const equippedIsKnown = Array.isArray(lists.activeSpells);
    // senza la lista delle conosciute (già tolta a mano) le conosciute sono le magie delle voci
    const learned = Array.isArray(lists.spells)
        ? lists.spells
        : states.map((state) => state?.spell);

    const equippedOf = new Map<string, LegacyActiveSpell>();
    for (const entry of equipped) {
        const hex = hexOf(entry?.spell);
        if (hex && !equippedOf.has(hex)) equippedOf.set(hex, entry);
    }

    const usedStates = new Set<LegacySpellState>();
    const merged = new Map<string, MergedSpellState>();
    let usageConflicts = 0;

    const merge = (
        spell: Types.ObjectId,
        state: LegacySpellState | undefined,
    ): void => {
        const hex = spell.toHexString();
        if (state) usedStates.add(state);

        const equippedEntry = equippedOf.get(hex);
        const stateUsages = usagesOf(state);
        const equippedUsages = usagesOf(equippedEntry);
        if (
            stateUsages !== undefined &&
            equippedUsages !== undefined &&
            stateUsages !== equippedUsages
        ) {
            usageConflicts += 1;
        }

        merged.set(hex, {
            spell,
            // la voce vince; voce mancante: usi dell'equipaggiata, poi massimo a catalogo, poi 0
            usages: stateUsages ?? equippedUsages ?? maxUsagesOf.get(hex) ?? 0,
            recoveries: recoveriesOf(state),
            // il flag scritto dal codice nuovo vince sulla lista vecchia delle equipaggiate
            active: isWrittenByNewCode(state)
                ? state.active
                : equippedIsKnown && equippedEntry !== undefined,
        });
    };

    learned.forEach((ref, index) => {
        const spell = refIdOf(ref);
        if (!spell) return;
        const hex = spell.toHexString();
        if (merged.has(hex)) return;

        // stesso indice se punta alla stessa magia, altrimenti la prima voce con lo stesso id
        const state =
            hexOf(states[index]?.spell) === hex
                ? states[index]
                : states.find((candidate) => hexOf(candidate?.spell) === hex);
        merge(spell, state);
    });

    // voci scritte dal codice nuovo per magie fuori dalla lista vecchia (studio concluso prima del passo): restano, in coda
    for (const state of states) {
        if (usedStates.has(state) || !isWrittenByNewCode(state)) continue;
        const spell = refIdOf(state.spell);
        if (spell && !merged.has(spell.toHexString())) merge(spell, state);
    }

    return {
        spellStates: [...merged.values()],
        usageConflicts,
        unknownActive: equipped
            .filter((entry) => {
                const hex = hexOf(entry?.spell);
                return !hex || !merged.has(hex);
            })
            .map(referenceLabelOf),
        droppedStates: states
            .filter((state) => !usedStates.has(state))
            .map(referenceLabelOf),
    };
}

const counted = (labels: readonly string[]): string =>
    `${labels.length} [${labels.join(', ')}]`;

interface CharacterWithOldLists {
    _id: Types.ObjectId;
    status?: Pick<LegacySpellLists, 'spells' | 'spellStates'>;
    assets?: Pick<LegacySpellLists, 'activeSpells'>;
}

@Injectable()
export class SpellStatesStep implements ModelReviewStep {
    readonly label = LABEL;

    private readonly logger = new Logger(SpellStatesStep.name);

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello gli operatori sui path fuori schema non partono
        const characters = this.connection.model(Character.name).collection;
        const maxUsagesOf = await this.readCatalogMaxUsages();
        const found = await characters.countDocuments({});
        const withOldLists = await characters
            .find<CharacterWithOldLists>(WITH_OLD_LISTS, {
                projection: {
                    'status.spells': 1,
                    'status.spellStates': 1,
                    'assets.activeSpells': 1,
                },
            })
            .toArray();

        let unmatched = 0;
        for (const character of withOldLists) {
            const merge = mergeSpellLists(
                {
                    spells: character.status?.spells,
                    spellStates: character.status?.spellStates,
                    activeSpells: character.assets?.activeSpells,
                },
                maxUsagesOf,
            );
            // una sola scrittura: la lista unica entra e i campi vecchi escono insieme, così la guardia non rivede il documento
            await characters.updateOne(
                { _id: character._id },
                {
                    $set: { 'status.spellStates': merge.spellStates },
                    $unset: DROP_OLD_LISTS,
                },
            );
            const anomalies =
                merge.usageConflicts +
                merge.unknownActive.length +
                merge.droppedStates.length;
            unmatched += anomalies;
            if (anomalies > 0) {
                this.logger.warn(
                    `${MODEL_REVIEW_LOG_PREFIX}${LABEL}: personaggio ${character._id.toHexString()}, usi in conflitto ${merge.usageConflicts}, equipaggiate non conosciute ${counted(merge.unknownActive)}, stati lasciati fuori ${counted(merge.droppedStates)}`,
                );
            }
        }
        const migrated = withOldLists.length;
        return { found, migrated, alreadyDone: found - migrated, unmatched };
    }

    private async readCatalogMaxUsages(): Promise<Map<string, number>> {
        const spells = await this.connection
            .model(Spell.name)
            .collection.find<{
                _id: Types.ObjectId;
                maxUsages?: unknown;
            }>({}, { projection: { maxUsages: 1 } })
            .toArray();
        const maxUsagesOf = new Map<string, number>();
        for (const spell of spells) {
            const { maxUsages } = spell;
            // solo interi ≥ 0: un massimo non valido vale come assente
            if (
                typeof maxUsages === 'number' &&
                Number.isInteger(maxUsages) &&
                maxUsages >= 0
            ) {
                maxUsagesOf.set(spell._id.toHexString(), maxUsages);
            }
        }
        return maxUsagesOf;
    }
}
