import { Db, Document, ObjectId } from 'mongodb';
import type { DeleteQuestsFix } from 'src/content/schema/fix.content';
import { idForms, sameId } from 'src/mongo/document-id';
import { QUEST_LANES, QuestLane } from 'src/quests/acceptance/quest-lanes';
import { BlockedQuest, changeStatus, FixMode, FixReport } from './fix-report';

interface QuestPlan {
    questId: ObjectId;
    blocked: BlockedQuest[];
    questExists: boolean;
    pendingQuests: ObjectId[];
    poiBackLinks: number;
}

// i ref legacy possono essere stringhe esadecimali (04 Pitfall 1): ogni filtro cerca entrambe le forme
function anyIdForm(ids: readonly ObjectId[]): { $in: (ObjectId | string)[] } {
    return { $in: ids.flatMap((id) => idForms(id)) };
}

function laneOf(character: Document, lane: QuestLane): unknown {
    return (character.quests as Document | undefined)?.[lane];
}

async function laneBlockers(
    db: Db,
    questId: ObjectId,
    pendingQuests: readonly ObjectId[],
): Promise<BlockedQuest[]> {
    if (pendingQuests.length === 0) return [];
    const inPending = anyIdForm(pendingQuests);
    const characters = await db
        .collection('characters')
        .find({
            $or: QUEST_LANES.map((lane) => ({
                [`quests.${lane}`]: inPending,
            })),
        })
        .toArray();
    return characters.flatMap((character) =>
        QUEST_LANES.flatMap((lane) => {
            const pending = pendingQuests.find((id) =>
                sameId(laneOf(character, lane), id),
            );
            if (!pending) return [];
            return [
                {
                    questId: questId.toHexString(),
                    pendingQuest: pending.toHexString(),
                    character: character._id.toHexString(),
                    lane,
                },
            ];
        }),
    );
}

async function awaitingAidBlockers(
    db: Db,
    questId: ObjectId,
): Promise<BlockedQuest[]> {
    const forms = anyIdForm([questId]);
    const characters = await db
        .collection('characters')
        .find({
            $or: [
                { 'status.awaitingAid.quest': forms },
                { 'status.awaitingAid.aidQuest': forms },
            ],
        })
        .toArray();
    return characters.map((character) => ({
        questId: questId.toHexString(),
        pendingQuest: null,
        character: character._id.toHexString(),
        lane: 'awaitingAid',
    }));
}

// Pitfall 2: una corsia occupata o un soccorso in attesa bloccano l'id; nessuna scrittura per quell'id
async function planQuest(db: Db, questId: ObjectId): Promise<QuestPlan> {
    const forms = anyIdForm([questId]);
    const pendingQuests = (
        await db
            .collection('pendingquests')
            .find({ quest: forms }, { projection: { _id: 1 } })
            .toArray()
    ).map((pending) => pending._id);
    const blocked = [
        ...(await laneBlockers(db, questId, pendingQuests)),
        ...(await awaitingAidBlockers(db, questId)),
    ];
    const questExists =
        (await db.collection('quests').countDocuments({ _id: questId })) > 0;
    const poiBackLinks = await db
        .collection('pointsofinterest')
        .countDocuments({ quest: forms });
    return { questId, blocked, questExists, pendingQuests, poiBackLinks };
}

function touchedBy(plan: QuestPlan): number {
    if (plan.blocked.length > 0) return 0;
    return (
        Number(plan.questExists) + plan.pendingQuests.length + plan.poiBackLinks
    );
}

// la quest per ultima: una corsa interrotta la ritrova e completa il lavoro
async function applyPlan(db: Db, plan: QuestPlan): Promise<void> {
    const forms = anyIdForm([plan.questId]);
    await db
        .collection('pointsofinterest')
        .updateMany({ quest: forms }, { $set: { quest: null } });
    if (plan.pendingQuests.length > 0) {
        await db
            .collection('pendingquests')
            .deleteMany({ _id: { $in: plan.pendingQuests } });
    }
    await db.collection('quests').deleteOne({ _id: plan.questId });
}

// i questresults sono storia (D-05): solo contati, mai toccati
async function questResultsCiting(
    db: Db,
    questIds: readonly ObjectId[],
): Promise<number> {
    return db
        .collection('questresults')
        .countDocuments({ 'quest.id': anyIdForm(questIds) });
}

// aid fuori lista che puntano a una quest della lista: riportate, non cancellate
async function aidReferencesTo(
    db: Db,
    questIds: readonly ObjectId[],
): Promise<string[]> {
    const aids = await db
        .collection('quests')
        .find(
            {
                'rescue.failedQuest': anyIdForm(questIds),
                _id: { $nin: [...questIds] },
            },
            { projection: { _id: 1 } },
        )
        .sort({ _id: 1 })
        .toArray();
    return aids.map((aid) => aid._id.toHexString());
}

export async function deleteQuests(
    db: Db,
    fix: DeleteQuestsFix,
    mode: FixMode,
): Promise<FixReport> {
    const questIds = [...new Set(fix.ids)].map((hex) => new ObjectId(hex));
    const aidReferences = await aidReferencesTo(db, questIds);
    const questResultsKept = await questResultsCiting(db, questIds);
    const plans: QuestPlan[] = [];
    for (const questId of questIds) plans.push(await planQuest(db, questId));
    const free = plans.filter((plan) => touchedBy(plan) > 0);
    if (mode === 'apply') {
        for (const plan of free) await applyPlan(db, plan);
    }
    const blocked = plans.flatMap((plan) => plan.blocked);
    const touched = free.reduce((sum, plan) => sum + touchedBy(plan), 0);
    return {
        key: fix.key,
        kind: fix.kind,
        status: blocked.length > 0 ? 'blocked' : changeStatus(touched, mode),
        touched,
        blocked,
        deleted: free
            .filter((plan) => plan.questExists)
            .map((plan) => plan.questId.toHexString()),
        pendingQuestsDeleted: free.reduce(
            (sum, plan) => sum + plan.pendingQuests.length,
            0,
        ),
        poiBackLinksCleared: free.reduce(
            (sum, plan) => sum + plan.poiBackLinks,
            0,
        ),
        questResultsKept,
        aidReferences,
    };
}
