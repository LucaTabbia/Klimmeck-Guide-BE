import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Collection, Connection, Types } from 'mongoose';
import { LoreGeographyReader } from 'src/lore/lore-geography.reader';
import { knowledgeAdditionOf } from 'src/lore/knowledge-addition';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import { Character } from 'src/models/character/character.model';
import { Enemy } from 'src/models/enemy.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import {
    BackfillCharacterStatus,
    BackfillResult,
    loreBackfillOf,
    LoreBackfillPlan,
    WON_RESULT_OUTCOMES,
    wonEnemyIdsOf,
} from './lore-backfill';

export interface LoreBackfillReport {
    characters: number;
    updated: number;
    loreAdded: number;
    enemiesAdded: number;
    withoutCity: number;
}

interface BackfillCharacter {
    _id: Types.ObjectId;
    status?: BackfillCharacterStatus | null;
}

interface BackfillEnemy {
    _id: Types.ObjectId;
    relatedLore?: unknown[] | null;
}

// driver nativo: i ref legacy stringa restano leggibili con idForms (Pitfall 8) e nessun hook di Mongoose riscrive il personaggio
@Injectable()
export class LoreBackfillMigrator {
    constructor(
        @InjectConnection() private readonly connection: Connection,
        private readonly geography: LoreGeographyReader,
    ) {}

    async backfillAll(): Promise<LoreBackfillReport> {
        const report: LoreBackfillReport = {
            characters: 0,
            updated: 0,
            loreAdded: 0,
            enemiesAdded: 0,
            withoutCity: 0,
        };
        const characters = this.collectionOf(Character.name)
            .find<BackfillCharacter>(ACTIVE_CHARACTER_FILTER, {
                projection: {
                    'status.location': 1,
                    'status.unlockedLore': 1,
                    'status.knownEnemies': 1,
                },
            })
            .sort({ _id: 1 });
        for await (const character of characters) {
            report.characters += 1;
            const geography = await this.geography.ofMarker(
                refIdOf(character.status?.location),
            );
            if (geography.length === 0) report.withoutCity += 1;
            const plan = await this.planOf(character, geography);
            if (plan.loreIds.length === 0 && plan.enemyIds.length === 0)
                continue;
            await this.collectionOf(Character.name).updateOne(
                { _id: character._id },
                knowledgeAdditionOf(plan.loreIds, plan.enemyIds),
            );
            report.updated += 1;
            report.loreAdded += plan.loreIds.length;
            report.enemiesAdded += plan.enemyIds.length;
        }
        return report;
    }

    private async planOf(
        character: BackfillCharacter,
        geography: Types.ObjectId[],
    ): Promise<LoreBackfillPlan> {
        const results = await this.collectionOf(QuestResult.name)
            .find<BackfillResult>(
                {
                    character: { $in: idForms(character._id) },
                    outcome: { $in: [...WON_RESULT_OUTCOMES] },
                },
                { projection: { enemies: 1, enemy: 1 } },
            )
            .sort({ _id: 1 })
            .toArray();
        const enemyIds = wonEnemyIdsOf(results);
        return loreBackfillOf({
            status: character.status,
            geography,
            enemyIds,
            enemyLore: await this.enemyLoreOf(enemyIds),
        });
    }

    private async enemyLoreOf(
        enemyIds: Types.ObjectId[],
    ): Promise<Map<string, Types.ObjectId[]>> {
        if (enemyIds.length === 0) return new Map();
        const enemies = await this.collectionOf(Enemy.name)
            .find<BackfillEnemy>(
                { _id: { $in: enemyIds } },
                { projection: { relatedLore: 1 } },
            )
            .toArray();
        return new Map(
            enemies.map((enemy) => [
                enemy._id.toHexString(),
                (enemy.relatedLore ?? [])
                    .map(refIdOf)
                    .filter((id): id is Types.ObjectId => id !== null),
            ]),
        );
    }

    // il nome della collection viene dal modello registrato, mai scritto a mano
    private collectionOf(modelName: string): Collection {
        return this.connection.model(modelName).collection;
    }
}
