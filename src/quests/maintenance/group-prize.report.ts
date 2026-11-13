import { Types } from 'mongoose';
import { isSpellCaster } from 'src/models/character/active-spell-slots';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { questSlotsOf, RankSlot } from '../acceptance/quest-capacity';
import { hasUntitledGroupSeat } from '../acceptance/quest-eligibility';
import { PrizesSnapshot } from '../outcomes/rewards/quest-rewards';
import { RankPrizeBlock, rankBlocksOf } from '../prizes/rank-prizes';

export type GroupPrizeViolation =
    | 'nullSeat'
    | 'seatWithoutBlock'
    | 'spellBelowMage';

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

// senza blocchi la quest vale il premio unico del minTitle (D-28): nessun posto resta scoperto
function hasSeatWithoutBlock(
    seats: RankSlot[],
    blocks: RankPrizeBlock[],
): boolean {
    if (blocks.length === 0) return false;
    const covered = new Set(blocks.map(({ title }) => title));
    return seats.some(({ title }) => title !== null && !covered.has(title));
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
    return violations;
}

// solo id e nomi delle violazioni: né titoli della quest né premi nel log
export function describeGroupPrizeViolations(
    id: Types.ObjectId,
    violations: readonly GroupPrizeViolation[],
): string {
    return `Premi per titolo: missione ${id.toHexString()} da correggere (${violations.join(', ')})`;
}
