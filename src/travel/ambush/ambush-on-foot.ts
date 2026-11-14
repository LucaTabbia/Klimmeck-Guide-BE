// resto della strada a piedi quando cade la cavalcatura della partenza (Phase 23 D-13, D-29): stessa forma della deviazione, prossima imboscata rimappata per km senza tiri (Pitfall 3); puro
import type { Types } from 'mongoose';
import type { TravelKind } from 'src/models/character/active-travel.model';
import { sameId } from 'src/mongo/document-id';
import type { LonLat } from 'src/roads/road-route';
import { isMountFactor } from '../travel-timing';
import {
    type ActiveTravelFoodDraft,
    foodPlanOf,
    planTravelFood,
    type TravelFoodInput,
    type TravelFoodPlan,
} from '../food/travel-food';
import { residualRoadOf } from './ambush-detour';
import type { DrawnAmbush } from './ambush-draw';
import type { AmbushTravelSnapshot } from './ambush-plan';

export interface FallenCompanion {
    petId: Types.ObjectId | null;
    defeated: boolean;
}

export interface OnFootTravelInput {
    // mount letto dal DB: assente sui viaggi partiti prima della fase (D-29)
    travel: AmbushTravelSnapshot & { mount?: unknown };
    point: LonLat;
    segment: number;
    // la prossima imboscata già sorteggiata sul viaggio di prima, km assoluto
    next: DrawnAmbush | null;
}

export interface OnFootTravel {
    road: { coordinates: LonLat[]; distance: number };
    startTime: Date;
    endTime: Date;
    duration: number;
    to: Types.ObjectId;
    kind: TravelKind;
    next: DrawnAmbush | null;
}

export type OnFootFoodInput = TravelFoodInput;

export interface OnFootFood {
    plan: TravelFoodPlan;
    food: ActiveTravelFoodDraft;
}

// un modificatore illeggibile o non più veloce del passo non allunga la strada
const MOUNTED_PACE = 1;

// solo la cavalcatura fotografata alla partenza, sconfitta in questo scontro (D-13, D-29, Pitfall 4)
export function isMountFallen(
    mount: unknown,
    companion: FallenCompanion | null,
): boolean {
    if (!companion?.defeated || !companion.petId) return false;
    return (
        isRecord(mount) &&
        isMountFactor(mount.factor) &&
        sameId(mount.pet, companion.petId)
    );
}

// la pedina riparte dal punto all'istante dell'imboscata: allungare solo l'arrivo la farebbe tornare indietro (D-13)
export function onFootTravelOf(input: OnFootTravelInput): OnFootTravel {
    const { travel, point, segment } = input;
    const { at } = travel.ambush;
    const road = residualRoadOf(travel, point, segment);
    const mountedMs = Math.max(0, travel.endTime.getTime() - at.getTime());
    const duration = Math.round(mountedMs * paceFactorOf(travel.mount));
    return {
        road,
        startTime: at,
        endTime: new Date(at.getTime() + duration),
        duration,
        to: travel.to,
        kind: travel.kind,
        next: remappedNextOf(input.next, travel.ambush, road.distance, {
            at,
            duration,
        }),
    };
}

// come arrivare al punto e ripartire a piedi: piano nuovo sulla strada residua (D-13, A3)
export function onFootFoodOf(input: OnFootFoodInput): OnFootFood {
    const plan = planTravelFood(input);
    return { plan, food: foodPlanOf(plan, input.distanceKm) };
}

// rimappa per km, nessun tiro (D-29, C-8): fuori dalla strada residua non resta nulla
function remappedNextOf(
    next: DrawnAmbush | null,
    current: { km: number },
    residualKm: number,
    walk: { at: Date; duration: number },
): DrawnAmbush | null {
    if (!next) return null;
    const km = next.km - current.km;
    if (!(km > 0 && km < residualKm)) return null;
    return {
        at: new Date(
            walk.at.getTime() + Math.floor((km / residualKm) * walk.duration),
        ),
        km,
    };
}

// quanto la cavalcatura della partenza accorciava la strada: a piedi la durata si moltiplica per questo (D-13, C-11)
export function paceFactorOf(mount: unknown): number {
    if (!isRecord(mount)) return MOUNTED_PACE;
    const { factor } = mount;
    return isMountFactor(factor) ? factor : MOUNTED_PACE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
