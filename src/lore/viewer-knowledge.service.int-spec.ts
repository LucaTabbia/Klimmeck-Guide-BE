import { Model, Types } from 'mongoose';
import type { AuthIdentity } from 'src/auth/auth-identity';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import { User, UserSchema } from 'src/models/user.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { createPlayer, type TestPlayer } from '../../test/authz/player-fixture';
import { playerKnowing } from '../../test/lore/lore-world';
import { LoreVisibilityModule } from './lore-visibility.module';
import {
    isVisible,
    knowsEnemy,
    SEES_EVERYTHING,
    SEES_NOTHING,
} from './lore-visibility';
import {
    ViewerKnowledgeService,
    viewerCacheKeyOf,
} from './viewer-knowledge.service';

describe('ViewerKnowledgeService', () => {
    let harness: AuthTestApp;
    let viewers: ViewerKnowledgeService;
    let characters: Model<any>;
    let users: Model<any>;

    function identityOf(player: TestPlayer, role = RoleType.adventurer) {
        return {
            userId: String(player.user._id),
            twitchId: player.user.twitchId,
            role,
        } satisfies AuthIdentity;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [LoreVisibilityModule] });
        viewers = harness.app.get(ViewerKnowledgeService);
        characters =
            harness.connection.models[Character.name] ??
            harness.connection.model(Character.name, CharacterSchema);
        users =
            harness.connection.models[User.name] ??
            harness.connection.model(User.name, UserSchema);
    });

    beforeEach(async () => {
        await harness.clearDatabase();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('keys the cache on the event root value or else on the context (D-07, Pitfall 1)', () => {
        const context = {};
        const root = {};

        expect(viewerCacheKeyOf(context, { rootValue: root })).toBe(root);
        expect(viewerCacheKeyOf(context, { rootValue: undefined })).toBe(
            context,
        );
        expect(viewerCacheKeyOf(context, { rootValue: null })).toBe(context);
        expect(viewerCacheKeyOf(context, { rootValue: 'root' })).toBe(context);
        expect(viewerCacheKeyOf(context)).toBe(context);
    });

    it('sees everything as the innkeeper without reading the database (D-07, D-10)', async () => {
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-viewer-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        const userRead = jest.spyOn(users, 'findById');
        const characterRead = jest.spyOn(characters, 'findOne');

        const visibility = await viewers.of(
            identityOf(innkeeper, RoleType.innkeeper),
            {},
        );

        expect(visibility).toEqual(SEES_EVERYTHING);
        expect(userRead).not.toHaveBeenCalled();
        expect(characterRead).not.toHaveBeenCalled();
    });

    it('sees the two sets of the current character (D-10)', async () => {
        const known = new Types.ObjectId();
        const locked = new Types.ObjectId();
        const enemy = new Types.ObjectId();
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-viewer-player',
            lore: [known],
            enemies: [enemy],
        });

        const visibility = await viewers.of(identityOf(player), {});

        expect(isVisible(visibility, known)).toBe(true);
        expect(knowsEnemy(visibility, enemy)).toBe(true);
        expect(isVisible(visibility, locked)).toBe(false);
        expect(knowsEnemy(visibility, known)).toBe(false);
    });

    it('sees nothing without an identity, a user or a current character (D-10)', async () => {
        const homeless = await createPlayer(harness, {
            twitchId: 'twitch-viewer-homeless',
            withCharacter: false,
        });

        expect(await viewers.of(undefined, {})).toEqual(SEES_NOTHING);
        expect(
            await viewers.of(
                {
                    userId: 'not-a-hex-id',
                    twitchId: 'twitch-viewer-ghost',
                    role: RoleType.adventurer,
                },
                {},
            ),
        ).toEqual(SEES_NOTHING);
        expect(
            await viewers.of(
                {
                    userId: new Types.ObjectId().toHexString(),
                    twitchId: 'twitch-viewer-missing',
                    role: RoleType.adventurer,
                },
                {},
            ),
        ).toEqual(SEES_NOTHING);
        expect(await viewers.of(identityOf(homeless), {})).toEqual(
            SEES_NOTHING,
        );
    });

    it('sees nothing for a dead character awaiting the sheet (D-13)', async () => {
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-viewer-dead',
            lore: [new Types.ObjectId()],
            characterOverrides: {
                deletedAt: new Date('2026-11-07T10:00:00.000Z'),
                deletionReason: DeletionReason.death,
            },
        });

        expect(await viewers.of(identityOf(player), {})).toEqual(SEES_NOTHING);
    });

    it('reads the viewer once for the same context and again for another (D-07)', async () => {
        const known = new Types.ObjectId();
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-viewer-cached',
            lore: [known],
        });
        const characterRead = jest.spyOn(characters, 'findOne');
        const context = {};

        const reads = await Promise.all([
            viewers.of(identityOf(player), context),
            viewers.of(identityOf(player), context, { rootValue: undefined }),
            viewers.of(identityOf(player), context),
        ]);

        expect(reads.every((read) => isVisible(read, known))).toBe(true);
        expect(characterRead).toHaveBeenCalledTimes(1);

        await viewers.of(identityOf(player), {});

        expect(characterRead).toHaveBeenCalledTimes(2);
    });
});
