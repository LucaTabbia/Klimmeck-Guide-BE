import { model, Schema, Types } from 'mongoose';
import { QuestOutcome } from '../enums/quest-outcome.enum';
import { QuestResultSchema, QuestRewardsSchema } from './quest-result.model';

const itemRefPathOf = (schema: Schema, path: string): unknown =>
    (schema.path(path) as unknown as { schema: Schema }).schema.path('item')
        .options.refPath;

const validResultDoc = () => ({
    character: new Types.ObjectId().toHexString(),
    user: new Types.ObjectId().toHexString(),
    quest: { id: new Types.ObjectId(), type: 'job', title: 'Lavoro' },
    outcome: 'success',
    resolvedAt: new Date('2026-10-24T10:00:00.000Z'),
    hpBefore: 1000,
    hpAfter: 1000,
    maxLifePoints: 1200,
    xpGained: 300,
    xpBefore: 0,
    xpAfter: 300,
    levelBefore: 1,
    levelAfter: 2,
    titleBefore: 'rookie',
    titleAfter: 'rookie',
    rewards: { coins: { gold: 0, silver: 1, copper: 0 }, items: [] },
});

describe('quest result schema', () => {
    const Result = model('QuestResultProbe', QuestResultSchema);

    it('knows the stable outcomes', () => {
        expect(Object.values(QuestOutcome)).toEqual([
            'success',
            'failure',
            'rescued',
            'death',
            'gmCompleted',
        ]);
    });

    it('stores every ref as a cast ObjectId', () => {
        for (const path of ['character', 'user', 'spellLearned', 'enemy']) {
            expect(QuestResultSchema.path(path).instance).toBe('ObjectId');
        }
    });

    it('stores the rescued characters as a list of cast ObjectIds', () => {
        const path = QuestResultSchema.path('rescuedCharacters') as unknown as {
            instance: string;
            caster: { instance: string };
        };

        expect(path.instance).toBe('Array');
        expect(path.caster.instance).toBe('ObjectId');
    });

    it('uses absolute refPaths for the consumed and rewarded items', () => {
        expect(itemRefPathOf(QuestResultSchema, 'consumablesUsed')).toBe(
            'consumablesUsed.itemType',
        );
        expect(itemRefPathOf(QuestRewardsSchema, 'items')).toBe(
            'rewards.items.itemType',
        );
    });

    it('validates a complete result with empty lists and null optional refs', () => {
        const result = new Result(validResultDoc());

        expect(result.validateSync()).toBeUndefined();
        expect(result.character instanceof Types.ObjectId).toBe(true);
        expect(result.injuriesAdded).toEqual([]);
        expect(result.consumablesUsed).toEqual([]);
        expect(result.spellsUsed).toEqual([]);
        expect(result.spellLearned).toBeNull();
        expect(result.enemy).toBeNull();
        expect(result.rescuedCharacters).toEqual([]);
    });

    it('rejects unknown outcomes and injuries', () => {
        expect(
            new Result({ ...validResultDoc(), outcome: 'grade' }).validateSync()
                ?.errors.outcome,
        ).toBeDefined();
        expect(
            new Result({
                ...validResultDoc(),
                injuriesAdded: ['nope'],
            }).validateSync(),
        ).toBeDefined();
    });

    it('requires the identity, the outcome and the progression snapshot', () => {
        const errors = new Result({}).validateSync()?.errors ?? {};

        for (const path of [
            'character',
            'user',
            'outcome',
            'resolvedAt',
            'hpBefore',
            'hpAfter',
            'maxLifePoints',
            'xpGained',
            'xpBefore',
            'xpAfter',
            'levelBefore',
            'levelAfter',
            'titleBefore',
            'titleAfter',
        ]) {
            expect(errors[path]).toBeDefined();
        }
    });

    it('keeps the quest snapshot id as a cast ref', () => {
        expect(
            new Result(validResultDoc()).get('quest.id') instanceof
                Types.ObjectId,
        ).toBe(true);
    });

    it('persists into the questresults collection', () => {
        expect(QuestResultSchema.get('collection')).toBe('questresults');
    });
});
