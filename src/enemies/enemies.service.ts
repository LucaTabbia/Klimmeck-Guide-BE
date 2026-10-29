import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';

@Injectable()
export class EnemiesService {
    constructor(
        @InjectModel(Enemy.name) private enemyModel: Model<EnemyDocument>,
    ) {}

    async findAll(): Promise<Enemy[]> {
        return await this.enemyModel.find().exec();
    }

    async findOne(id: string): Promise<Enemy> {
        const enemy = await this.enemyModel.findById(id).exec();
        if (!enemy) throw ResourceNotFoundException.enemy();
        return enemy;
    }
}
