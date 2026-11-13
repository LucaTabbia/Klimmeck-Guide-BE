import { Types } from 'mongoose';

export const DUNGEON_ORDER_REPORT_WARNINGS_LIMIT = 20;

const xpOf = (xp: number | null | undefined): number =>
    typeof xp === 'number' && Number.isFinite(xp) ? xp : 0;

// utente 2026-11-13 (quick 261113-aql): l'ultimo gruppo della dungeon è un nemico con l'xp massimo, come il ritratto della FE (null vale 0);
// a parità basta uno dei più forti in fondo; i gruppi assenti dal catalogo non si combattono e non contano
export function strongestEnemyIsLast(
    groups: readonly Types.ObjectId[],
    xpById: ReadonlyMap<string, number | null>,
): boolean {
    const xps = groups
        .map((id) => id.toHexString())
        .filter((hex) => xpById.has(hex))
        .map((hex) => xpOf(xpById.get(hex)));
    if (xps.length < 2) return true;
    return (xps.at(-1) as number) >= Math.max(...xps);
}

// solo l'id: né titoli né nomi dei nemici nel log
export function describeDungeonOrder(id: Types.ObjectId): string {
    return `Ordine della dungeon: missione ${id.toHexString()} senza il nemico più forte all'ultimo gruppo`;
}
