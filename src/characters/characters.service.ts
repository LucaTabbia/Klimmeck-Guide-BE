import {
    Injectable,
    OnModuleInit,
    OnModuleDestroy,
    Logger,
    Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Model, Types } from 'mongoose';
import type { PubSub } from '@graphql-yoga/subscription';
import { Clock } from 'src/auth/clock';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Equipment } from 'src/models/common/equipment.model';
import { CommonResponse } from 'src/models/common/common-response.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { EquipItemRequest } from 'src/models/request/equip-item-request.model';
import { SlotType } from 'src/models/enums/slot_type.enum';
import { EquipSpellRequest } from 'src/models/request/equip-spell-request.model';
import { UseSpellRequest } from 'src/models/request/use-spell-request.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { CHARACTER_QUESTS_POPULATE } from './character-quests.populate';
import { PUB_SUB, PubSubEvents } from 'src/pubsub.module';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { objectIdFromHex } from 'src/mongo/document-id';
import { enqueueTrigger } from 'src/queues/enqueue-trigger';
import { QUEUE_CALL_TIMEOUT } from 'src/queues/queue-call-timeout';
import { CHARACTER_CHANGES_PIPELINE } from './character-changes.pipeline';
import { requireCharacterObjectId } from './character-id';
import {
    classifyEquipItemFailure,
    equipItemFilter,
    equipItemUpdate,
} from './equipment/equip-item.updates';
import {
    ACTIVE_SPELL_SNAPSHOT_PROJECTION,
    ActiveSpellSnapshot,
    classifyEquipSpellFailure,
    classifyUnequipSpellFailure,
    classifyUseSpellFailure,
    equipSpellFilter,
    equipSpellUpdate,
    unequipSpellFilter,
    unequipSpellUpdate,
} from './spells/active-spell.updates';
import {
    SPELL_RECOVERY_TRIGGER_FALLBACK,
    SPELL_RECOVERY_TRIGGER_SUBJECT,
    SpellRecoveryJobData,
    spellRecoveryTrigger,
} from './spells/spell-recovery-job';
import { SPELL_RECOVERY_QUEUE } from './spells/spell-recovery-queue';
import { recoveryDueAt } from './spells/spell-state.snapshot';
import { spellsOnTheWire } from './spells/spell-state.mapper';
import {
    spellStateArrayFilters,
    spendUsagesUpdate,
    useSpellFilter,
} from './spells/spell-state.updates';

const SPELL_FAILURE_CLASSIFICATION_READS = 2;

interface SpellRecoveryRule {
    maxUsages: number;
    recoveryTime: number;
}

