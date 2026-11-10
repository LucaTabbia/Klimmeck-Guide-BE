import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { Lore, LoreDocument } from 'src/models/lore.model';
import { readEnemyCandidates } from 'src/quests/generation/enemy-candidate';
import { ChanceSource } from '../chance-source';
import { rollsArrest } from '../crime/crime-arrest';
import {
    composeGuardEncounter,
    rollsGuardEncounter,
} from '../guard/guard-encounter';
import { statusFactsOf } from '../progression/status-facts';
import {
    type ResolutionCharacter,
    ResolutionLoader,
    type ResolutionQuest,
} from '../resolution-loader.service';
import type { ConclusionEvent } from './conclusion-event';

const ARREST: ConclusionEvent = { kind: 'arrest' };

// fuori dalla transazione (Pitfall 10 delle imboscate): tiri, pool e catalogo dello scontro; il callback scrive soltanto
@Injectable()
export class ConclusionEventDrawer {
    constructor(
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(Lore.name)
        private readonly loreModel: Model<LoreDocument>,
        private readonly loader: ResolutionLoader,
        private readonly chance: ChanceSource,
    ) {}

    // un solo tiro per crime e guard, nessuno per gli altri tipi: le sequenze delle altre quest non si spostano
    async drawFor(
        quest: ResolutionQuest,
        character: ResolutionCharacter,
    ): Promise<ConclusionEvent | null> {
        switch (quest.infos.type) {
            case QuestType.crime:
                return rollsArrest(this.chance) ? ARREST : null;
            case QuestType.guard:
                return this.guardEncounterFor(quest, character);
            default:
                return null;
        }
    }

    // fascia vuota anche per un branco di 2–3 o catalogo vuoto = nessuno scontro
    private async guardEncounterFor(
        quest: ResolutionQuest,
        character: ResolutionCharacter,
    ): Promise<ConclusionEvent | null> {
        if (!rollsGuardEncounter(this.chance)) return null;
        const composed = composeGuardEncounter({
            level: statusFactsOf(character).level,
            enemies: await readEnemyCandidates(this.enemyModel, this.loreModel),
            chance: this.chance,
        });
        if (!composed) return null;
        const catalog = await this.loader.readCombatCatalog(
            composed.map(({ enemy, quantity }) => ({
                enemy: new Types.ObjectId(enemy.id),
                quantity,
            })),
            [character],
            `dello scontro di guardia ${quest._id.toHexString()}`,
        );
        return catalog.enemies.length > 0
            ? { kind: 'guardEncounter', catalog }
            : null;
    }
}
