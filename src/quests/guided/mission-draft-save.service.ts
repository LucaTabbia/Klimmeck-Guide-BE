// D-18: sezioni presenti sostituiscono; D-24 e D-14 sullo stato all'inizio di ogni scontro
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import {
    PointOfInterest,
    PointOfInterestDocument,
} from 'src/models/point-of-interest.model';
import type { ParticipantOverrideInput } from 'src/models/request/complete-pending-request.model';
import { objectIdFromHex } from 'src/mongo/document-id';
import { cureOf } from 'src/quests/outcomes/injuries/quest-cure';
import {
    overrideParticipantOf,
    validateOverrides,
} from 'src/quests/outcomes/gm-overrides';
import {
    type GmRequest,
    GmRequestReader,
} from 'src/quests/outcomes/gm-request.reader';
import type { ResolutionCharacter } from 'src/quests/outcomes/resolution-loader.service';
import { isNonNegativeInteger } from 'src/quests/outcomes/rewards/quest-rewards';
import { prizeBlockFor } from 'src/quests/prizes/rank-prizes';
import {
    previousEffectsOf,
    reconcileFights,
    resetFrom,
} from './draft-invalidation';
import {
    assertAddsOnlyNewInjuries,
    effectsRecordOf,
    participantEffectsOf,
    stateBeforeFight,
} from './fight-state';
import { MAX_PRIZE_ITEM_QUANTITY } from './mission-draft-prefill';
import {
    MAX_MISSION_FIGHTS,
    MAX_PRIZE_ITEMS,
    type MissionFightInput,
    type MissionPrizeInput,
    type MissionPrizeItemInput,
    type SaveMissionDraftInput,
} from './mission-draft.inputs';
import type {
    MissionDraftRecord,
    MissionFightEffectsRecord,
    MissionFightEnemyRecord,
    MissionFightRecord,
    MissionPrizeCoinsRecord,
    MissionPrizeCureRecord,
    MissionPrizeItemRecord,
    MissionPrizeRecord,
} from './mission-draft.model';
import {
    type MissionDraftSections,
    MissionDraftService,
} from './mission-draft.service';
import { MissionPrizeOptionsService } from './mission-prize-options.service';
import {
    assertPrizeAllowed,
    type MissionPrizeAllowance,
} from './mission-prizes';
import { enemiesWithinCaps } from './mission-simulation.service';

const hexOf = (id: Types.ObjectId): string => id.toHexString();

// difesa in profondità dei tetti dell'input (D-31)
function assertFightsWithinCaps(fights: readonly MissionFightInput[]): void {
    const withinCaps =
        fights.length <= MAX_MISSION_FIGHTS &&
        fights.every(({ enemies }) => enemiesWithinCaps(enemies));
    if (!withinCaps) throw GameRuleException.outcomeOverrideInvalid();
}

function enemyRecordsOf(
    fights: readonly MissionFightInput[],
): MissionFightEnemyRecord[][] {
    return fights.map(({ enemies }) =>
        enemies.map(({ enemy, quantity }) => {
            const id = objectIdFromHex(enemy);
            if (!id) throw ResourceNotFoundException.enemy();
            return { enemy: id, quantity };
        }),
    );
}

const effectsKeyOf = (record: MissionFightEffectsRecord | null): string =>
    JSON.stringify(record && participantEffectsOf('', record));

const sameCorrections = (
    fight: MissionFightRecord,
    corrected: readonly (MissionFightEffectsRecord | null)[],
): boolean =>
    fight.outcomes.every(
        (outcome, index) =>
            effectsKeyOf(outcome.corrected) === effectsKeyOf(corrected[index]),
    );

const invalid = () => GameRuleException.outcomeOverrideInvalid();

const amountOf = (value: unknown): number => {
    if (!isNonNegativeInteger(value)) throw invalid();
    return value;
};

const coinsOf = (
    coins: MissionPrizeInput['coins'],
): MissionPrizeCoinsRecord => ({
    gold: amountOf(coins?.gold),
    silver: amountOf(coins?.silver),
    copper: amountOf(coins?.copper),
});

