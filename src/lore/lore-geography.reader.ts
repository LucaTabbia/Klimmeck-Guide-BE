import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model, Types } from 'mongoose';
import { City, CityDocument } from 'src/models/city.model';
import { Lore, LoreDocument } from 'src/models/lore.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { geographyOf, GeographyLore } from './lore-geography';

interface CityLoreRef {
    relatedLore?: unknown;
}

interface CityLore {
    _id: Types.ObjectId;
    type?: unknown;
    relatedLore?: unknown[];
}

// geografia del marker di una città (Phase 16 D-03, D-05): solo City.markerLocation, mai i POI del territorio;
// driver nativo per la città: il cast di Mongoose sul ref trasformerebbe la forma stringa legacy di idForms (Pitfall 8)
@Injectable()
export class LoreGeographyReader {
    constructor(
        @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
        @InjectModel(Lore.name) private readonly loreModel: Model<LoreDocument>,
    ) {}

    async ofMarker(
        marker: Types.ObjectId | null,
        session?: ClientSession,
    ): Promise<Types.ObjectId[]> {
        if (marker === null) return [];
        const city = await this.cityModel.collection.findOne<CityLoreRef>(
            { markerLocation: { $in: idForms(marker) } },
            { projection: { relatedLore: 1 }, session },
        );
        const cityLoreId = refIdOf(city?.relatedLore);
        if (cityLoreId === null) return [];
        const cityLore = await this.loreModel
            .findById(cityLoreId, { type: 1, relatedLore: 1 }, { session })
            .lean<CityLore | null>()
            .exec();
        if (cityLore === null) return [];
        return geographyOf(
            cityLore,
            await this.relatedOf(cityLore.relatedLore ?? [], session),
        );
    }

    // l'ordine segue le relatedLore della città, non quello della query; gli orfani spariscono
    private async relatedOf(
        refs: readonly unknown[],
        session?: ClientSession,
    ): Promise<GeographyLore[]> {
        const ids = refs
            .map(refIdOf)
            .filter((id): id is Types.ObjectId => id !== null);
        if (ids.length === 0) return [];
        const related = await this.loreModel
            .find({ _id: { $in: ids } }, { type: 1 }, { session })
            .lean<GeographyLore[]>()
            .exec();
        const byHex = new Map(
            related.map((lore) => [lore._id.toHexString(), lore]),
        );
        return ids
            .map((id) => byHex.get(id.toHexString()))
            .filter((lore): lore is GeographyLore => lore !== undefined);
    }
}
