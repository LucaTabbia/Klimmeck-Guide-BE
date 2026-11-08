import { Types } from 'mongoose';
import { fromCopper } from 'src/economy/coins';
import { TravelKind } from 'src/models/character/active-travel.model';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { durationMsOf } from 'src/travel/travel-timing';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import type { AmbushIdentity } from './ambush-job';
import {
    type AmbushCharacterSnapshot,
    type AmbushOutcomePlan,
    type AmbushPlanInput,
    type DetourDraft,
    planAmbushOutcome,
} from './ambush-plan';
import { ambushFilter } from './ambush.updates';

const CHARACTER_ID = new Types.ObjectId('64b0000000000000000000b1');
const RESULT_ID = new Types.ObjectId('64b0000000000000000000b2');
const USER_ID = new Types.ObjectId('64b0000000000000000000b3');
const POTION_ID = new Types.ObjectId('64b0000000000000000000b4');
const SPELL_ID = new Types.ObjectId('64b0000000000000000000b5');
const ENEMY_ID = new Types.ObjectId('64b0000000000000000000b6');
const CITY_ID = new Types.ObjectId('64b0000000000000000000b7');
const TO_ID = new Types.ObjectId('64b0000000000000000000b8');
const CROCEVIA_ID = new Types.ObjectId('64b0000000000000000000b9');
const PENDING_ID = new Types.ObjectId('64b0000000000000000000ba');

const START = new Date('2026-10-21T10:00:00.000Z');
const DURATION = 20 * 3_600_000;
const END = new Date(START.getTime() + DURATION);
const AT = new Date(START.getTime() + DURATION / 2);
const NOW = new Date(AT.getTime() + 15 * 60_000);
const RECOVERY_MS = 60_000;
const LEVEL_TWO_XP = 250;

const identity: AmbushIdentity = {
    characterId: CHARACTER_ID,
    startTime: START,
    at: AT,
};

const nearCity = { id: CITY_ID, name: 'Crocevia' };

const travel = {
    road: {
        coordinates: [
            [0, 0],
            [0, 9],
        ] as [number, number][],
        distance: 20,
    },
    startTime: START,
    endTime: END,
    duration: DURATION,
    to: TO_ID,
    kind: TravelKind.free,
    ambush: { at: AT, km: 10, attempts: 0 },
};

const snapshotWith = (
    status: Partial<AmbushCharacterSnapshot['status']> = {},
): AmbushCharacterSnapshot => ({
    _id: CHARACTER_ID,
    status: {
        xp: 0,
        level: 1,
        title: TitleType.rookie,
        currentLifePoints: 1000,
        maxLifePoints: 1000,
        injuries: [],
        spells: [SPELL_ID],
        spellStates: [{ spell: SPELL_ID, usages: 2, recoveries: [] }],
        activeTravel: travel,
        ...status,
    },
    quests: { completedQuests: [] },
    assets: {
        ownedItems: [{ itemType: 'LootItem', item: POTION_ID, quantity: 3 }],
        ownedEquipments: [],
        activeSpells: [{ spell: SPELL_ID, usages: 2 }],
    },
});

const effectsWith = (
    overrides: Partial<ParticipantEffects> = {},
): ParticipantEffects => ({
    characterId: CHARACTER_ID.toHexString(),
    hpAfter: 600,
    injuriesAdded: [InjuryType.brokenLeftArm],
    consumablesUsed: [{ itemId: POTION_ID.toHexString(), quantity: 1 }],
    spellsUsed: [{ spellId: SPELL_ID.toHexString(), usages: 1 }],
    ...overrides,
});

const inputWith = (
    overrides: Partial<AmbushPlanInput> = {},
): AmbushPlanInput => ({
    snapshot: snapshotWith(),
    identity,
    resultId: RESULT_ID,
    userId: USER_ID,
    verdict: 'success',
    effects: effectsWith(),
    enemies: { entries: [{ enemy: ENEMY_ID, quantity: 1 }], xp: 5 },
    nearCity,
    nextAmbush: null,
    detour: null,
    spellRecoveryTimes: new Map([[SPELL_ID.toHexString(), RECOVERY_MS]]),
    spellMaxUsages: new Map([[SPELL_ID.toHexString(), 2]]),
    now: NOW,
    ...overrides,
});

