import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PendingQuest } from 'src/models/pending-quest.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { refIdOf } from 'src/mongo/document-id';

// la magia in apprendimento (Phase 24 D-26, D-29): sul tipo, così copre ogni percorso che serve una PendingQuest; a DB è un id, mai popolato
@Resolver(() => PendingQuest)
export class PendingQuestLearningSpellResolver {
    constructor(
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
    ) {}

    @ResolveField('learningSpell', () => Spell, { nullable: true })
    async learningSpell(
        @Parent() pendingQuest: { learningSpell?: unknown },
    ): Promise<Spell | null> {
        const spellId = refIdOf(pendingQuest.learningSpell);
        if (!spellId) return null;
        return this.spellModel.findById(spellId).exec();
    }
}
