import { Types } from 'mongoose';
import { isSpellCaster } from 'src/models/character/active-spell-slots';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { questSlotsOf, RankSlot } from '../acceptance/quest-capacity';
import { hasUntitledGroupSeat } from '../acceptance/quest-eligibility';
import { PrizesSnapshot } from '../outcomes/rewards/quest-rewards';
import {
    GROUP_PRIZE_TYPES,
    RankPrizeBlock,
    rankBlocksOf,
} from '../prizes/rank-prizes';

export type GroupPrizeViolation =
    | 'nullSeat'
    | 'seatWithoutBlock'
    | 'spellBelowMage'
    | 'invalidBlock';

export interface GroupPrizeQuest {
    _id: Types.ObjectId;
    infos?: { type?: QuestType | null } | null;
    requirements?: {
        minTitle?: TitleType | null;
        requiredAdventurers?: unknown;
    } | null;
    prizes?:
        | (PrizesSnapshot & { rankPrizes?: readonly unknown[] | null })
        | null;
}

export const GROUP_PRIZE_REPORT_WARNINGS_LIMIT = 20;

// posti non validi esclusi: li rifiuta già l'accettazione (D-27)
function validSeatsOf(quest: GroupPrizeQuest): RankSlot[] {
    const type = quest.infos?.type ?? undefined;
    const seats = questSlotsOf(type, quest.requirements?.requiredAdventurers);
    return seats === 'invalid' ? [] : seats;
}

// stessa regola dell'accettazione (D-02, D-24): l'aid con un posto senza titolo è l'aid di una solitaria
function hasNullSeat(quest: GroupPrizeQuest, seats: RankSlot[]): boolean {
    const type = quest.infos?.type;
    return !!type && hasUntitledGroupSeat(type, seats);
}

// senza blocchi una quest a titolo unico vale il premio unico del minTitle (D-28); a più titoli ogni posto prende lo stesso premio
function hasSeatWithoutBlock(
    seats: RankSlot[],
    blocks: RankPrizeBlock[],
): boolean {
    const titles = new Set(
        seats.flatMap(({ title }) => (title ? [title] : [])),
    );
    if (blocks.length === 0) return titles.size > 1;
    const covered = new Set(blocks.map(({ title }) => title));
    return [...titles].some((title) => !covered.has(title));
}

// blocchi che la quest scarta in silenzio (A-IN-03): titolo non valido o voce illeggibile, titolo ripetuto (vince il primo, D-18)
function hasInvalidBlock(
    quest: GroupPrizeQuest,
    blocks: RankPrizeBlock[],
): boolean {
    const type = quest.infos?.type;
    if (!type || !GROUP_PRIZE_TYPES.has(type)) return false;
    const entries = quest.prizes?.rankPrizes ?? [];
    const titles = new Set(blocks.map(({ title }) => title));
    return entries.length > blocks.length || titles.size < blocks.length;
}

// una magia sotto mage non sarà mai insegnata (D-05c)
function hasSpellBelowMage(blocks: RankPrizeBlock[]): boolean {
    return blocks.some(
        ({ spell, title }) => spell != null && !isSpellCaster(title),
    );
}

export function groupPrizeViolationsOf(
    quest: GroupPrizeQuest,
): GroupPrizeViolation[] {
    const seats = validSeatsOf(quest);
    const blocks = rankBlocksOf(quest);
    const violations: GroupPrizeViolation[] = [];
    if (hasNullSeat(quest, seats)) violations.push('nullSeat');
    if (hasSeatWithoutBlock(seats, blocks)) violations.push('seatWithoutBlock');
    if (hasSpellBelowMage(blocks)) violations.push('spellBelowMage');
    if (hasInvalidBlock(quest, blocks)) violations.push('invalidBlock');
    return violations;
}

// solo id e nomi delle violazioni: né titoli della quest né premi nel log
export function describeGroupPrizeViolations(
    id: Types.ObjectId,
    violations: readonly GroupPrizeViolation[],
): string {
    return `Premi per titolo: missione ${id.toHexString()} da correggere (${violations.join(', ')})`;
}
