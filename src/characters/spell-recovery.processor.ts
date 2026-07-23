import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bull';
import { Model } from 'mongoose';
import { Character, CharacterDocument } from 'src/models/character/character.model';

export interface SpellRecoveryJobData {
    characterId: string;
    spellId: string;
}

@Processor('spell-recovery')
export class SpellRecoveryProcessor {
    private readonly logger = new Logger(SpellRecoveryProcessor.name);

    constructor(
        @InjectModel(Character.name) private characterModel: Model<CharacterDocument>,
    ) {}

    @Process('recover')
    async handleSpellRecovery(job: Job<SpellRecoveryJobData>) {
        const { characterId, spellId } = job.data;

        this.logger.log(`Processing spell recovery for character ${characterId}, spell ${spellId}`);

        const character = await this.characterModel.findById(characterId).exec();
        if (!character) {
            this.logger.warn(`Character ${characterId} not found, skipping recovery`);
            return;
        }

        const activeSpell = character.assets.activeSpells.find(
            a => a.spell?.toString() === spellId
        );

        if (!activeSpell) {
            this.logger.warn(`Spell ${spellId} not active for character ${characterId}, skipping recovery`);
            return;
        }

        activeSpell.usages += 1;
        await character.save();

        this.logger.log(`Spell ${spellId} recovered for character ${characterId}. New usages: ${activeSpell.usages}`);
    }
}

