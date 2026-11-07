import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ResourceNotFoundException } from 'src/authz/resource-not-found.exception';
import { Lore, LoreDocument } from 'src/models/lore.model';
import {
    RELATED_LORE_POPULATE,
    withoutOrphanRelatedLore,
} from 'src/lore/related-lore';
import { isVisible, LoreVisibility } from './lore-visibility';

@Injectable()
export class LoreService {
    constructor(
        @InjectModel(Lore.name) private loreModel: Model<LoreDocument>,
    ) {}

    async findAll(visibility: LoreVisibility): Promise<Lore[]> {
        if (!visibility.all && visibility.lore.size === 0) return [];
        const filter = visibility.all
            ? {}
            : { _id: { $in: [...visibility.lore] } };
        const lores = await this.loreModel
            .find(filter)
            .populate(RELATED_LORE_POPULATE)
            .exec();
        return lores.map(withoutOrphanRelatedLore);
    }

    // una lore chiusa risponde come una inesistente, prima della query: nessun oracolo (D-10)
    async findOne(id: string, visibility: LoreVisibility): Promise<Lore> {
        if (!isVisible(visibility, id)) throw ResourceNotFoundException.lore();
        const lore = await this.loreModel
            .findById(id)
            .populate(RELATED_LORE_POPULATE)
            .exec();
        if (!lore) throw ResourceNotFoundException.lore();
        return withoutOrphanRelatedLore(lore);
    }
}
