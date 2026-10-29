import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { PubSub } from '@graphql-yoga/subscription';
import type { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import type {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import type { PubSubEvents } from 'src/pubsub.module';
import { CharacterUpdatesPublisher } from './character-updates.publisher';
import type { CharactersService } from './characters.service';

const SETTLE_TICKS = 10;
const CHARACTER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function characterState(id: string, name: string): Character {
    return { _id: id, name } as unknown as Character;
}

async function settle(): Promise<void> {
    for (let tick = 0; tick < SETTLE_TICKS; tick++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

class FakeChangeStream extends EventEmitter {
    close = jest.fn().mockResolvedValue(undefined);
}

describe('CharacterUpdatesPublisher', () => {
    let findOne: jest.Mock<Promise<Character>, [string]>;
    let publish: jest.Mock;
    let stream: FakeChangeStream;
    let publisher: CharacterUpdatesPublisher;

    const updateOf = (id: string) =>
        stream.emit('change', { fullDocument: { _id: id } });

    beforeEach(() => {
        findOne = jest.fn();
        publish = jest.fn().mockReturnValue(undefined);
        stream = new FakeChangeStream();
        publisher = new CharacterUpdatesPublisher(
            {
                watch: jest.fn().mockReturnValue(stream),
            } as unknown as Model<CharacterDocument>,
            { findOne } as unknown as CharactersService,
            { publish } as unknown as PubSub<PubSubEvents>,
        );
        publisher.onModuleInit();
    });

    afterEach(async () => {
        await publisher.onModuleDestroy();
        jest.restoreAllMocks();
    });

    it('publishes the populated character after an update (D-17a)', async () => {
        findOne.mockResolvedValueOnce(characterState(CHARACTER_ID, 'Aria'));

        updateOf(CHARACTER_ID);
        await settle();

        expect(findOne.mock.calls).toEqual([[CHARACTER_ID]]);
        expect(publish.mock.calls).toEqual([
            [
                'characterUpdated',
                { characterUpdated: characterState(CHARACTER_ID, 'Aria') },
            ],
        ]);
    });

    it('coalesces a burst on the same character into at most two reads (D-17a, WR-01)', async () => {
        findOne
            .mockResolvedValueOnce(characterState(CHARACTER_ID, 'first'))
            .mockResolvedValueOnce(characterState(CHARACTER_ID, 'last'));

        updateOf(CHARACTER_ID);
        updateOf(CHARACTER_ID);
        updateOf(CHARACTER_ID);
        await settle();

        expect(findOne.mock.calls.length).toBeLessThanOrEqual(2);
        expect(publish).toHaveBeenLastCalledWith('characterUpdated', {
            characterUpdated: characterState(CHARACTER_ID, 'last'),
        });
    });

    it('skips a character archived between the event and the read', async () => {
        const error = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        findOne.mockRejectedValueOnce(ResourceNotFoundException.character());

        updateOf(CHARACTER_ID);
        await settle();

        expect(findOne).toHaveBeenCalledTimes(1);
        expect(publish).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it('republishes a character on request (D-22)', async () => {
        findOne.mockResolvedValueOnce(characterState(CHARACTER_ID, 'Aria'));

        publisher.requestPublish(CHARACTER_ID);
        await settle();

        expect(findOne.mock.calls).toEqual([[CHARACTER_ID]]);
        expect(publish.mock.calls).toEqual([
            [
                'characterUpdated',
                { characterUpdated: characterState(CHARACTER_ID, 'Aria') },
            ],
        ]);
    });
});
