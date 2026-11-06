import { Inject, Injectable } from '@nestjs/common';
import { AMBUSH_CONFIG, type AmbushConfig } from 'src/config/ambush-config';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import type { ActiveTravelDraft } from '../travel-timing';
import { hourFormatterOf, localHourOf } from './ambush-clock';
import { drawAmbush, type DrawnAmbush } from './ambush-draw';

export interface AmbushDrawTravel {
    road: { distance: number };
    startTime: Date;
    duration: number;
}

// mai dal planner né da buildActiveTravel: le anteprime consumerebbero caso (D-05, F1)
@Injectable()
export class AmbushPlanner {
    private readonly formatter: Intl.DateTimeFormat;

    constructor(
        @Inject(AMBUSH_CONFIG) config: AmbushConfig,
        private readonly chance: ChanceSource,
    ) {
        this.formatter = hourFormatterOf(config.timeZone);
    }

    withAmbush<T extends ActiveTravelDraft>(travel: T): T {
        const drawn = this.drawFrom(travel, 0);
        return drawn
            ? { ...travel, ambush: { ...drawn, attempts: 0 } }
            : travel;
    }

    drawFrom(travel: AmbushDrawTravel, fromKm: number): DrawnAmbush | null {
        return drawAmbush({
            road: travel.road,
            startTime: travel.startTime,
            durationMs: travel.duration,
            fromKm,
            chance: this.chance,
            hourOf: (instant) => localHourOf(this.formatter, instant),
        });
    }
}
