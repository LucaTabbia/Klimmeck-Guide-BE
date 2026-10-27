import { getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import type request from 'supertest';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistSpell,
    spellBook,
} from '../../../test/fixtures';

const USE_SPELL =
    'mutation($request: UseSpellRequest!) { useSpell(request: $request) { successful response } }';

const T = new Date('2026-10-27T10:00:00.000Z');
const RECOVERY_TIME_MS = 1000;

interface WireBody {
    data?: { useSpell?: { successful: boolean; response: string } | null };
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

interface RawSpellState {
    spell: Types.ObjectId;
    usages: number;
    recoveries: Date[];
}

interface RawCharacter {
    status: { spellStates: RawSpellState[] };
    assets: { activeSpells: { spell: unknown; usages: number }[] };
}

interface RecoveryOptions {
    jobId: string;
}

interface BookEntry {
    spell: string;
    usages: number;
    active?: boolean;
    recoveries?: Date[];
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

function at(offsetMs: number): Date {
    return new Date(T.getTime() + offsetMs);
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
            recoveryTime: RECOVERY_TIME_MS,
        });
        return (spell._id as Types.ObjectId).toHexString();
    }

    function playerWith(
        twitchId: string,
        entries: BookEntry[],
    ): Promise<TestPlayer> {
        const book = spellBook(
            entries.map((entry) => ({
                ...entry,
                spell: new Types.ObjectId(entry.spell),
            })),
        );
        return createPlayer(harness, {
            twitchId,
            characterOverrides: {
                status: {
                    ...buildCharacter().status,
                    spells: book.spells,
                    spellStates: book.spellStates,
                },
                assets: {
                    ...buildCharacter().assets,
                    activeSpells: book.activeSpells,
                },
            },
        });
    }

    function idOf(player: TestPlayer): string {
        return String(player.character?._id);
    }

    async function rawOf(characterId: string): Promise<RawCharacter> {
        return (await characters.collection.findOne({
            _id: new Types.ObjectId(characterId),
        })) as unknown as RawCharacter;
    }

    async function stateOf(characterId: string): Promise<RawSpellState> {
        return (await rawOf(characterId)).status.spellStates[0];
    }

    async function mirrorUsagesOf(characterId: string): Promise<number> {
        return (await rawOf(characterId)).assets.activeSpells[0].usages;
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
        harness = await createCharactersTestApp({ clock: new FixedClock(T) });
        characters = harness.connection.model<CharacterDocument>(
            Character.name,
        );
        spells = harness.connection.model<SpellDocument>(Spell.name);
        queue = harness.app.get<{ add: jest.Mock }>(
            getQueueToken('spell-recovery'),
        );
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        queue.add.mockReset();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('spends one usage of the spell state and its mirror, records the instant and queues its trigger', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-happy', [
            { spell: spellId, usages: 2, active: true },
        ]);
        const charId = idOf(player);

        const body = await useSpell(player, spellId);

        expect(body.errors).toBeUndefined();
        expect(body.data?.useSpell).toEqual({
            successful: true,
            response: 'Magia utilizzata con successo',
        });
        const state = await stateOf(charId);
        expect(state.usages).toBe(1);
        expect(state.recoveries).toEqual([at(RECOVERY_TIME_MS)]);
        expect(await mirrorUsagesOf(charId)).toBe(1);
        expect(queue.add).toHaveBeenCalledTimes(1);
        const dueAtMs = at(RECOVERY_TIME_MS).getTime();
        expect(queue.add).toHaveBeenCalledWith(
            'recover',
            { characterId: charId, spellId, dueAt: dueAtMs },
            expect.objectContaining({
                jobId: `spell-${charId}-${spellId}-${dueAtMs}`,
                delay: RECOVERY_TIME_MS,
                removeOnComplete: true,
                removeOnFail: false,
            }),
        );
    });

    it('«Il timer di recupero non si interrompe mai»: keeps a later instant queued after the new one', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-ordered', [
            { spell: spellId, usages: 2, active: true, recoveries: [at(5000)] },
        ]);

        const body = await useSpell(player, spellId);

        expect(isSuccess(body)).toBe(true);
        expect((await stateOf(idOf(player))).recoveries).toEqual([
            at(RECOVERY_TIME_MS),
            at(5000),
        ]);
    });

    it('uses an active spell whose mirror stores a legacy string id', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-legacy', [
            { spell: spellId, usages: 2 },
        ]);
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
        expect((await stateOf(charId)).usages).toBe(1);
        expect(await mirrorUsagesOf(charId)).toBe(1);
        expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('leaves the spell state at 0 with exactly one success under concurrent uses', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-race', [
            { spell: spellId, usages: 1, active: true },
        ]);

        const bodies = await Promise.all(
            Array.from({ length: 4 }, () => useSpell(player, spellId)),
        );

        expect(bodies.filter(isSuccess)).toHaveLength(1);
        const rejected = bodies.filter((body) => !isSuccess(body));
        expect(rejected).toHaveLength(3);
        rejected.forEach((body) =>
            expect(codeOf(body)).toBe('SPELL_NO_USAGES_LEFT'),
        );
        const state = await stateOf(idOf(player));
        expect(state.usages).toBe(0);
        expect(state.recoveries).toHaveLength(1);
        expect(queue.add).toHaveBeenCalledTimes(1);
    });

    it('collapses two uses at the same instant into one deterministic trigger', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-jobs', [
            { spell: spellId, usages: 2, active: true },
        ]);

        const bodies = await Promise.all([
            useSpell(player, spellId),
            useSpell(player, spellId),
        ]);

        expect(bodies.every(isSuccess)).toBe(true);
        const state = await stateOf(idOf(player));
        expect(state.usages).toBe(0);
        expect(state.recoveries).toEqual([
            at(RECOVERY_TIME_MS),
            at(RECOVERY_TIME_MS),
        ]);
        expect(queue.add).toHaveBeenCalledTimes(2);
        const jobIds = new Set(
            queue.add.mock.calls.map(
                ([, , options]) => (options as RecoveryOptions).jobId,
            ),
        );
        expect(jobIds.size).toBe(1);
    });

    it('answers SPELL_NOT_ACTIVE for a known spell that is not active', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-inactive', [
            { spell: spellId, usages: 3 },
        ]);

        const inactive = await useSpell(player, spellId);
        const malformed = await useSpell(player, 'abc');

        expect(codeOf(inactive)).toBe('SPELL_NOT_ACTIVE');
        expect(messageOf(inactive)).toBe('Magia non attiva');
        expect(codeOf(malformed)).toBe('SPELL_NOT_ACTIVE');
        const state = await stateOf(idOf(player));
        expect(state.usages).toBe(3);
        expect(state.recoveries).toEqual([]);
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('answers SPELL_NO_USAGES_LEFT at zero usages in the spell state', async () => {
        const spellId = await dardo();
        const player = await playerWith('twitch-use-empty', [
            { spell: spellId, usages: 0, active: true },
        ]);

        const body = await useSpell(player, spellId);

        expect(codeOf(body)).toBe('SPELL_NO_USAGES_LEFT');
        expect(messageOf(body)).toBe('Magia senza utilizzi rimasti');
        expect((await stateOf(idOf(player))).usages).toBe(0);
        expect(await mirrorUsagesOf(idOf(player))).toBe(0);
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND and keeps the spell state when the spell is missing from the catalog', async () => {
        const ghost = new Types.ObjectId().toHexString();
        const player = await playerWith('twitch-use-ghost', [
            { spell: ghost, usages: 1, active: true },
        ]);

        const body = await useSpell(player, ghost);

        expect(codeOf(body)).toBe('NOT_FOUND');
        const state = await stateOf(idOf(player));
        expect(state.usages).toBe(1);
        expect(state.recoveries).toEqual([]);
        expect(await mirrorUsagesOf(idOf(player))).toBe(1);
        expect(queue.add).not.toHaveBeenCalled();
    });

    it('«Il timer di recupero non si interrompe mai»: answers success, keeps the spent usage and warns when the queue rejects', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const spellId = await dardo();
        const player = await playerWith('twitch-use-redis-down', [
            { spell: spellId, usages: 2, active: true },
        ]);
        queue.add.mockRejectedValueOnce(new Error('redis down'));

        const body = await useSpell(player, spellId);

        expect(body.errors).toBeUndefined();
        expect(isSuccess(body)).toBe(true);
        const state = await stateOf(idOf(player));
        expect(state.usages).toBe(1);
        expect(state.recoveries).toEqual([at(RECOVERY_TIME_MS)]);
        expect(await mirrorUsagesOf(idOf(player))).toBe(1);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('lo restituirà lo sweep'),
        );
    });
});
