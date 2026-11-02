import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import {
    RELATED_LORE_POPULATE,
    withoutOrphanRelatedLore,
} from 'src/lore/related-lore';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';

@Injectable()
export class EnemiesService {
    constructor(
        @InjectModel(Enemy.name) private enemyModel: Model<EnemyDocument>,
    ) {}

    async findAll(): Promise<Enemy[]> {
        const enemies = await this.enemyModel
            .find()
            .populate(RELATED_LORE_POPULATE)
            .exec();
        return enemies.map(withoutOrphanRelatedLore);
    }

    async findOne(id: string): Promise<Enemy> {
        const enemy = await this.enemyModel
            .findById(id)
            .populate(RELATED_LORE_POPULATE)
            .exec();
        if (!enemy) throw ResourceNotFoundException.enemy();
        return withoutOrphanRelatedLore(enemy);
    }
}
