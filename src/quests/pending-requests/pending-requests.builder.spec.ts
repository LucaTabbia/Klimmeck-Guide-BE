import { Types } from 'mongoose';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    buildPendingRequests,
    PendingRequestsInput,
    RequestCharacterSnapshot,
    RequestPendingQuestSnapshot,
    RequestQuestSnapshot,
    RequestUserSnapshot,
} from './pending-requests.builder';

const EARLY = new Date('2026-10-01T10:00:00.000Z');
const LATE = new Date('2026-10-02T10:00:00.000Z');

function character(
    name: string,
    lanes: { story?: Types.ObjectId; worldMission?: Types.ObjectId },
    status: Partial<NonNullable<RequestCharacterSnapshot['status']>> = {},
): RequestCharacterSnapshot {
    return {
        _id: new Types.ObjectId(),
        infos: { name },
        status: {
            title: TitleType.rookie,
            location: new Types.ObjectId(),
            activeTravel: null,
            awaitingAid: null,
            ...status,
        },
        quests: {
            activeStoryQuest: lanes.story ?? null,
            activeWorldMissionQuest: lanes.worldMission ?? null,
        },
    };
}

function pendingQuest(
    quest: Types.ObjectId,
    startDate: Date | null = EARLY,
    pointsSpent = 100,
): RequestPendingQuestSnapshot {
    return { _id: new Types.ObjectId(), startDate, pointsSpent, quest };
}

function quest(
    type: string,
    title: string,
    overrides: Partial<RequestQuestSnapshot> = {},
): RequestQuestSnapshot {
    return {
        _id: new Types.ObjectId(),
        infos: { type, title },
        requirements: { requiredAdventurers: [] },
        registeredAdventurers: [],
        ...overrides,
    };
}

function userOf(
    owner: RequestCharacterSnapshot,
    twitchId: string,
): RequestUserSnapshot {
    return { _id: new Types.ObjectId(), twitchId, currentCharacter: owner._id };
}

function hex(id: Types.ObjectId): string {
    return id.toHexString();
}

