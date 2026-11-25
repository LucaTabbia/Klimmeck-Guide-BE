import { TypeMetadataStorage } from '@nestjs/graphql';
import { LazyMetadataStorage } from '@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage';
import mongoose, { Model, Types } from 'mongoose';
import { PendingQuest, PendingQuestSchema } from './pending-quest.model';

describe('PendingQuest schema trip spending', () => {
    const PendingQuestModel: Model<any> =
        mongoose.models[PendingQuest.name] ||
        mongoose.model(PendingQuest.name, PendingQuestSchema);

    const graphqlFieldNamesOfPendingQuest = (): string[] => {
        LazyMetadataStorage.load([PendingQuest]);
        const objectType =
            TypeMetadataStorage.getObjectTypeMetadataByTarget(PendingQuest)!;
        TypeMetadataStorage.compileClassMetadata([objectType]);
        return objectType.properties!.map(({ name }) => name).sort();
    };

    it('starts a pending quest with nothing spent on the trip (D-26)', () => {
        const stored = PendingQuestModel.hydrate({
            _id: new Types.ObjectId(),
            startDate: null,
            arrivedAt: null,
            waitingTime: 0,
            pointsSpent: 40,
            quest: new Types.ObjectId(),
        });

        expect(stored.toObject().travelFoodSpent).toEqual([]);
        expect(stored.get('travelHungerLifeLost')).toBe(0);
    });

    it('stores the eaten lines as item refs with a quantity (D-26)', () => {
        const item = new Types.ObjectId();
        const pendingQuest = new PendingQuestModel({
            waitingTime: 0,
            quest: new Types.ObjectId(),
            travelFoodSpent: [{ item: item.toHexString(), quantity: 2 }],
            travelHungerLifeLost: 5,
        });

        expect(pendingQuest.toObject().travelFoodSpent).toEqual([
            { item, quantity: 2 },
        ]);
        expect(pendingQuest.get('travelHungerLifeLost')).toBe(5);
    });

    it('keeps the trip spending out of GraphQL (D-26)', () => {
        expect(graphqlFieldNamesOfPendingQuest()).toEqual([
            'arrivedAt',
            'id',
            'pointsSpent',
            'quest',
            'startDate',
            'waitingTime',
        ]);
    });
});
