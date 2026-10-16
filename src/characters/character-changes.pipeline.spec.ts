import { CHARACTER_CHANGES_PIPELINE } from './character-changes.pipeline';

describe('CHARACTER_CHANGES_PIPELINE', () => {
    it('matches only updates and replaces of active characters', () => {
        expect(CHARACTER_CHANGES_PIPELINE).toEqual([
            {
                $match: {
                    operationType: { $in: ['update', 'replace'] },
                    'fullDocument.deletedAt': null,
                },
            },
        ]);
    });
});
