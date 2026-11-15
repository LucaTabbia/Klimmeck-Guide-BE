// testo e id della push di ogni imboscata (D-14, D-20, D-30); copy provvisoria, la rivede l'utente in UAT
import type { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { ambush } from 'src/push/push-events';
import type { PushMessage } from 'src/push/push-message';

export interface AmbushPushFacts {
    resultId: string;
    won: boolean;
    nearCity: string;
    reachedCity: string | null;
    fallenCompanion: string | null;
    onFoot: boolean;
    hungerRedirect: boolean;
}

export interface AmbushPushReport {
    resultId: Types.ObjectId;
    outcome: QuestOutcome;
    nearCity: { name: string };
    reachedCity: { name: string } | null;
    companion?: { name: string; defeated: boolean } | null;
    onFoot?: boolean;
}

export function ambushPushOf(facts: AmbushPushFacts): PushMessage {
    const body = facts.won ? wonBodyOf(facts) : lostBodyOf(facts);
    return ambush(facts.resultId, body);
}

export function ambushPushFactsOf(report: AmbushPushReport): AmbushPushFacts {
    const won = report.outcome === QuestOutcome.success;
    const reachedCity = report.reachedCity?.name ?? null;
    return {
        resultId: report.resultId.toHexString(),
        won,
        nearCity: report.nearCity.name,
        reachedCity,
        fallenCompanion: report.companion?.defeated
            ? report.companion.name
            : null,
        onFoot: report.onFoot === true,
        hungerRedirect: won && reachedCity !== null,
    };
}

function wonBodyOf(facts: AmbushPushFacts): string {
    const redirect =
        facts.hungerRedirect && facts.reachedCity
            ? `; la fame ti porta verso ${facts.reachedCity}`
            : '';
    return `Imboscata presso ${facts.nearCity}: ${wonOutcomeOf(facts)}${redirect}`;
}

function wonOutcomeOf(facts: AmbushPushFacts): string {
    if (!facts.fallenCompanion) return 'hai respinto gli assalitori';
    const onFoot = facts.onFoot ? ', prosegui a piedi' : '';
    return `${facts.fallenCompanion} è stato sconfitto${onFoot}`;
}

// senza città raggiunta la via torna verso quella vicina all'imboscata
function lostBodyOf(facts: AmbushPushFacts): string {
    const fallen = facts.fallenCompanion
        ? `. ${facts.fallenCompanion} è stato sconfitto`
        : '';
    return `Sei stato sconfitto: la via torna verso ${facts.reachedCity ?? facts.nearCity}${fallen}`;
}
