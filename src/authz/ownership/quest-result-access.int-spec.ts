import type { Model } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { AuthzModule } from 'src/authz/authz.module';
import { CharacterAccessPolicy } from 'src/authz/ownership/character-access.policy';
import {
    OwnedResource,
    ResourceAccess,
} from 'src/authz/ownership/owned-resource';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    QuestResult,
    QuestResultDocument,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { persistQuestResult } from '../../../test/quests/quest-result.fixture';

const MISSING_RESULT_ID = '64b0000000000000000000ff';

function identityOf(player: TestPlayer): AuthIdentity {
    return {
        userId: String(player.user._id),
        twitchId: player.user.twitchId,
        role: player.user.role,
    };
}

describe('Quest result ownership (owning user only)', () => {
    let harness: AuthTestApp;
    let policy: CharacterAccessPolicy;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;
    let resultId: string;

    function resultModel(): Model<QuestResultDocument> {
        return (harness.connection.models[QuestResult.name] ??
            harness.connection.model(
                QuestResult.name,
                QuestResultSchema,
            )) as Model<QuestResultDocument>;
    }

    function authorize(
        player: TestPlayer,
        id: string,
    ): Promise<ResourceAccess> {
        return policy.authorize(
            identityOf(player),
            OwnedResource.questResult,
            id,
        );
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [AuthzModule] });
        policy = harness.app.get(CharacterAccessPolicy);
    });

    beforeEach(async () => {
        alice = await createPlayer(harness, { twitchId: 'twitch-qr-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-qr-bruno' });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-qr-innkeeper',
            role: RoleType.innkeeper,
        });
        const result = await persistQuestResult(resultModel(), {
            character: alice.character?._id,
            user: alice.user._id,
        });
        resultId = String(result._id);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('grants owner access to the user of the result', async () => {
        await expect(authorize(alice, resultId)).resolves.toBe(
            ResourceAccess.owner,
        );
    });

    it('still grants owner access after the character was archived by death', async () => {
        await harness.connection
            .collection('users')
            .updateOne(
                { _id: alice.user._id },
                { $set: { currentCharacter: null } },
            );

        await expect(authorize(alice, resultId)).resolves.toBe(
            ResourceAccess.owner,
        );
    });

    it('forbids another adventurer', async () => {
        await expect(authorize(bruno, resultId)).rejects.toMatchObject({
            extensions: { code: 'FORBIDDEN' },
        });
    });

    it('forbids the innkeeper on a result that is not theirs (no bypass)', async () => {
        await expect(authorize(oste, resultId)).rejects.toMatchObject({
            extensions: { code: 'FORBIDDEN' },
        });
    });

    it('reports a malformed id as not found', async () => {
        await expect(authorize(alice, 'not-an-id')).rejects.toMatchObject({
            extensions: { code: 'NOT_FOUND' },
        });
    });

    it('reports a missing result as not found', async () => {
        await expect(authorize(alice, MISSING_RESULT_ID)).rejects.toMatchObject(
            {
                extensions: { code: 'NOT_FOUND' },
                message: 'Risultato non trovato',
            },
        );
    });
});
