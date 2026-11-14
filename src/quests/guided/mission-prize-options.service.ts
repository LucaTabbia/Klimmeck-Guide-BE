import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { objectIdFromHex, refIdOf } from 'src/mongo/document-id';
import { GmRequest, GmRequestReader } from '../outcomes/gm-request.reader';
import type { ResolutionCharacter } from '../outcomes/resolution-loader.service';
import type { PrizesSnapshot } from '../outcomes/rewards/quest-rewards';
import { prizeBlockFor } from '../prizes/rank-prizes';
import {
    dropOrphanCatalogRefs,
    QUEST_CATALOG_POPULATE,
} from '../quest-catalog.populate';
import {
    MissionPrizeAllowance,
    MissionPrizeCatalogue,
    missionPrizeOptionsOf,
    PrizeCatalogueEntry,
} from './mission-prizes';
import { MissionPrizeOptionsView } from './mission-draft.wire';

// QuestPrizes.randomLoot è non nullo sul filo: una quest senza premi risponde un blocco vuoto
const EMPTY_BLOCK: PrizesSnapshot = {
    prizeCoins: null,
    xpPrize: null,
    prizeItem: null,
    randomLoot: [],
    spell: null,
    pet: null,
    cure: null,
};

interface RarityProjection {
    _id: Types.ObjectId;
    rarity?: unknown;
}

interface SpellProjection {
    _id: Types.ObjectId;
    minXpToLearn?: unknown;
}

const rarityEntryOf = ({
    _id,
    rarity,
}: RarityProjection): PrizeCatalogueEntry => ({
    id: _id.toHexString(),
    rarity: typeof rarity === 'string' ? rarity : null,
});

const objectIdsOf = (hexes: readonly string[]): Types.ObjectId[] =>
    hexes.map((hex) => new Types.ObjectId(hex));

function knownSpellIdsOf(character: ResolutionCharacter): string[] {
    return (character.status.spellStates ?? [])
        .map(({ spell }) => refIdOf(spell)?.toHexString())
        .filter((hex): hex is string => hex !== undefined);
}

// catalogo dei premi per titolo (D-07, D-22): la stessa allowanceFor serve la query e la rivalidazione di salvataggio e completamento
@Injectable()
export class MissionPrizeOptionsService {
    constructor(
        private readonly requests: GmRequestReader,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(EquipmentItem.name)
        private readonly equipmentModel: Model<EquipmentItemDocument>,
        @InjectModel(LootItem.name)
        private readonly lootModel: Model<LootItemDocument>,
        @InjectModel(Pet.name) private readonly petModel: Model<PetDocument>,
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
    ) {}

    async optionsFor(
        pendingQuestHex: string,
        characterHex: string,
    ): Promise<MissionPrizeOptionsView> {
        const request = await this.requests.read(pendingQuestHex);
        const character = this.participantOf(request, characterHex);
        const allowance = this.allowanceFor(
            request,
            character,
            await this.readCatalogue(),
        );
        const [block, equipment, loot, pets, spells] = await Promise.all([
            this.wireBlockOf(request, character),
            this.equipmentModel
                .find({ _id: { $in: objectIdsOf(allowance.equipmentIds) } })
                .sort({ _id: 1 })
                .populate('addedSpell')
                .exec(),
            this.lootModel
                .find({ _id: { $in: objectIdsOf(allowance.lootIds) } })
                .sort({ _id: 1 })
                .exec(),
            this.petModel
                .find({ _id: { $in: objectIdsOf(allowance.petIds) } })
                .sort({ _id: 1 })
                .exec(),
            this.spellModel
                .find({ _id: { $in: objectIdsOf(allowance.spellIds) } })
                .sort({ _id: 1 })
                .exec(),
        ]);
        return {
            block,
            character: character._id.toHexString(),
            equipment,
            loot,
            maxRarity: allowance.maxRarity,
            pets,
            spells,
            title: character.status.title,
        };
    }

    // ~400 voci nel caso peggiore (RESEARCH §Q6): una lettura per chiamata con le sole proiezioni della regola
    async readCatalogue(): Promise<MissionPrizeCatalogue> {
        const byRarity = { rarity: 1 } as const;
        const [equipment, loot, pets, spells] = await Promise.all([
            this.equipmentModel
                .find({}, byRarity)
                .lean<RarityProjection[]>()
                .exec(),
            this.lootModel.find({}, byRarity).lean<RarityProjection[]>().exec(),
            this.petModel.find({}, byRarity).lean<RarityProjection[]>().exec(),
            this.spellModel
                .find({}, { minXpToLearn: 1 })
                .lean<SpellProjection[]>()
                .exec(),
        ]);
        return {
            equipment: equipment.map(rarityEntryOf),
            loot: loot.map(rarityEntryOf),
            pets: pets.map(rarityEntryOf),
            spells: spells.map(({ _id, minXpToLearn }) => ({
                id: _id.toHexString(),
                minXpToLearn,
            })),
        };
    }

    allowanceFor(
        request: GmRequest,
        character: ResolutionCharacter,
        catalogue: MissionPrizeCatalogue,
    ): MissionPrizeAllowance {
        const title = character.status.title;
        return missionPrizeOptionsOf({
            block: prizeBlockFor(request.quest, title),
            questType: request.quest.infos.type,
            title,
            xp: character.status.xp ?? 0,
            knownSpellIds: knownSpellIdsOf(character),
            catalogue,
        });
    }

    private participantOf(
        request: GmRequest,
        characterHex: string,
    ): ResolutionCharacter {
        const characterId = objectIdFromHex(characterHex);
        const seat =
            characterId &&
            request.seats.find(({ character }) =>
                character._id.equals(characterId),
            );
        if (!seat) throw GameRuleException.outcomeNotParticipant();
        return seat.character;
    }

    // blocco sul filo coi ref popolati e sanificati, come Quest.rankPrizes
    private async wireBlockOf(
        request: GmRequest,
        character: ResolutionCharacter,
    ): Promise<PrizesSnapshot> {
        const quest = await this.questModel
            .findById(request.quest._id)
            .populate(QUEST_CATALOG_POPULATE)
            .exec();
        if (!quest) return EMPTY_BLOCK;
        dropOrphanCatalogRefs(quest);
        return prizeBlockFor(quest, character.status.title) ?? EMPTY_BLOCK;
    }
}
