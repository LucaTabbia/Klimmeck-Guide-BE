import { Types, type Model } from 'mongoose';
import { MissionLockModule } from 'src/characters/mission-lock/mission-lock.module';
import { MissionLockReader } from 'src/characters/mission-lock/mission-lock.reader';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import {
    createAuthTestApp,
    type AuthTestApp,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildCharacter, persistCharacter } from '../../../test/fixtures';

const NOW = new Date('2026-11-14T12:00:00.000Z');
const STARTED = new Date('2026-11-14T11:00:00.000Z');
const HOUR_MS = 3_600_000;

interface LaneDates {
    startDate?: Date | null;
    missionDraftStartedAt?: Date | null;
}

describe('MissionLockReader (replSet)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let pendingQuests: Model<PendingQuestDocument>;
    let reader: MissionLockReader;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            clock: new FixedClock(NOW),
            imports: [MissionLockModule],
        });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        pendingQuests = harness.connection.model<PendingQuestDocument>(
            PendingQuest.name,
        );
        reader = harness.app.get(MissionLockReader);
        await Promise.all([characters.init(), pendingQuests.init()]);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function pendingQuestOf(
        dates: LaneDates,
        questId: Types.ObjectId = new Types.ObjectId(),
    ): Promise<Types.ObjectId> {
        const pendingQuest = await pendingQuests.create({
            startDate: null,
            waitingTime: HOUR_MS,
            pointsSpent: 0,
            quest: questId,
            ...dates,
        });
        return pendingQuest._id as Types.ObjectId;
    }

    async function characterOn(
        lane: QuestLane,
        pendingQuestId: Types.ObjectId,
        extra: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> {
        const character = await persistCharacter(characters, {
            infos: {
                ...buildCharacter().infos,
                name: `Locked Hero ${String(pendingQuestId)}`,
            },
            quests: { ...buildCharacter().quests, [lane]: pendingQuestId },
            ...extra,
        });
        return character._id as Types.ObjectId;
    }

    function refusalOf(characterId: Types.ObjectId): Promise<unknown> {
        return reader.assertFree(characterId).then(
            () => null,
            (error: unknown) => error,
        );
    }

    it('locks a character whose standard mission has started (D-12)', async () => {
        const characterId = await characterOn(
            QuestLane.standard,
            await pendingQuestOf({ startDate: STARTED }),
        );

        expect(await reader.isLocked(characterId)).toBe(true);
        expect(await reader.isGuidedLocked(characterId)).toBe(false);
        const refusal = await refusalOf(characterId);
        expect(refusal).toBeInstanceOf(GameRuleException);
        expect((refusal as GameRuleException).code).toBe(
            GameRuleErrorCode.MISSION_IN_PROGRESS,
        );
    });

    it('keeps free a character travelling to the quest (D-12)', async () => {
        const characterId = await characterOn(
            QuestLane.standard,
            await pendingQuestOf({ startDate: null }),
        );

        expect(await reader.isLocked(characterId)).toBe(false);
        await expect(reader.assertFree(characterId)).resolves.toBeUndefined();
    });

    it.each([QuestLane.worldMission, QuestLane.story])(
        'locks every participant of an open guided draft (D-16, D-11): %s',
        async (lane) => {
            const questId = new Types.ObjectId();
            const participants = [
                await characterOn(
                    lane,
                    await pendingQuestOf(
                        { startDate: STARTED, missionDraftStartedAt: NOW },
                        questId,
                    ),
                ),
                await characterOn(
                    lane,
                    await pendingQuestOf(
                        { startDate: STARTED, missionDraftStartedAt: NOW },
                        questId,
                    ),
                ),
            ];

            for (const characterId of participants) {
                expect(await reader.isLocked(characterId)).toBe(true);
                expect(await reader.isGuidedLocked(characterId)).toBe(true);
            }
        },
    );

    it('ignores a story accepted without a draft (D-12)', async () => {
        const characterId = await characterOn(
            QuestLane.story,
            await pendingQuestOf({
                startDate: STARTED,
                missionDraftStartedAt: null,
            }),
        );

        expect(await reader.isLocked(characterId)).toBe(false);
        expect(await reader.isGuidedLocked(characterId)).toBe(false);
    });

    it('releases the lock when the marker goes back to null (D-11)', async () => {
        const pendingQuestId = await pendingQuestOf({
            startDate: STARTED,
            missionDraftStartedAt: NOW,
        });
        const characterId = await characterOn(
            QuestLane.worldMission,
            pendingQuestId,
        );
        expect(await reader.isLocked(characterId)).toBe(true);

        await pendingQuests.updateOne(
            { _id: pendingQuestId },
            { $set: { missionDraftStartedAt: null } },
        );

        expect(await reader.isLocked(characterId)).toBe(false);
        expect(await reader.isGuidedLocked(characterId)).toBe(false);
    });

    it('reads the lanes inside a session (D-12)', async () => {
        const pendingQuestId = await pendingQuestOf({ startDate: STARTED });
        const characterId = await characterOn(QuestLane.story, pendingQuestId);

        const lockedInSession = await harness.connection.transaction(
            async (session) => {
                await pendingQuests.updateOne(
                    { _id: pendingQuestId },
                    { $set: { missionDraftStartedAt: NOW } },
                    { session },
                );
                return reader.isLocked(characterId, session);
            },
        );

        expect(lockedInSession).toBe(true);
    });

    it('answers false for an archived or unknown character (D-23)', async () => {
        const archivedId = await characterOn(
            QuestLane.standard,
            await pendingQuestOf({ startDate: STARTED }),
            { deletedAt: NOW },
        );

        expect(await reader.isLocked(archivedId)).toBe(false);
        expect(await reader.isLocked(new Types.ObjectId())).toBe(false);
        await expect(
            reader.assertFree(new Types.ObjectId()),
        ).resolves.toBeUndefined();
    });

    it('tells whether a quest has an open draft (D-23)', async () => {
        const draftedQuestId = new Types.ObjectId();
        const quietQuestId = new Types.ObjectId();
        await pendingQuestOf(
            { startDate: STARTED, missionDraftStartedAt: null },
            draftedQuestId,
        );
        await pendingQuestOf(
            { startDate: STARTED, missionDraftStartedAt: NOW },
            draftedQuestId,
        );
        await pendingQuestOf(
            { startDate: STARTED, missionDraftStartedAt: null },
            quietQuestId,
        );

        expect(await reader.hasOpenDraft(draftedQuestId)).toBe(true);
        expect(await reader.hasOpenDraft(quietQuestId)).toBe(false);
        expect(await reader.hasOpenDraft(new Types.ObjectId())).toBe(false);
    });
});
