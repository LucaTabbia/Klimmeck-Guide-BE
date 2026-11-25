import { Model, Types } from 'mongoose';
import { AccountDeletionModule } from 'src/account/deletion/account-deletion.module';
import { Session, SessionDocument } from 'src/auth/session/session.model';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserDocument } from 'src/models/user.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer } from '../../../test/authz/player-fixture';

// ora reale al secondo: le sessioni revocate scadono a NOW + 900 s e il monitor TTL di Mongo non deve toglierle a metà caso
const NOW = new Date(Math.floor(new Date().getTime() / 1000) * 1000);
const DELETE_MY_ACCOUNT = 'mutation { deleteMyAccount }';
const DELETE_MY_ACCOUNT_WITH_ID =
    'mutation { deleteMyAccount(id: "64b0000000000000000000aa") }';

interface WireBody {
    data?: Record<string, any> | null;
    errors?: { message: string; extensions?: Record<string, unknown> }[];
}

describe('deleteMyAccount (wire)', () => {
    let harness: AuthTestApp;
    let users: Model<UserDocument>;
    let characters: Model<CharacterDocument>;
    let sessions: Model<SessionDocument>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [AccountDeletionModule],
            clock: new FixedClock(NOW),
        });
        users = harness.connection.model<UserDocument>(User.name);
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        sessions = harness.connection.model<SessionDocument>(Session.name);
        // collection pronte prima delle transazioni (Pitfall 9)
        await Promise.all(
            Object.values(harness.connection.models).map((model) =>
                model.init(),
            ),
        );
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function call(query: string, bearer?: string): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            query,
            undefined,
            bearer,
        );
        return response.body as WireBody;
    }

    function errorCodeOf(body: WireBody): unknown {
        return body.errors?.[0]?.extensions?.code;
    }

    function rawUser(id: unknown) {
        return users.collection.findOne({
            _id: new Types.ObjectId(String(id)),
        });
    }

    function rawCharacter(id: unknown) {
        return characters.collection.findOne({
            _id: new Types.ObjectId(String(id)),
        });
    }

    it("deletes the caller's account and answers true (D-04, D-20)", async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-own',
        });

        const body = await call(DELETE_MY_ACCOUNT, player.bearer);

        expect(body).toEqual({ data: { deleteMyAccount: true } });
        expect(await rawUser(player.user._id)).toBeNull();
        expect(await rawCharacter(player.character?._id)).toBeNull();
    });

    it('deletes an account without a character (D-17)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-empty',
            withCharacter: false,
        });

        const body = await call(DELETE_MY_ACCOUNT, player.bearer);

        expect(body).toEqual({ data: { deleteMyAccount: true } });
        expect(await rawUser(player.user._id)).toBeNull();
    });

    it('refuses the innkeeper with INNKEEPER_ACCOUNT_PROTECTED and deletes nothing (D-16)', async () => {
        // ruolo scritto all'inserimento: il watcher dei ruoli ascolta solo gli update
        const innkeeper = await createPlayer(harness, {
            twitchId: 'tw-del-innkeeper',
            role: RoleType.innkeeper,
        });
        const userBefore = await rawUser(innkeeper.user._id);
        const characterBefore = await rawCharacter(innkeeper.character?._id);
        const sessionsBefore = await sessions.collection
            .find({ userId: innkeeper.user._id })
            .toArray();

        const body = await call(DELETE_MY_ACCOUNT, innkeeper.bearer);

        expect(body.data).toBeNull();
        expect(errorCodeOf(body)).toBe('INNKEEPER_ACCOUNT_PROTECTED');
        expect(await rawUser(innkeeper.user._id)).toEqual(userBefore);
        expect(await rawCharacter(innkeeper.character?._id)).toEqual(
            characterBefore,
        );
        expect(sessionsBefore).toHaveLength(1);
        expect(
            await sessions.collection
                .find({ userId: innkeeper.user._id })
                .toArray(),
        ).toEqual(sessionsBefore);
    });

    it('answers UNAUTHENTICATED to a token whose user is already gone (D-20)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-gone',
        });
        await users.deleteOne({ _id: player.user._id });

        const body = await call(DELETE_MY_ACCOUNT, player.bearer);

        expect(body.data).toBeNull();
        expect(errorCodeOf(body)).toBe('UNAUTHENTICATED');
        expect(await rawCharacter(player.character?._id)).not.toBeNull();
    });

    it('takes no argument (D-20)', async () => {
        const player = await createPlayer(harness, {
            twitchId: 'tw-del-argument',
        });

        const body = await call(DELETE_MY_ACCOUNT_WITH_ID, player.bearer);

        expect(errorCodeOf(body)).toBe('GRAPHQL_VALIDATION_FAILED');
        expect(await rawUser(player.user._id)).not.toBeNull();
    });
});
