// UNA TANTUM (Phase 12 D-25): gira al primo boot reale dal branch e poi esce dal repo con la sua int-spec; da lì cura a DB (D-26)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessoryUseType } from 'src/models/enums/accessory-use-type.enum';
import { EquipType } from 'src/models/enums/equip-type.enum';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';

export interface JewelAccessoryReport {
    written: number;
    missing: string[];
}

// tabella APPROVATA dall'utente il 2026-11-04 (13-JEWELS-REVIEW.md): copiata, mai dedotta
export const JEWEL_ACCESSORY_USE_TYPES: ReadonlyMap<
    string,
    readonly AccessoryUseType[]
> = new Map<string, readonly AccessoryUseType[]>([
    ['68c19536541d89c481b832d7', [AccessoryUseType.defense]], // Amuleto della Purezza
    ['68c19536541d89c481b832cf', [AccessoryUseType.defense]], // Amuleto di legno
    ['68c19536541d89c481b832d1', [AccessoryUseType.defense]], // Amuleto di rame anti-elettricità
    ['68c19536541d89c481b832da', [AccessoryUseType.defense]], // Collana dell'Essenza
    ['68c19536541d89c481b832d2', [AccessoryUseType.defense]], // Collana della megera
    [
        '68c19536541d89c481b832d4',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Collana delle Anime
    ['68c19536541d89c481b832ce', [AccessoryUseType.defense]], // Collana di conchiglie
    ['68c19536541d89c481b83254', [AccessoryUseType.defense]], // Collana di Mirwa
    ['68c19536541d89c481b832d8', [AccessoryUseType.defense]], // Collare da esecuzione
    ['68c19536541d89c481b832d0', [AccessoryUseType.defense]], // Collare di ferro
    ['68c19536541d89c481b832d5', [AccessoryUseType.attack]], // Corno da guerra
    ['6ae7fdeea808802d838972e5', [AccessoryUseType.defense]], // Cuore di golem
    ['68c19536541d89c481b832d3', [AccessoryUseType.attack]], // Dente di bestia
    ['6ae7fdeea808802d838972cf', [AccessoryUseType.defense]], // Filo del destino
    [
        '68c19536541d89c481b832dc',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Manto del cacciatore ancestrale
    ['6ae7fdeea808802d838972e3', [AccessoryUseType.attack]], // Medaglione del Bardo delle leggende
    [
        '68c19536541d89c481b832d9',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Medaglione del Vulcano
    ['68c19536541d89c481b832d6', [AccessoryUseType.defense]], // Medaglione di Mezaldir
    ['6ae7fdeea808802d838972e7', [AccessoryUseType.attack]], // Occhio di beholder
    [
        '68c19536541d89c481b832db',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Occhio di Kraken
    ['6ae7fdeea808802d838972d5', [AccessoryUseType.attack]], // Spilla piumata di Iarus
    [
        '68c19536541d89c481b832c8',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Anello con scaglie
    ['68c19536541d89c481b832c2', [AccessoryUseType.defense]], // Anello d'acciaio anti-gelo
    ['68c19536541d89c481b83253', [AccessoryUseType.defense]], // Anello d'argento anti-fuoco
    ['6ae7fdeea808802d838972ce', [AccessoryUseType.attack]], // Anello dal volto mutevole
    ['6ae7fdeea808802d838972de', [AccessoryUseType.defense]], // Anello dei quattro
    [
        '68c19536541d89c481b832c5',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Anello del Bardo
    ['68c19536541d89c481b832c6', [AccessoryUseType.defense]], // Anello del Fulmine
    [
        '68c19536541d89c481b832cd',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Anello del Litch
    [
        '68c19536541d89c481b832cb',
        [AccessoryUseType.attack, AccessoryUseType.defense],
    ], // Anello del Portale
    ['68c19536541d89c481b832c1', [AccessoryUseType.defense]], // Anello del viandante
    ['68c19536541d89c481b832cc', [AccessoryUseType.defense]], // Anello dell'Alto Savio
    ['6ae7fdeea808802d838972d3', [AccessoryUseType.attack]], // Anello della passione
    ['68c19536541d89c481b832ca', [AccessoryUseType.defense]], // Anello della Pazienza
    ['68c19536541d89c481b832c3', [AccessoryUseType.defense]], // Anello della Rugiada notturna
    ['6ae7fdeea808802d838972d9', [AccessoryUseType.defense]], // Anello delle gemme di Bitya
    ['68c19536541d89c481b832bf', [AccessoryUseType.defense]], // Anello di bronzo
    ['68c19536541d89c481b832c0', [AccessoryUseType.defense]], // Anello di ferro
    ['68c19536541d89c481b832c9', [AccessoryUseType.defense]], // Dito della Madre
    ['6ae7fdeea808802d838972e2', [AccessoryUseType.attack]], // Sigillo della Banca Faris
    ['68c19536541d89c481b832c4', [AccessoryUseType.defense]], // Sigillo della Forza
    ['68c19536541d89c481b832c7', [AccessoryUseType.defense]], // Teschio di Corvo
]);

const JEWEL_EQUIP_TYPES = [EquipType.ring, EquipType.necklace];

// nessun hook di boot proprio: lo chiama QuestMaintenanceBoot dopo i nemici; la cura a DB vince (solo dove il campo manca)
@Injectable()
export class JewelAccessoryMigrator {
    private readonly logger = new Logger(JewelAccessoryMigrator.name);

    constructor(
        @InjectModel(EquipmentItem.name)
        private readonly equipmentItemModel: Model<EquipmentItemDocument>,
    ) {}

    async migrate(): Promise<JewelAccessoryReport> {
        const missing = await this.missingJewels();
        let written = 0;
        for (const [hex, types] of JEWEL_ACCESSORY_USE_TYPES) {
            const update = await this.equipmentItemModel
                .updateOne(
                    {
                        _id: new Types.ObjectId(hex),
                        equipType: { $in: JEWEL_EQUIP_TYPES },
                        accessoryUseTypes: { $exists: false },
                    },
                    { $set: { accessoryUseTypes: [...types] } },
                )
                .exec();
            written += update.modifiedCount;
        }
        if (written > 0) this.logger.log(`Gioielli: ${written} valorizzati`);
        if (missing.length > 0)
            this.logger.warn(
                `Gioielli: ${missing.length} della tabella non trovati a DB: ${missing.join(', ')}`,
            );
        return { written, missing };
    }

    private async missingJewels(): Promise<string[]> {
        const ids = [...JEWEL_ACCESSORY_USE_TYPES.keys()];
        const found = await this.equipmentItemModel
            .find(
                { _id: { $in: ids.map((hex) => new Types.ObjectId(hex)) } },
                { _id: 1 },
            )
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        const present = new Set(found.map(({ _id }) => _id.toHexString()));
        return ids.filter((hex) => !present.has(hex));
    }
}