function optionalRefOf(hex: string | null | undefined): Types.ObjectId | null {
    if (hex == null) return null;
    const id = objectIdFromHex(hex);
    if (!id) throw invalid();
    return id;
}

function itemTypeOf(
    hex: string,
    allowance: MissionPrizeAllowance,
): MissionPrizeItemRecord['itemType'] {
    if (allowance.equipmentIds.includes(hex)) return 'EquipmentItem';
    if (allowance.lootIds.includes(hex)) return 'LootItem';
    throw invalid();
}

const isPrizeQuantity = (quantity: unknown): boolean =>
    isNonNegativeInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_PRIZE_ITEM_QUANTITY;

// una voce per oggetto, quantità 1..99, voci ≤ 500 (D-31): difesa in profondità della validazione dell'input
function prizeItemsOf(
    items: readonly MissionPrizeItemInput[],
    allowance: MissionPrizeAllowance,
): MissionPrizeItemRecord[] {
    if (items.length > MAX_PRIZE_ITEMS) throw invalid();
    const seen = new Set<string>();
    return items.map(({ item, quantity }) => {
        const id = objectIdFromHex(item);
        if (!id || !isPrizeQuantity(quantity) || seen.has(hexOf(id)))
            throw invalid();
        seen.add(hexOf(id));
        return {
            itemType: itemTypeOf(hexOf(id), allowance),
            item: id,
            quantity,
        };
    });
}

// cura solo quella del blocco del titolo (D-31)
function cureFor(
    request: GmRequest,
    character: ResolutionCharacter,
): MissionPrizeCureRecord {
    const cure = cureOf(
        prizeBlockFor(request.quest, character.status.title)?.cure,
    );
    if (!cure) throw invalid();
    return cure;
}

function prizeRecordOf(
    prize: MissionPrizeInput,
    character: ResolutionCharacter,
    allowance: MissionPrizeAllowance,
    request: GmRequest,
): MissionPrizeRecord {
    const items = prizeItemsOf(prize.items ?? [], allowance);
    const pet = optionalRefOf(prize.pet);
    const spell = optionalRefOf(prize.spell);
    assertPrizeAllowed(
        {
            items: items.map(({ itemType, item }) => ({
                itemType,
                item: hexOf(item),
            })),
            pet: pet && hexOf(pet),
            spell: spell && hexOf(spell),
        },
        allowance,
    );
    return {
        character: character._id,
        coins: coinsOf(prize.coins),
        xp: amountOf(prize.xp),
        items,
        pet,
        spell,
        cure: prize.cure ? cureFor(request, character) : null,
    };
}

function participantIn(
    characters: readonly ResolutionCharacter[],
    characterHex: string,
): ResolutionCharacter {
    const id = objectIdFromHex(characterHex);
    const character = id && characters.find(({ _id }) => _id.equals(id));
    if (!character) throw GameRuleException.outcomeNotParticipant();
    return character;
}

// ogni voce sostituisce il premio di quel personaggio, gli altri restano (D-18)
function mergedPrizes(
    saved: readonly MissionPrizeRecord[],
    chosen: ReadonlyMap<string, MissionPrizeRecord>,
): MissionPrizeRecord[] {
    const savedKeys = new Set(saved.map(({ character }) => hexOf(character)));
    return [
        ...saved.map((prize) => chosen.get(hexOf(prize.character)) ?? prize),
        ...[...chosen]
            .filter(([key]) => !savedKeys.has(key))
            .map(([, prize]) => prize),
    ];
}

@Injectable()
export class MissionDraftSaveService {
    constructor(
        private readonly requests: GmRequestReader,
        private readonly drafts: MissionDraftService,
        @InjectModel(PointOfInterest.name)
        private readonly poiModel: Model<PointOfInterestDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        private readonly prizeOptions: MissionPrizeOptionsService,
    ) {}

    async save(input: SaveMissionDraftInput): Promise<MissionDraftRecord> {
        const request = await this.requests.read(input.pendingQuestId);
        const draft = await this.drafts.requireFor(request);
        const set: MissionDraftSections = {};
        if (input.step != null) set.step = input.step;
        if (input.place != null) set.place = await this.placeOf(input.place);
        if (input.fights != null)
            set.fights = await this.fightsOf(request, draft, input.fights);
        if (input.prizes != null)
            set.prizes = await this.prizesOf(request, draft, input.prizes);
        return this.drafts.write(draft._id, set);
    }