describe('buildPendingRequests', () => {
    it('lists one entry per GM lane and ignores the standard lane', () => {
        const story = quest('story', 'The king');
        const mission = quest('worldMission', 'The siege');
        const storyPq = pendingQuest(story._id);
        const missionPq = pendingQuest(mission._id, LATE);
        const hero = character('Aria', {
            story: storyPq._id,
            worldMission: missionPq._id,
        });
        const standard = quest('hunt', 'Wolves');
        const standardPq = pendingQuest(standard._id);
        const input: PendingRequestsInput = {
            characters: [
                {
                    ...hero,
                    quests: {
                        ...hero.quests,
                        pendingQuest: standardPq._id,
                    } as RequestCharacterSnapshot['quests'],
                },
            ],
            pendingQuests: [storyPq, missionPq, standardPq],
            quests: [story, mission, standard],
            users: [userOf(hero, 'twitch-aria')],
        };

        const { requests, skipped } = buildPendingRequests(input);

        expect(skipped).toEqual([]);
        expect(requests.map((request) => request.id)).toEqual([
            hex(storyPq._id),
            hex(missionPq._id),
        ]);
    });

    it('builds the flat entry of a story request', () => {
        const story = quest('story', 'The king');
        const storyPq = pendingQuest(story._id, EARLY, 250);
        const hero = character('Aria', { story: storyPq._id });
        const user = userOf(hero, 'twitch-aria');

        const { requests } = buildPendingRequests({
            characters: [hero],
            pendingQuests: [storyPq],
            quests: [story],
            users: [user],
        });

        expect(requests).toEqual([
            {
                id: hex(storyPq._id),
                startDate: EARLY,
                pointsSpent: 250,
                quest: {
                    id: hex(story._id),
                    type: 'story',
                    title: 'The king',
                    requiredAdventurers: [],
                    registeredAdventurers: [],
                },
                character: {
                    id: hex(hero._id),
                    name: 'Aria',
                    title: TitleType.rookie,
                    location: hex(hero.status?.location as Types.ObjectId),
                    activeTravel: null,
                    awaitingAid: null,
                },
                user: { id: hex(user._id), twitchId: 'twitch-aria' },
            },
        ]);
    });

    it('lists one entry per registered character of a world mission', () => {
        const required = [
            { title: TitleType.rookie, count: 2 },
            { title: null, count: 1 },
        ];
        const mission = quest('worldMission', 'The siege', {
            requirements: { requiredAdventurers: required },
        });
        const heroes = ['Aria', 'Bram', 'Cora'].map((name) => {
            const pq = pendingQuest(mission._id);
            return { pq, hero: character(name, { worldMission: pq._id }) };
        });
        mission.registeredAdventurers = heroes.map(({ hero }) => ({
            character: hero._id,
            title: TitleType.rookie,
        }));

        const { requests } = buildPendingRequests({
            characters: heroes.map(({ hero }) => hero),
            pendingQuests: heroes.map(({ pq }) => pq),
            quests: [mission],
            users: heroes.map(({ hero }, index) =>
                userOf(hero, `twitch-${index}`),
            ),
        });

        expect(requests).toHaveLength(3);
        expect(
            requests.map((request) => request.character.name).sort(),
        ).toEqual(['Aria', 'Bram', 'Cora']);
        for (const request of requests) {
            expect(request.quest.requiredAdventurers).toEqual(required);
            expect(request.quest.registeredAdventurers).toEqual(
                mission.registeredAdventurers,
            );
        }
    });

    it.each(['pendingQuest', 'quest', 'user'] as const)(
        'skips the entry whose %s is missing and reports its ids',
        (missing) => {
            const story = quest('story', 'The king');
            const storyPq = pendingQuest(story._id);
            const hero = character('Aria', { story: storyPq._id });

            const { requests, skipped } = buildPendingRequests({
                characters: [hero],
                pendingQuests: missing === 'pendingQuest' ? [] : [storyPq],
                quests: missing === 'quest' ? [] : [story],
                users: missing === 'user' ? [] : [userOf(hero, 'twitch-a')],
            });

            expect(requests).toEqual([]);
            expect(skipped).toEqual([
                {
                    characterId: hex(hero._id),
                    pendingQuestId: hex(storyPq._id),
                },
            ]);
        },
    );

    it('orders by startDate ascending with null last, then by pending quest id', () => {
        const story = quest('story', 'The king');
        const travelling = pendingQuest(story._id, null);
        const late = pendingQuest(story._id, LATE);
        const earlyB = pendingQuest(story._id, EARLY);
        const earlyA = pendingQuest(story._id, EARLY);
        const [first, second] = [earlyA, earlyB].sort((a, b) =>
            hex(a._id).localeCompare(hex(b._id)),
        );
        const pqs = [travelling, late, earlyB, earlyA];
        const heroes = pqs.map((pq, index) =>
            character(`Hero ${index}`, { story: pq._id }),
        );

        const { requests } = buildPendingRequests({
            characters: heroes,
            pendingQuests: pqs,
            quests: [story],
            users: heroes.map((hero, index) => userOf(hero, `twitch-${index}`)),
        });

        expect(requests.map((request) => request.id)).toEqual([
            hex(first._id),
            hex(second._id),
            hex(late._id),
            hex(travelling._id),
        ]);
    });

    it('reads a legacy requiredAdventurers that is not an array as empty', () => {
        const story = quest('story', 'The king', {
            requirements: { requiredAdventurers: 3 },
        });
        const storyPq = pendingQuest(story._id);
        const hero = character('Aria', { story: storyPq._id });

        const { requests } = buildPendingRequests({
            characters: [hero],
            pendingQuests: [storyPq],
            quests: [story],
            users: [userOf(hero, 'twitch-aria')],
        });

        expect(requests[0].quest.requiredAdventurers).toEqual([]);
    });

    it('copies the active travel and the awaited aid of the character', () => {
        const activeTravel = {
            road: { coordinates: [[0, 0]] as [number, number][], distance: 1 },
            startTime: EARLY,
            endTime: LATE,
            duration: LATE.getTime() - EARLY.getTime(),
            to: new Types.ObjectId(),
        };
        const awaitingAid = {
            quest: new Types.ObjectId(),
            aidQuest: new Types.ObjectId(),
            since: EARLY,
        };
        const story = quest('story', 'The king');
        const storyPq = pendingQuest(story._id);
        const hero = character(
            'Aria',
            { story: storyPq._id },
            {
                activeTravel: activeTravel as never,
                awaitingAid,
            },
        );

        const { requests } = buildPendingRequests({
            characters: [hero],
            pendingQuests: [storyPq],
            quests: [story],
            users: [userOf(hero, 'twitch-aria')],
        });

        expect(requests[0].character.activeTravel).toEqual(activeTravel);
        expect(requests[0].character.awaitingAid).toEqual(awaitingAid);
    });

    it('matches lanes, quests and users stored as legacy hex strings', () => {
        const story = quest('story', 'The king');
        const storyPq = {
            ...pendingQuest(story._id),
            quest: hex(story._id),
        };
        const hero = character('Aria', { story: storyPq._id });
        const user = {
            ...userOf(hero, 'twitch-aria'),
            currentCharacter: hex(hero._id),
        };

        const { requests, skipped } = buildPendingRequests({
            characters: [hero],
            pendingQuests: [storyPq],
            quests: [story],
            users: [user],
        });

        expect(skipped).toEqual([]);
        expect(requests[0].user.id).toBe(hex(user._id));
    });
});
