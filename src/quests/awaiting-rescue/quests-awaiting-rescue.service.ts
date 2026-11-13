import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { viewerCacheKeyOf } from 'src/lore/viewer-knowledge.service';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { questsAwaitingRescue } from 'src/quests/outcomes/aid/rescue-lock';

// quest d'origine delle aid aperte per Quest.awaitingRescue (quick 261113-aql): una lettura per richiesta HTTP e per evento WS;
// il valore è uguale per tutti, quindi la memo NON è per viewer: basta la chiave della richiesta o dell'evento
@Injectable()
export class QuestsAwaitingRescueService {
    private readonly cache = new WeakMap<
        object,
        Promise<ReadonlySet<string>>
    >();

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
    ) {}

    of(
        context: object,
        info?: { rootValue?: unknown },
    ): Promise<ReadonlySet<string>> {
        const key = viewerCacheKeyOf(context, info);
        const cached = this.cache.get(key);
        if (cached) return cached;
        const read = questsAwaitingRescue(this.questModel);
        this.cache.set(key, read);
        return read;
    }
}
