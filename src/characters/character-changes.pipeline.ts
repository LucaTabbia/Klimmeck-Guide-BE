// solo update/replace di personaggi attivi (03.1 D-07): con updateLookup l'update di archivio ha già deletedAt valorizzato
export const CHARACTER_CHANGES_PIPELINE = [
    {
        $match: {
            operationType: { $in: ['update', 'replace'] },
            'fullDocument.deletedAt': null,
        },
    },
];
