import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { TITLE_RANK } from '../acceptance/quest-eligibility';
import { PrizesSnapshot } from '../outcomes/rewards/quest-rewards';

// solo le quest di gruppo leggono i blocchi per titolo (D-01); le solitarie tengono il premio unico
export const GROUP_PRIZE_TYPES: ReadonlySet<QuestType> = new Set([
    QuestType.boss,
    QuestType.worldMission,
    QuestType.aid,
]);

export interface RankPrizeBlock extends PrizesSnapshot {
    title: TitleType;
}

export interface RankPrizesHolder {
    infos?: { type?: QuestType | null } | null;
    requirements?: { minTitle?: TitleType | null } | null;
    prizes?:
        | (PrizesSnapshot & { rankPrizes?: readonly unknown[] | null })
        | null;
}

function isTitle(value: unknown): value is TitleType {
    return typeof value === 'string' && Object.hasOwn(TITLE_RANK, value);
}

function isRankPrizeBlock(entry: unknown): entry is RankPrizeBlock {
    return (
        typeof entry === 'object' &&
        entry !== null &&
        isTitle((entry as { title?: unknown }).title)
    );
}

function rankOf(prize: RankPrizeBlock): number {
    return TITLE_RANK[prize.title];
}

// campo per campo, mai con lo spread: un sottodocumento idratato perderebbe i campi (B1)
function soloBlockOf(prizes: PrizesSnapshot, title: TitleType): RankPrizeBlock {
    return {
        title,
        prizeCoins: prizes.prizeCoins,
        xpPrize: prizes.xpPrize,
        prizeItem: prizes.prizeItem,
        randomLoot: prizes.randomLoot,
        spell: prizes.spell,
        spellDraw: prizes.spellDraw,
        pet: prizes.pet,
        cure: prizes.cure,
    };
}

// unica lettura dei blocchi validi (W7): tipo di gruppo con almeno un blocco dal titolo valido, altrimenti nessuno
export function rankBlocksOf(quest: RankPrizesHolder): RankPrizeBlock[] {
    const type = quest.infos?.type;
    if (!type || !GROUP_PRIZE_TYPES.has(type)) return [];
    return (quest.prizes?.rankPrizes ?? []).filter(isRankPrizeBlock);
}

// senza blocchi validi la quest vale un blocco unico sul minTitle: solitarie e boss legacy come oggi (D-01, D-28)
export function prizeBlocksOf(quest: RankPrizesHolder): RankPrizeBlock[] {
    const blocks = rankBlocksOf(quest);
    if (blocks.length > 0) return blocks;
    if (!quest.prizes) return [];
    const title = quest.requirements?.minTitle ?? TitleType.rookie;
    return [soloBlockOf(quest.prizes, title)];
}

function lowestBlockOf(blocks: RankPrizeBlock[]): RankPrizeBlock {
    return blocks.reduce((lowest, prize) =>
        rankOf(prize) < rankOf(lowest) ? prize : lowest,
    );
}

function highestBlockUpTo(
    blocks: RankPrizeBlock[],
    rank: number,
): RankPrizeBlock | null {
    return blocks
        .filter((prize) => rankOf(prize) <= rank)
        .reduce<RankPrizeBlock | null>(
            (highest, prize) =>
                !highest || rankOf(prize) > rankOf(highest) ? prize : highest,
            null,
        );
}

// unica regola di scelta (D-04, D-18): titolo esatto, poi il più alto non superiore, poi il più basso; senza titolo vale il minTitle
export function prizeBlockFor(
    quest: RankPrizesHolder,
    title: TitleType | null | undefined,
): RankPrizeBlock | null {
    const blocks = prizeBlocksOf(quest);
    if (blocks.length === 0) return null;
    const wanted = title ?? quest.requirements?.minTitle;
    if (!wanted) return lowestBlockOf(blocks);
    return (
        blocks.find((prize) => prize.title === wanted) ??
        highestBlockUpTo(blocks, TITLE_RANK[wanted]) ??
        lowestBlockOf(blocks)
    );
}
