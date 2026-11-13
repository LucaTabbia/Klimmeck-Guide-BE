import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf, objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import { KeyedSingleFlight } from 'src/mongo/keyed-single-flight';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { SubscriberRegistry } from 'src/subscriber-registry';
import { QuestsService } from './quests.service';

// la nascita di un'aid è un insert di un altro documento: il filtro lascia passare solo quello delle aid (quick 261113-aql)
const QUEST_UPDATES = {
    pipeline: [
        {
            $match: {
                $or: [
                    { operationType: { $in: ['update', 'replace'] } },
                    {
                        operationType: 'insert',
                        'fullDocument.infos.type': QuestType.aid,
                    },
                ],
            },
        },
    ],
    subject: 'delle quest',
};

interface AidSource {
    rescue?: { failedQuest?: unknown } | null;
}

function sourceIdOf(aid: unknown): string | undefined {
    return refIdOf(
        (aid as AidSource | null | undefined)?.rescue?.failedQuest,
    )?.toHexString();
}

function concludes(change: ChangeStreamEvent): boolean {
    return change.updateDescription?.updatedFields?.concludedAt != null;
}

// contatore del party in tempo reale (utente 2026-10-26: "il counter degli avventurieri mancanti deve aggiornarsi nel momento in cui qualcuno accetta la missione"):
// un evento per update al commit, con la quest popolata come sulla board; nessun publish manuale nei servizi
@Injectable()
export class QuestsPublisher extends ChangeStreamPublisher<QuestDocument> {
    // una lettura alla volta per quest (raffiche ravvicinate: l'ultimo evento è lo stato più recente)
    private readonly reads = new KeyedSingleFlight((questId) =>
        this.publishUpdated(questId),
    );

    constructor(
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        private readonly quests: QuestsService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
        private readonly subscribers: SubscriberRegistry,
    ) {
        super(questModel, QUEST_UPDATES, pubSub);
    }

    // la quest d'origine di un'aid non cambia quando l'aid nasce o si chiude: la si ripubblica qui, dopo il commit (quick 261113-aql)
    protected onChange(change: ChangeStreamEvent): void {
        if (change.operationType === 'insert') {
            this.republish(sourceIdOf(change.fullDocument));
            return;
        }
        const questId = documentIdOf(change.documentKey);
        if (!questId) return;
        this.reads.request(questId);
        if (concludes(change)) void this.republishSourceOf(questId);
    }

    private republish(questId: string | undefined): void {
        if (questId) this.reads.request(questId);
    }

    // solo le conclusioni: una lettura dell'aid per prendere la sua quest d'origine; le altre quest concluse non ne hanno
    private async republishSourceOf(questId: string): Promise<void> {
        try {
            const aid = await this.questModel
                .findOne(
                    {
                        _id: objectIdFromHex(questId),
                        'infos.type': QuestType.aid,
                    },
                    { 'rescue.failedQuest': 1 },
                )
                .lean<AidSource | null>()
                .exec();
            this.republish(sourceIdOf(aid));
        } catch (error) {
            this.logger.error(
                `Quest d'origine del soccorso ${questId} non letta: ${describeError(error)}`,
            );
        }
    }

    // lo stream resta sempre aperto (aprirlo al primo subscriber perderebbe gli update fra snapshot e cursore, Pitfall 9):
    // si salta solo la rilettura popolata quando nessuno ascolta quella quest
    private async publishUpdated(questId: string): Promise<void> {
        if (this.stopping) return;
        if (!this.subscribers.hasSubscribers(`questUpdated:${questId}`)) return;
        try {
            const questUpdated = await this.quests.findOne(questId);
            this.publish('questUpdated', questId, { questUpdated });
        } catch (error) {
            if (error instanceof ResourceNotFoundException) {
                this.logger.debug(
                    `Quest ${questId} conclusa o sparita: nessun questUpdated`,
                );
                return;
            }
            this.logger.error(
                `Pubblicazione di questUpdated fallita per ${questId}: ${describeError(error)}`,
            );
        }
    }
}
