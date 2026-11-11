// UNA TANTUM (Phase 19 D-12): sostituisce le copie incorporate delle magie dei nemici con i riferimenti al catalogo — esce dal repo dopo il boot reale
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { type Connection, Types } from 'mongoose';
import { Enemy } from 'src/models/enemy.model';
import { Spell } from 'src/models/spell.model';
import { refIdOf, sameId } from 'src/mongo/document-id';
import {
    MODEL_REVIEW_LOG_PREFIX,
    type ModelReviewStep,
    type ModelReviewStepReport,
} from './model-review.step';

export interface CatalogSpell {
    _id: Types.ObjectId;
    name?: unknown;
}

export interface EmbeddedSpellMatch {
    // nell'ordine delle copie, senza ripetere un id già presente
    ids: Types.ObjectId[];
    // etichette degli elementi lasciati fuori: nome della copia, '<senza nome>' o il ref pendente
    unmatched: string[];
}

interface EmbeddedCopy {
    _id?: unknown;
    name?: unknown;
}

const NAMELESS = '<senza nome>';
const LABEL = 'magie dei nemici';

// guardia di idempotenza: per il server un ObjectId non è di tipo oggetto, quindi una lista di soli ref non si tocca
const WITH_EMBEDDED_COPIES = { spells: { $elemMatch: { $type: 'object' } } };

function catalogIdOf(
    id: unknown,
    catalog: readonly CatalogSpell[],
): Types.ObjectId | undefined {
    return catalog.find((spell) => sameId(id, spell._id))?._id;
}

// un nome vale solo se a catalogo lo porta UNA magia: l'ambiguo non si indovina
function catalogIdNamed(
    name: unknown,
    catalog: readonly CatalogSpell[],
): Types.ObjectId | undefined {
    if (typeof name !== 'string') return undefined;
    const namesakes = catalog.filter((spell) => spell.name === name);
    return namesakes.length === 1 ? namesakes[0]._id : undefined;
}

function labelOf(copy: EmbeddedCopy | null | undefined): string {
    return typeof copy?.name === 'string' ? copy.name : NAMELESS;
}

function isEmbeddedCopy(element: unknown): element is EmbeddedCopy {
    return typeof element === 'object' && element !== null;
}

export function matchEmbeddedSpells(
    copies: readonly unknown[],
    catalog: readonly CatalogSpell[],
): EmbeddedSpellMatch {
    const ids: Types.ObjectId[] = [];
    const unmatched: string[] = [];
    const keep = (id: Types.ObjectId | undefined, label: string): void => {
        if (!id) {
            unmatched.push(label);
            return;
        }
        if (!ids.some((kept) => sameId(kept, id))) ids.push(id);
    };

    for (const element of copies) {
        const reference = refIdOf(element);
        if (reference) {
            keep(
                catalogIdOf(reference, catalog),
                `<riferimento ${reference.toHexString()}>`,
            );
            continue;
        }
        if (!isEmbeddedCopy(element)) {
            keep(undefined, NAMELESS);
            continue;
        }
        keep(
            catalogIdOf(element._id, catalog) ??
                catalogIdNamed(element.name, catalog),
            labelOf(element),
        );
    }
    return { ids, unmatched };
}

@Injectable()
export class EnemySpellsStep implements ModelReviewStep {
    readonly label = LABEL;

    private readonly logger = new Logger(EnemySpellsStep.name);

    constructor(@InjectConnection() private readonly connection: Connection) {}

    async run(): Promise<ModelReviewStepReport> {
        // driver nativo: via modello le copie incorporate verrebbero lette col cast dello schema nuovo
        const enemies = this.connection.model(Enemy.name).collection;
        const catalog = await this.connection
            .model(Spell.name)
            .collection.find<CatalogSpell>({}, { projection: { name: 1 } })
            .toArray();
        const found = await enemies.countDocuments({});
        const withCopies = await enemies
            .find<{
                _id: Types.ObjectId;
                spells: unknown[];
            }>(WITH_EMBEDDED_COPIES, { projection: { spells: 1 } })
            .toArray();

        let unmatched = 0;
        for (const enemy of withCopies) {
            const match = matchEmbeddedSpells(enemy.spells, catalog);
            await enemies.updateOne(
                { _id: enemy._id },
                { $set: { spells: match.ids } },
            );
            unmatched += match.unmatched.length;
            for (const name of match.unmatched) {
                this.logger.warn(
                    `${MODEL_REVIEW_LOG_PREFIX}${LABEL}: copia senza corrispondenza «${name}» sul nemico ${enemy._id.toHexString()}`,
                );
            }
        }
        const migrated = withCopies.length;
        return { found, migrated, alreadyDone: found - migrated, unmatched };
    }
}