@Injectable()
export class CharactersService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CharactersService.name);
    private changeStream: ReturnType<typeof Model.prototype.watch>;

    constructor(
        @InjectModel(Character.name)
        private characterModel: Model<CharacterDocument>,
        @InjectModel(Spell.name) private spellModel: Model<SpellDocument>,
        @InjectQueue(SPELL_RECOVERY_QUEUE)
        private spellRecoveryQueue: Queue<SpellRecoveryJobData>,
        @Inject(PUB_SUB) private readonly pubSub: PubSub<PubSubEvents>,
        private readonly clock: Clock,
        @Inject(QUEUE_CALL_TIMEOUT) private readonly timeoutMs: number,
    ) {}

    async onModuleInit() {
        this.changeStream = this.characterModel.watch(
            CHARACTER_CHANGES_PIPELINE,
            { fullDocument: 'updateLookup' },
        );

        this.changeStream.on('change', async (change) => {
            try {
                if (change.fullDocument) {
                    const id = change.fullDocument._id;

                    const character = await this.findOne(id);
                    this.pubSub.publish('characterUpdated', {
                        characterUpdated: character,
                    });
                }
            } catch (err) {
                // corsa: archiviato tra l'evento e la rilettura → nessun evento, non è un errore
                if (err instanceof ResourceNotFoundException) return;
                this.logger.error('Errore nel change stream', err);
            }
        });

        this.changeStream.on('error', (err) => {
            this.logger.error('Errore nel change stream MongoDB', err);
        });
    }

    async onModuleDestroy() {
        if (this.changeStream) {
            await this.changeStream.close();
            this.logger.log('Change stream chiuso correttamente');
        }
    }

    // letture di gioco solo sugli attivi (03.1 D-06): un archiviato risponde NOT_FOUND come un id inesistente
    async findAll(): Promise<Character[]> {
        return this.characterModel
            .find(ACTIVE_CHARACTER_FILTER)
            .populate(CHARACTER_QUESTS_POPULATE)
            .exec();
    }

    async findOne(id: string): Promise<Character> {
        const character = await this.characterModel
            .findOne(activeCharacterById(id))
            .populate({
                path: 'assets.ownedEquipments.item',
                model: 'EquipmentItem',
                populate: { path: 'addedSpell' },
            })
            .populate({
                path: 'status.spells',
                model: 'Spell',
            })
            .populate({ path: 'status.spellStates.spell', model: 'Spell' })
            .populate({
                path: 'status.location',
            })
            .populate({
                path: 'assets.ownedItems.item',
                model: 'LootItem',
            })
            .populate(CHARACTER_QUESTS_POPULATE)
            .exec();

        if (!character) {
            throw ResourceNotFoundException.character();
        }

        const ownedEquipmentsMap = new Map<string, EquipmentItem>();

        character.assets.ownedEquipments.forEach((assetQuantity) => {
            const item = assetQuantity.item as EquipmentItem;
            if (item && item.id) {
                ownedEquipmentsMap.set(item.id.toString(), item);
            }
        });

        const wearedEquipment = character.assets.wearedEquipment;

        Object.values(SlotType).forEach((slot) => {
            const itemId = wearedEquipment[slot];

            if (itemId instanceof Types.ObjectId) {
                const populatedItem = ownedEquipmentsMap.get(
                    itemId.toHexString(),
                );
                if (populatedItem) {
                    wearedEquipment[slot] = populatedItem;
                } else {
                    wearedEquipment[slot] = null;
                }
            }
        });

        // usi dallo stato, ordine degli slot, orfani fuori dal filo (D-04a, D-05)
        const wire = spellsOnTheWire(
            character.status,
            character.assets.activeSpells,
        );
        character.status.spellStates = wire.spellStates;
        character.assets.activeSpells = wire.activeSpells;

        return character;
    }

    async getEquipment(id: string): Promise<Equipment> {
        let query = this.characterModel.findOne(activeCharacterById(id));
        for (const slot of Object.values(SlotType)) {
            query = query.populate(`assets.wearedEquipment.${slot}`);
        }
        const character = await query.exec();

        if (!character) {
            throw ResourceNotFoundException.character();
        }
        return character.assets.wearedEquipment;
    }

    async equipItem(request: EquipItemRequest): Promise<CommonResponse> {
        const characterId = requireCharacterObjectId(request.id);
        const itemId =
            request.itemId == null ? null : objectIdFromHex(request.itemId);
        if (request.itemId != null && !itemId)
            throw GameRuleException.itemNotOwned();

        const equipped = await this.characterModel
            .updateOne(
                equipItemFilter(characterId, itemId),
                equipItemUpdate(request.slotType, itemId),
            )
            .exec();
        if (equipped.matchedCount === 0) {
            const characterExists =
                (await this.characterModel
                    .exists(activeCharacterById(characterId))
                    .exec()) !== null;
            throw classifyEquipItemFailure(characterExists);
        }
        return {
            response: 'Equipaggiamento cambiato con successo',
            successful: true,
        };
    }

    async equipSpell(request: EquipSpellRequest): Promise<CommonResponse> {
        const characterId = requireCharacterObjectId(request.id);
        const spellId = objectIdFromHex(request.spellId);
        if (!spellId) throw GameRuleException.spellNotKnown();

        // usi copiati dalla voce di stato (D-01, D-07): il valore del client è ignorato; maxUsages del catalogo solo come fallback della pipeline
        const spell = await this.spellModel
            .findById(spellId, { maxUsages: 1 })
            .lean<{ maxUsages: number } | null>()
            .exec();
        if (!spell) throw ResourceNotFoundException.spell();

        const equipped = await this.characterModel
            .updateOne(
                equipSpellFilter(characterId, spellId),
                equipSpellUpdate(spellId, spell.maxUsages),
            )
            .exec();
        if (equipped.matchedCount === 0) {
            throw await this.classifySpellFailure(
                characterId,
                (snapshot) => classifyEquipSpellFailure(snapshot, spellId),
                () => GameRuleException.maxActiveSpellsReached(),
            );
        }
        return {
            response: 'Magia equipaggiata con successo',
            successful: true,
        };
    }

    async unequipSpell(request: EquipSpellRequest): Promise<CommonResponse> {
        const characterId = requireCharacterObjectId(request.id);
        const spellId = objectIdFromHex(request.spellId);
        if (!spellId) throw GameRuleException.spellNotActive();

        const unequipped = await this.characterModel
            .updateOne(
                unequipSpellFilter(characterId, spellId),
                unequipSpellUpdate(spellId),
            )
            .exec();
        if (unequipped.matchedCount === 0) {
            throw classifyUnequipSpellFailure(
                await this.readActiveSpellSnapshot(characterId),
            );
        }
        return {
            response: 'Magia disequipaggiata con successo',
            successful: true,
        };
    }

    // una seconda rilettura fresca se la prima non mostra guard violate; se lo stato cambia ancora vale il codice di fallback (04 D-10)
    private async classifySpellFailure(
        characterId: Types.ObjectId,
        classify: (snapshot: ActiveSpellSnapshot | null) => Error | undefined,
        fallback: () => Error,
    ): Promise<Error> {
        for (let read = 0; read < SPELL_FAILURE_CLASSIFICATION_READS; read++) {
            const failure = classify(
                await this.readActiveSpellSnapshot(characterId),
            );
            if (failure) return failure;
        }
        return fallback();
    }

    // rilettura leggera solo per scegliere il codice d'errore (04 D-10)
    private readActiveSpellSnapshot(
        characterId: Types.ObjectId,
    ): Promise<ActiveSpellSnapshot | null> {
        return this.characterModel
            .findOne(
                activeCharacterById(characterId),
                ACTIVE_SPELL_SNAPSHOT_PROJECTION,
            )
            .lean<ActiveSpellSnapshot | null>()
            .exec();
    }

    async useSpell(request: UseSpellRequest): Promise<CommonResponse> {
        const characterId = requireCharacterObjectId(request.characterId);
        const spellId = objectIdFromHex(request.spellId);
        if (!spellId) throw GameRuleException.spellNotActive();

        // la spell si valida prima di toccare gli usi (Phase 1 D-06)
        const spell = await this.spellModel
            .findById(spellId, { maxUsages: 1, recoveryTime: 1 })
            .lean<SpellRecoveryRule | null>()
            .exec();
        // recoveryTime non è required nello schema Spell: una voce di catalogo malformata vale come magia assente (codice esistente, nessun codice nuovo sul filo)
        if (!spell || !Number.isFinite(spell.recoveryTime))
            throw ResourceNotFoundException.spell();

        // un solo update: usi della voce di stato e del mirror, istante in ordine crescente (D-04a, D-06)
        const dueAt = recoveryDueAt(this.clock.now(), spell.recoveryTime);
        const used = await this.characterModel
            .updateOne(
                useSpellFilter(characterId, spellId),
                spendUsagesUpdate([dueAt]),
                spellStateArrayFilters(spellId),
            )
            .exec();
        if (used.matchedCount === 0) {
            throw await this.classifySpellFailure(
                characterId,
                (snapshot) => classifyUseSpellFailure(snapshot, spellId),
                () => GameRuleException.spellNoUsagesLeft(),
            );
        }

        // il job è solo un trigger (D-06): best-effort, nessuna compensazione; se Redis lo perde l'uso lo restituisce lo sweep
        await enqueueTrigger(
            this.spellRecoveryQueue,
            spellRecoveryTrigger(characterId, spellId, dueAt),
            {
                clock: this.clock,
                timeoutMs: this.timeoutMs,
                logger: this.logger,
                subject: SPELL_RECOVERY_TRIGGER_SUBJECT,
                fallback: SPELL_RECOVERY_TRIGGER_FALLBACK,
            },
        );
        this.logger.log(
            `Spell ${spellId.toHexString()} used by character ${characterId.toHexString()}: usage back at ${dueAt.toISOString()}`,
        );
        return {
            response: 'Magia utilizzata con successo',
            successful: true,
        };
    }
}
