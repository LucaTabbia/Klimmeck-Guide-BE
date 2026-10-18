import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bull';
import { Model } from 'mongoose';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import {
    INCREMENT_ACTIVE_SPELL_USAGE,
    recoverSpellFilter,
} from './spells/active-spell.updates';

export interface SpellRecoveryJobData {
    characterId: string;
    spellId: string;
}

@Processor('spell-recovery')
export class SpellRecoveryProcessor {
    private readonly logger = new Logger(SpellRecoveryProcessor.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
    ) {}

    @Process('recover')
    async handleSpellRecovery(job: Job<SpellRecoveryJobData>): Promise<void> {
        const { characterId, spellId } = job.data;
        const characterOid = objectIdFromHex(characterId);
        const spellOid = objectIdFromHex(spellId);
        if (!characterOid || !spellOid) {
            this.logger.warn(
                `Malformed recovery job for character ${characterId} and spell ${spellId}, skipping`,
            );
            return;
        }

        const spell = await this.spellModel
            .findById(spellOid, { maxUsages: 1 })
            .lean<{ maxUsages: number } | null>()
            .exec();
        if (!spell) {
            this.logger.warn(
                `Spell ${spellId} missing from the catalog, skipping recovery for character ${characterId}`,
            );
            return;
        }

        // $inc condizionato al massimo del catalogo: Bull è at-least-once, un job rieseguito non supera mai maxUsages (04 D-14)
        const recovered = await this.characterModel
            .updateOne(
                recoverSpellFilter(characterOid, spellOid, spell.maxUsages),
                INCREMENT_ACTIVE_SPELL_USAGE,
            )
            .exec();
        if (recovered.matchedCount === 0) {
            // archiviato (03.1 D-06), spell non più attiva o già al massimo
            this.logger.warn(
                `Character ${characterId} archived or missing, or spell ${spellId} inactive or at max usages: skipping recovery`,
            );
            return;
        }
        this.logger.log(
            `Spell ${spellId} recovered for character ${characterId}`,
        );
    }
}