    private async placeOf(placeHex: string): Promise<Types.ObjectId> {
        const place = objectIdFromHex(placeHex);
        if (!place || !(await this.poiModel.exists({ _id: place }).exec()))
            throw ResourceNotFoundException.pointOfInterest();
        return place;
    }

    private async fightsOf(
        request: GmRequest,
        draft: MissionDraftRecord,
        incoming: readonly MissionFightInput[],
    ): Promise<MissionFightRecord[]> {
        assertFightsWithinCaps(incoming);
        const enemies = enemyRecordsOf(incoming);
        await this.assertEnemiesExist(enemies);
        let fights = reconcileFights(draft.fights, enemies);
        const characters = this.draftCharactersOf(request, draft);
        incoming.forEach(({ corrections }, index) => {
            if (corrections == null) return;
            fights = this.corrected(fights, index, corrections, characters);
        });
        return fights;
    }

    // D-07, D-15: premi rivalidati con la regola delle opzioni; il blocco precompilato si salva sempre (D-22)
    private async prizesOf(
        request: GmRequest,
        draft: MissionDraftRecord,
        incoming: readonly MissionPrizeInput[],
    ): Promise<MissionPrizeRecord[]> {
        const catalogue = await this.prizeOptions.readCatalogue();
        const characters = this.draftCharactersOf(request, draft);
        const chosen = new Map<string, MissionPrizeRecord>();
        for (const prize of incoming) {
            const character = participantIn(characters, prize.characterId);
            const key = hexOf(character._id);
            if (chosen.has(key)) throw invalid();
            const allowance = this.prizeOptions.allowanceFor(
                request,
                character,
                catalogue,
            );
            chosen.set(
                key,
                prizeRecordOf(prize, character, allowance, request),
            );
        }
        return mergedPrizes(draft.prizes, chosen);
    }

    private async assertEnemiesExist(
        fights: readonly MissionFightEnemyRecord[][],
    ): Promise<void> {
        const ids = [
            ...new Set(fights.flat().map(({ enemy }) => hexOf(enemy))),
        ].map((hex) => new Types.ObjectId(hex));
        if (ids.length === 0) return;
        const found = await this.enemyModel
            .countDocuments({ _id: { $in: ids } })
            .exec();
        if (found !== ids.length) throw ResourceNotFoundException.enemy();
    }

    private draftCharactersOf(
        request: GmRequest,
        draft: MissionDraftRecord,
    ): ResolutionCharacter[] {
        const inDraft = new Set(
            draft.participants.map(({ character }) => hexOf(character)),
        );
        return request.seats
            .map(({ character }) => character)
            .filter((character) => inDraft.has(hexOf(character._id)));
    }

    // effetto completo sullo stato all'inizio dello scontro; i non elencati tornano al simulato (D-06)
    private corrected(
        fights: MissionFightRecord[],
        index: number,
        corrections: readonly ParticipantOverrideInput[],
        characters: readonly ResolutionCharacter[],
    ): MissionFightRecord[] {
        const fight = fights[index];
        if (fight.verdict == null)
            throw GameRuleException.outcomeOverrideInvalid();
        const overlays = characters.map((character) =>
            stateBeforeFight(
                character,
                previousEffectsOf(fights, index, hexOf(character._id)),
            ),
        );
        const effects = validateOverrides(
            corrections,
            overlays.map(overrideParticipantOf),
        );
        const corrected = fight.outcomes.map((outcome) => {
            const entry = effects.get(hexOf(outcome.character)) ?? null;
            if (!entry) return null;
            assertAddsOnlyNewInjuries(
                outcome.injuriesBefore,
                entry.injuriesAdded,
            );
            return effectsRecordOf(entry);
        });
        if (sameCorrections(fight, corrected)) return fights;
        const updated = [...fights];
        updated[index] = {
            ...fight,
            outcomes: fight.outcomes.map((outcome, position) => ({
                ...outcome,
                corrected: corrected[position],
            })),
        };
        return resetFrom(updated, index + 1);
    }
}
