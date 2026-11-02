import type { Document } from 'mongodb';
import {
    MappedDocument,
    toObjectId,
    toObjectIds,
} from 'src/content/mapping/canonical';
import {
    damagesOf,
    ImageUrls,
    spellFieldsOf,
} from 'src/content/mapping/catalog.mapper';
import { ContentConfig } from 'src/content/rules/content-config';
import {
    enemyDamages,
    enemyLifePoints,
    enemyXp,
} from 'src/content/rules/enemy-stats';
import type { SpellEntry } from 'src/content/schema/catalog.content';
import type {
    EnemyEntry,
    EnemySourceEntry,
} from 'src/content/schema/enemy.content';

// category, tier e source restano nel file: servono a controlli e generatore, mai al gioco (D-10, D-11)

function sourceOf(entry: EnemyEntry): EnemySourceEntry {
    if (!entry.source) {
        throw new RangeError(`Nemico senza source né override: ${entry.id}`);
    }
    return entry.source;
}

// Enemy.spells è embedded (Pitfall 8): la copia integrale segue la magia del catalogo a ogni --apply
function spellCopyOf(
    id: string,
    spellsById: ReadonlyMap<string, SpellEntry>,
): Document {
    const spell = spellsById.get(id);
    if (!spell) throw new RangeError(`Magia assente dal catalogo: ${id}`);
    return { _id: toObjectId(id), ...spellFieldsOf(spell) };
}

function damagesFor(entry: EnemyEntry, config: ContentConfig): Document {
    if (entry.damages) return damagesOf(entry.damages);
    const { damagePerRound } = sourceOf(entry);
    return damagesOf(enemyDamages(damagePerRound, config.enemy.damageScale));
}

export function mapEnemy(
    entry: EnemyEntry,
    spellsById: ReadonlyMap<string, SpellEntry>,
    config: ContentConfig,
    images: ImageUrls,
): MappedDocument {
    const { xpScale, hpScale } = config.enemy;
    return {
        _id: toObjectId(entry.id),
        set: {
            name: entry.name,
            locations: [...entry.locations],
            energyWeaknesses: [...entry.energyWeaknesses],
            baseWeaknesses: [...entry.baseWeaknesses],
            relatedLore: toObjectIds(entry.relatedLore),
            xp: entry.xp ?? enemyXp(sourceOf(entry).pe, xpScale),
            spells: entry.spells.map((id) => spellCopyOf(id, spellsById)),
            lifePoints:
                entry.lifePoints ??
                enemyLifePoints(sourceOf(entry).pf, hpScale),
            imagePath: images.get(entry.id) ?? entry.imagePath,
            damages: damagesFor(entry, config),
        },
        setOnInsert: null,
    };
}
