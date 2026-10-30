import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    ChangeStreamEvent,
    ChangeStreamPublisher,
} from 'src/mongo/change-stream-publisher';
import { documentIdOf } from 'src/mongo/document-id';
import { KeyedSingleFlight } from 'src/mongo/keyed-single-flight';
import { describeError } from 'src/mongo/mongo-errors';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { CHARACTER_CHANGES_PIPELINE } from './character-changes.pipeline';
import { CharactersService } from './characters.service';

const CHARACTER_CHANGES = {
    pipeline: CHARACTER_CHANGES_PIPELINE,
    options: { fullDocument: 'updateLookup' as const },
    subject: 'dei personaggi',
};

// ogni update di un personaggio attivo emette il personaggio popolato; lo stream si riapre con la base comune (D-17a)
@Injectable()
export class CharacterUpdatesPublisher extends ChangeStreamPublisher<CharacterDocument> {
    // una lettura alla volta per personaggio: l'ultimo evento di una raffica riflette lo stato più recente (WR-01)
    private readonly publishes = new KeyedSingleFlight((characterId) =>
        this.publishOnce(characterId),
    );

    constructor(
        @InjectModel(Character.name) characterModel: Model<CharacterDocument>,
        private readonly characters: CharactersService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(characterModel, CHARACTER_CHANGES, pubSub);
    }

    requestPublish(characterId: string): void {
        this.publishes.request(characterId);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const characterId = documentIdOf(change.fullDocument);
        if (characterId) this.publishes.request(characterId);
    }

    private async publishOnce(characterId: string): Promise<void> {
        if (this.stopping) return;
        try {
            const characterUpdated = await this.characters.findOne(characterId);
            this.publish('characterUpdated', { characterUpdated });
        } catch (error) {
            // archiviato fra l'evento e la rilettura: nessun evento, non è un errore
            if (error instanceof ResourceNotFoundException) return;
            this.logger.error(
                `Pubblicazione di characterUpdated fallita: ${describeError(error)}`,
            );
        }
    }
}
