import { getQueueToken } from '@nestjs/bull';
import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { buildCharacter, persistSpell } from '../../../test/fixtures';

const USE_SPELL =
    'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful response } }';

interface WireBody {
    data?: { useSpell?: { successful: boolean; response: string } | null };
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawCharacter {
    assets: { activeSpells: { spell: unknown; usages: number }[] };
}

interface RecoveryOptions {
    jobId: string;
}

function codeOf(body: WireBody): unknown {
    return body.errors?.[0]?.extensions?.code;
}

function messageOf(body: WireBody): unknown {
    return body.errors?.[0]?.message;
}

function isSuccess(body: WireBody): boolean {
    return body.data?.useSpell?.successful === true;
}

describe('useSpell (wire)', () => {
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;
    let spells: Model<SpellDocument>;
    let queue: { add: jest.Mock };

    async function dardo(): Promise<string> {
        const spell = await persistSpell(spells, {
            name: 'Dardo',
            maxUsages: 3,
            recoveryTime: 1000,
        });
        return (spell._id as Types.ObjectId).toHexString();
    }

    function playerWith(
        twitchId: string,
        known: string[],
        activeSpells: { spell: string; usages: number }[],
    ): Promise<TestPlayer> {
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    spells: known.map((id) => new Types.ObjectId(id)),
                },
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: activeSpells.map(({ spell, usages }) => ({
                        spell: new Types.ObjectId(spell),
                        usages,
                    })),
                },
            },
        });
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    async function usagesOf(characterId: string): Promise<number> {
        const raw = (await characters.collection.findOne({
            _id: new Types.ObjectId(characterId),
        })) as unknown as RawCharacter;
        return raw.assets.activeSpells[0].usages;
    }

    async function useSpell(
        player: TestPlayer,
        spellId: string,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            USE_SPELL,
            { request: { characterId: idOf(player), spellId } },
            player.bearer,
        );
        return response.body as WireBody;
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp();
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        spells = harness.connection.model<SpellDocument>(Spell.name);
        queue = harness.app.get<{ add: jest.Mock }>(
            getQueueToken('spell-recovery'),
        );
    });

    afterEach(async () => {
        jest.clearAllMocks();
        queue.add.mockReset();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('decrements one usage and queues one recovery', async () => {
        const spellId = await dardo();
        const player = await playerWith(
            'twitch-use-happy',
            [spellId],
            [{ spell: spellId, usages: 2 }],
        );
        const charId = idOf(player);

        const body = await useSpell(player, spellId);

        expect(body.errors).toBeUndefined();
        expect(body.data?.useSpell).toEqual({
            successful: true,
            response: 'Magia utilizzata con successo',
        });
        expect(await usagesOf(charId)).toBe(1);
        expect(queue.add).toHaveBeenCalledTimes(1);
        expect(queue.add).toHaveBeenCalledWith(
            'recover',
            { characterId: charId, spellId },
            expect.objectContaining({
                delay: 1000,
                removeOnComplete: true,
                removeOnFail: false,
                jobId: expect.stringMatching(
                    new RegExp(`^${charId}-${spellId}-[0-9a-f-]{36}$`),
                ),
            }),
        );
    });

    it('uses an active spell stored with a legacy string id', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-legacy', [spellId], []);
        const charId = idOf(player);
        // scrittura raw: i dati legacy hanno l'id della magia salvato come stringa (04 Pitfall 1)
        await characters.collection.updateOne(
            { _id: new Types.ObjectId(charId) },
            {
                $set: {
                    'assets.activeSpells': [{ spell: spellId, usages: 2 }],
                },
            },
        );

        const body = await useSpell(player, spellId);

        expect(isSuccess(body)).toBe(true);
        expect(await usagesOf(charId)).toBe(1);
        expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('leaves usages at 0 with exactly one success under concurrent uses', async () => {
        const spellId = await dardo();
        const player = await playerWith(
            'twitch-use-race',
            [spellId],
            [{ spell: spellId, usages: 1 }],
        );

        const bodies = await Promise.all(
            Array.from({ length: 4 }, () => useSpell(player, spellId)),
        );

        expect(bodies.filter(isSuccess)).toHaveLength(1);
        const rejected = bodies.filter((body) => !isSuccess(body));
        expect(rejected).toHaveLength(3);
        rejected.forEach((body) =>
            expect(codeOf(body)).toBe('SPELL_NO_USAGES_LEFT'),
        );
        expect(await usagesOf(idOf(player))).toBe(0);
        expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('queues distinct recovery jobs for concurrent successes', async () => {
        const spellId = await dardo();
        const player = await playerWith(
            'twitch-use-jobs',
            [spellId],
            [{ spell: spellId, usages: 2 }],
        );

        const bodies = await Promise.all([
            useSpell(player, spellId),
            useSpell(player, spellId),
        ]);

        expect(bodies.every(isSuccess)).toBe(true);
        expect(await usagesOf(idOf(player))).toBe(0);
        expect(queue.add).toHaveBeenCalledTimes(2);
        const jobIds = new Set(
            queue.add.mock.calls.map(
                ([, , options]) => (options as RecoveryOptions).jobId,
            ),
        );
        expect(jobIds.size).toBe(2);
    });

    it('answers SPELL_NOT_ACTIVE for a known spell that is not active', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-inactive', [spellId], []);

        const inactive = await useSpell(player, spellId);
        const malformed = await useSpell(player, 'abc');

        expect(codeOf(inactive)).toBe('SPELL_NOT_ACTIVE');
        expect(messageOf(inactive)).toBe('Magia non attiva');
        expect(codeOf(malformed)).toBe('SPELL_NOT_ACTIVE');
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('answers SPELL_NO_USAGES_LEFT at zero usages', async () => {
        const spellId = await dardo();
        const player = await playerWith(
            'twitch-use-empty',
            [spellId],
            [{ spell: spellId, usages: 0 }],
        );

        const body = await useSpell(player, spellId);

        expect(codeOf(body)).toBe('SPELL_NO_USAGES_LEFT');
        expect(messageOf(body)).toBe('Magia senza utilizzi rimasti');
        expect(await usagesOf(idOf(player))).toBe(0);
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND and keeps the usage when the spell is missing from the catalog', async () => {
        const ghost = new Types.ObjectId().toHexString();
        const player = await playerWith(
            'twitch-use-ghost',
            [ghost],
            [{ spell: ghost, usages: 1 }],
        );

        const body = await useSpell(player, ghost);

        expect(codeOf(body)).toBe('NOT_FOUND');
        expect(await usagesOf(idOf(player))).toBe(1);
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('restores the usage and answers SPELL_RECOVERY_UNAVAILABLE when the queue rejects', async () => {
        const spellId = await dardo();
        const player = await playerWith(
            'twitch-use-redis-down',
            [spellId],
            [{ spell: spellId, usages: 1 }],
        );
        queue.add.mockRejectedValueOnce(new Error('redis down'));

        const body = await useSpell(player, spellId);

        expect(codeOf(body)).toBe('SPELL_RECOVERY_UNAVAILABLE');
        expect(messageOf(body)).toBe(
            'Recupero della magia non disponibile, riprova',
        );
        expect(await usagesOf(idOf(player))).toBe(1);
    });
});
