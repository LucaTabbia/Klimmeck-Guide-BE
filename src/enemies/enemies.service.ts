import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type PopulateOptions } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    RELATED_LORE_POPULATE,
    withoutOrphanRelatedLore,
} from 'src/lore/related-lore';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { Spell } from 'src/models/spell.model';

// Enemy.spells è [Spell!]!: un ObjectId grezzo annullerebbe il nemico sul filo; il populate di una lista scarta da sé i ref pendenti (Phase 19 D-02)
const ENEMY_WIRE_POPULATE: PopulateOptions[] = [
    RELATED_LORE_POPULATE,
    { path: 'spells', model: Spell.name },
];

@Injectable()
export class EnemiesService {
    constructor(
        @InjectModel(Enemy.name) private enemyModel: Model<EnemyDocument>,
    ) {}

    async findAll(): Promise<Enemy[]> {
        const enemies = await this.enemyModel
            .find()
            .populate(ENEMY_WIRE_POPULATE)
            .exec();
        return enemies.map(withoutOrphanRelatedLore);
    }

    async findOne(id: string): Promise<Enemy> {
        const enemy = await this.enemyModel
            .findById(id)
            .populate(ENEMY_WIRE_POPULATE)
            .exec();
        if (!enemy) throw ResourceNotFoundException.enemy();
        return withoutOrphanRelatedLore(enemy);
    }
}
