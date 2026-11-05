import { QuestType } from 'src/models/enums/quest-type.enum';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { GeneratedQuestType } from 'src/quests/generation/generated-prizes';

export interface TitledEnemy {
    name: string;
    quantity: number;
}

// voce del committente come Phase 11 D-32; LLM in v2; copy ritoccabile (D-22)
export const ENEMY_ANNOUNCEMENTS = [
    'Sono un contadino di {città}: {nemici} razziano i nostri campi da giorni. Vi supplico, liberateci da questa minaccia prima del raccolto.',
    'Le carovane dirette a {città} non arrivano più: {nemici} assaltano chiunque passi sulla strada. Pagherò bene chi riaprirà la via.',
    'Qui parla il capitano della guardia di {città}. Avvistati {nemici} nei dintorni: i miei uomini non bastano, servono avventurieri.',
] as const;

export const BOSS_ANNOUNCEMENTS = [
    'Il tempio di {città} trema da notti intere: {nemici} si aggira nei dintorni. Che gli dei guidino chi avrà il coraggio di affrontarlo.',
    'A tutti gli avventurieri di passaggio a {città}: {nemici} ha già respinto due pattuglie. Cerco un gruppo capace di abbatterlo.',
    'Ho perso un intero carico per colpa di {nemici}, nei pressi di {città}. Offro una ricompensa a chi lo toglierà di mezzo una volta per tutte.',
] as const;

// in ms come la Phase 11 (Pitfall 6): enemy 1 h, boss 3 h (D-22)
export const TIME_TO_COMPLETE_MS: Readonly<Record<GeneratedQuestType, number>> =
    {
        [QuestType.enemy]: 3_600_000,
        [QuestType.boss]: 10_800_000,
    };

const CITY_SLOT = '{città}';
const ENEMIES_SLOT = '{nemici}';

const TITLE_PREFIX: Readonly<Record<GeneratedQuestType, string>> = {
    [QuestType.enemy]: 'Minaccia',
    [QuestType.boss]: 'Boss',
};

const ANNOUNCEMENTS: Readonly<Record<GeneratedQuestType, readonly string[]>> = {
    [QuestType.enemy]: ENEMY_ANNOUNCEMENTS,
    [QuestType.boss]: BOSS_ANNOUNCEMENTS,
};

// «A», «A e B», «A, B e C»
function joinItalian(parts: readonly string[]): string {
    if (parts.length <= 1) return parts.join('');
    return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

// la quantità compare solo se > 1 su una voce sola; in un branco di più voci ogni voce la mostra (utente 2026-11-04, D-22)
export function enemyListOf(entries: readonly TitledEnemy[]): string {
    if (entries.length === 1 && entries[0].quantity === 1) {
        return entries[0].name;
    }
    return joinItalian(
        entries.map((entry) => `${entry.quantity} ${entry.name}`),
    );
}

// il boss è un nemico singolo: nome senza quantità
function enemiesTextOf(
    type: GeneratedQuestType,
    entries: readonly TitledEnemy[],
): string {
    if (type === QuestType.boss) {
        return joinItalian(entries.map((entry) => entry.name));
    }
    return enemyListOf(entries);
}

export function titleOf(
    type: GeneratedQuestType,
    entries: readonly TitledEnemy[],
    cityName: string,
): string {
    return `${TITLE_PREFIX[type]}: ${enemiesTextOf(type, entries)} presso ${cityName}`;
}

export function announcementOf(
    type: GeneratedQuestType,
    entries: readonly TitledEnemy[],
    cityName: string,
    chance: ChanceSource,
): string {
    const variants = ANNOUNCEMENTS[type];
    const index = Math.min(
        variants.length - 1,
        Math.floor(chance.next() * variants.length),
    );
    return variants[index]
        .split(CITY_SLOT)
        .join(cityName)
        .split(ENEMIES_SLOT)
        .join(enemiesTextOf(type, entries));
}

export function relatedLoreOf(
    cityLore: string | null,
    enemies: readonly { relatedLore: readonly string[] }[],
): string[] {
    const lore = [
        ...(cityLore === null ? [] : [cityLore]),
        ...enemies.flatMap((enemy) => enemy.relatedLore),
    ];
    return [...new Set(lore)];
}