describe('ambush outcome plan', () => {
    let plan: AmbushOutcomePlan;
    beforeAll(() => {
        plan = planAmbushOutcome(inputWith());
    });

    it('applies the engine life and wounds with the rank prizes (D-10)', () => {
        const { $set } = plan.update;
        expect($set['status.currentLifePoints']).toBe(600);
        expect($set['status.injuries']).toEqual([InjuryType.brokenLeftArm]);
        expect($set['status.xp']).toBe(45);
        expect(plan.coinsDelta).toBe(150);
        expect($set['assets.ownedItems']).toEqual([
            { itemType: 'LootItem', item: POTION_ID, quantity: 2 },
        ]);
        expect($set['assets.activeSpells']).toEqual([
            { spell: SPELL_ID, usages: 1 },
        ]);
        expect($set['status.spellStates']).toEqual([
            {
                spell: SPELL_ID,
                usages: 1,
                recoveries: [new Date(AT.getTime() + RECOVERY_MS)],
            },
        ]);
    });

    it('keeps the title while the level rises (D-10)', () => {
        const rising = planAmbushOutcome(
            inputWith({
                snapshot: snapshotWith({ xp: LEVEL_TWO_XP - 1 }),
            }),
        );
        expect(rising.update.$set['status.level']).toBe(2);
        expect(Object.keys(rising.update.$set)).not.toContain('status.title');
        expect(rising.report.titleAfter).toBe(rising.report.titleBefore);
        expect(rising.report.levelAfter).toBe(2);
    });

    it('clamps the engine life between one and the new maximum (D-10)', () => {
        const fallen = planAmbushOutcome(
            inputWith({ effects: effectsWith({ hpAfter: 0 }) }),
        );
        expect(fallen.update.$set['status.currentLifePoints']).toBe(1);
        const overflow = planAmbushOutcome(
            inputWith({ effects: effectsWith({ hpAfter: 99_999 }) }),
        );
        expect(overflow.update.$set['status.currentLifePoints']).toBe(1000);
        expect(overflow.report.hpAfter).toBe(1000);
    });

    it('writes the next ambush drawn from the km or none (D-02, D-03)', () => {
        const nextAt = new Date(AT.getTime() + 2 * 3_600_000);
        const redrawn = planAmbushOutcome(
            inputWith({ nextAmbush: { at: nextAt, km: 14 } }),
        );
        expect(redrawn.update.$set['status.activeTravel.ambush']).toEqual({
            at: nextAt,
            km: 14,
            attempts: 0,
        });
        expect(redrawn.travelAfter).toEqual({
            startTime: START,
            endTime: END,
            ambush: { at: nextAt, km: 14 },
        });
        expect(plan.update.$set['status.activeTravel.ambush']).toBeNull();
        expect(plan.travelAfter.ambush).toBeNull();
        const travelKeys = Object.keys(redrawn.update.$set).filter((key) =>
            key.startsWith('status.activeTravel'),
        );
        expect(travelKeys).toEqual(['status.activeTravel.ambush']);
    });

    it('holds the report in the travel with the owner and no reached city (D-13)', () => {
        expect(plan.update.$push).toEqual({
            'status.activeTravel.ambushReports': plan.report,
        });
        expect(plan.report).toEqual({
            resultId: RESULT_ID,
            user: USER_ID,
            outcome: QuestOutcome.success,
            at: AT,
            nearCity,
            reachedCity: null,
            enemies: [{ enemy: ENEMY_ID, quantity: 1 }],
            hpBefore: 1000,
            hpAfter: 600,
            maxLifePoints: 1000,
            injuriesAdded: [InjuryType.brokenLeftArm],
            consumablesUsed: [
                { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            ],
            spellsUsed: [{ spell: SPELL_ID, usages: 1 }],
            coins: fromCopper(150),
            xpGained: 45,
            xpBefore: 0,
            xpAfter: 45,
            levelBefore: 1,
            levelAfter: 1,
            titleBefore: TitleType.rookie,
            titleAfter: TitleType.rookie,
            loreUnlocked: [],
        });
    });

    it('teaches the enemies of a won ambush in the victory update (D-06)', () => {
        const known = new Types.ObjectId('64b0000000000000000000c1');
        const fresh = new Types.ObjectId('64b0000000000000000000c2');
        const won = planAmbushOutcome(
            inputWith({
                snapshot: snapshotWith({ unlockedLore: [known] }),
                victory: { enemyIds: [ENEMY_ID], loreIds: [known, fresh] },
            }),
        );
        expect(won.update.$addToSet).toEqual({
            'status.unlockedLore': { $each: [fresh] },
            'status.knownEnemies': { $each: [ENEMY_ID] },
        });
        expect(won.report.loreUnlocked).toEqual([fresh]);
        expect(Object.keys(won.update).sort()).toEqual([
            '$addToSet',
            '$push',
            '$set',
        ]);
        expect(won.update.$push).toEqual({
            'status.activeTravel.ambushReports': won.report,
        });
        expect(won.update.$set).toEqual(plan.update.$set);
    });

    it('anchors the spell recoveries at the ambush instant (D-20)', () => {
        expect(plan.spellRecoveries).toEqual([
            {
                characterId: CHARACTER_ID.toHexString(),
                spellId: SPELL_ID.toHexString(),
                dueAt: new Date(AT.getTime() + RECOVERY_MS),
            },
        ]);
    });

    it('reaffirms the identity and the experience in the filter (D-05)', () => {
        expect(plan.filter).toEqual({
            ...ambushFilter(identity, NOW),
            'status.xp': 0,
        });
    });
});

describe('ambush defeat plan', () => {
    const reachedCity = { id: CROCEVIA_ID, name: 'Crocevia' };
    const detourRoad = {
        coordinates: [
            [0, 4.4966],
            [0, 4.5],
            [2, 4.5],
        ] as [number, number][],
        distance: 4.434,
    };
    const detourWith = (overrides: Partial<DetourDraft> = {}): DetourDraft => ({
        road: detourRoad,
        to: CROCEVIA_ID,
        reachedCity,
        baseHours: 4.434,
        residualMs: null,
        petSpeed: 10,
        ...overrides,
    });
    const defeatWith = (
        overrides: Partial<AmbushPlanInput> = {},
    ): AmbushPlanInput =>
        inputWith({
            verdict: 'failure',
            effects: effectsWith({ hpAfter: 0 }),
            detour: detourWith(),
            ...overrides,
        });
    const rewrittenOf = (defeat: AmbushOutcomePlan) =>
        defeat.update.$set['status.activeTravel'] as Record<string, unknown>;

    it('teaches nothing on a lost ambush (D-06)', () => {
        const defeat = planAmbushOutcome(
            defeatWith({
                victory: {
                    enemyIds: [ENEMY_ID],
                    loreIds: [new Types.ObjectId('64b0000000000000000000c3')],
                },
            }),
        );
        expect(Object.keys(defeat.update)).toEqual(['$set']);
        expect(defeat.report.loreUnlocked).toEqual([]);
    });

    it('loses with at least one life point and the new wounds, no prize (D-11)', () => {
        const defeat = planAmbushOutcome(
            defeatWith({
                effects: effectsWith({
                    hpAfter: 0,
                    injuriesAdded: [InjuryType.brokenLeftLeg],
                }),
            }),
        );
        const { $set } = defeat.update;
        expect($set['status.currentLifePoints']).toBe(1);
        expect($set['status.injuries']).toContain(InjuryType.brokenLeftLeg);
        expect($set['status.xp']).toBe(0);
        expect(defeat.coinsDelta).toBe(0);
        expect(Object.keys($set).sort()).toEqual([
            'assets.activeSpells',
            'assets.ownedEquipments',
            'assets.ownedItems',
            'status.activeTravel',
            'status.currentLifePoints',
            'status.injuries',
            'status.level',
            'status.maxLifePoints',
            'status.spellStates',
            'status.xp',
        ]);
        expect(defeat.update.$push).toBeUndefined();
        expect(defeat.report.outcome).toBe(QuestOutcome.failure);
        expect(defeat.report.coins).toEqual(fromCopper(0));
        expect(defeat.report.xpGained).toBe(0);
        expect(defeat.report.hpAfter).toBe(1);
    });

    it('rewrites the travel from the ambush point towards the reached city (D-11)', () => {
        const defeat = planAmbushOutcome(defeatWith());
        const duration = durationMsOf(4.434, 10);
        const endTime = new Date(AT.getTime() + duration);
        expect(rewrittenOf(defeat)).toEqual({
            road: detourRoad,
            startTime: AT,
            endTime,
            duration,
            to: CROCEVIA_ID,
            kind: TravelKind.free,
            ambushReports: [defeat.report],
        });
        expect(defeat.travelAfter).toEqual({
            startTime: AT,
            endTime,
            ambush: null,
        });
        expect(defeat.report.reachedCity).toEqual(reachedCity);
    });

    // nessuna ferita reale vale 0,5 (piano 05): la gamba rotta dà movementImpairment 0,8
    it('slows the detour with the new wounds (D-11)', () => {
        const defeat = planAmbushOutcome(
            defeatWith({
                effects: effectsWith({
                    hpAfter: 0,
                    injuriesAdded: [InjuryType.brokenLeftLeg],
                }),
            }),
        );
        expect(rewrittenOf(defeat).duration).toBe(durationMsOf(4.434, 8));
    });

    it('allows a zero length detour onto the nearest city (D-11)', () => {
        const defeat = planAmbushOutcome(
            defeatWith({
                detour: detourWith({
                    road: { coordinates: [[0, 0.4497]], distance: 0 },
                    baseHours: 0,
                }),
            }),
        );
        expect(rewrittenOf(defeat).duration).toBe(0);
        expect(rewrittenOf(defeat).endTime).toEqual(AT);
        expect(defeat.travelAfter.endTime).toEqual(AT);
    });

    it('uses the residual duration when the detour keeps the destination road (D-11)', () => {
        const defeat = planAmbushOutcome(
            defeatWith({
                detour: detourWith({
                    to: TO_ID,
                    baseHours: null,
                    residualMs: 36_000_000,
                }),
            }),
        );
        expect(rewrittenOf(defeat).duration).toBe(36_000_000);
        expect(rewrittenOf(defeat).endTime).toEqual(END);
        expect(rewrittenOf(defeat).to).toEqual(TO_ID);
    });

    it('carries the held reports into the rewritten travel (D-13)', () => {
        const held = planAmbushOutcome(inputWith()).report;
        const defeat = planAmbushOutcome(
            defeatWith({
                snapshot: snapshotWith({
                    activeTravel: { ...travel, ambushReports: [held] },
                }),
            }),
        );
        const reports = rewrittenOf(defeat).ambushReports as unknown[];
        expect(reports).toEqual([held, defeat.report]);
        expect(defeat.report.reachedCity).toEqual(reachedCity);
    });

    it('clears the standard lane and draws no ambush on the detour (D-03, D-11)', () => {
        const nextAt = new Date(AT.getTime() + 2 * 3_600_000);
        const defeat = planAmbushOutcome(
            defeatWith({
                snapshot: {
                    ...snapshotWith(),
                    quests: { completedQuests: [], pendingQuest: PENDING_ID },
                },
                nextAmbush: { at: nextAt, km: 14 },
            }),
        );
        expect(defeat.update.$set['quests.pendingQuest']).toBeNull();
        expect(Object.keys(rewrittenOf(defeat)).sort()).toEqual([
            'ambushReports',
            'duration',
            'endTime',
            'kind',
            'road',
            'startTime',
            'to',
        ]);
        expect(defeat.travelAfter.ambush).toBeNull();
    });
});
