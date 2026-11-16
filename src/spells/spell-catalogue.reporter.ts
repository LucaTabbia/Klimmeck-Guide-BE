// una magia senza origine o livello validi annulla il campo non nullo sul filo e non si insegna mai (Phase 24 D-01, D-07): si conta al boot, non si corregge
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SpellOrigin } from 'src/models/enums/spell-origin.enum';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { describeError } from 'src/mongo/mongo-errors';
import { isLearnLevel } from 'src/quests/outcomes/rewards/quest-rewards';

interface StoredSpellFields {
    origin?: unknown;
    minLevelToLearn?: unknown;
}

const SPELL_ORIGINS: readonly unknown[] = Object.values(SpellOrigin);

export function isServableSpell(spell: StoredSpellFields): boolean {
    return (
        SPELL_ORIGINS.includes(spell.origin) &&
        isLearnLevel(spell.minLevelToLearn)
    );
}

export function unservableSpellCount(
    spells: readonly StoredSpellFields[],
): number {
    return spells.filter((spell) => !isServableSpell(spell)).length;
}

@Injectable()
export class SpellCatalogueReporter implements OnApplicationBootstrap {
    private readonly logger = new Logger(SpellCatalogueReporter.name);

    constructor(
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            const spells: StoredSpellFields[] = await this.spellModel
                .find({}, { origin: 1, minLevelToLearn: 1 })
                .lean();
            const unservable = unservableSpellCount(spells);
            if (unservable === 0) return;
            this.logger.warn(
                `Magie: ${unservable} senza origine o livello minimo validi: non servibili sul filo e mai insegnate`,
            );
        } catch (error) {
            this.logger.error(
                `Il catalogo delle magie non si è potuto controllare al boot (${describeError(error)}).`,
            );
        }
    }
}
