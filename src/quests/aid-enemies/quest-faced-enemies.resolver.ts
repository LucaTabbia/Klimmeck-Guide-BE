import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { QuestInfos } from 'src/models/quest/quest-infos.model';
import { Quest } from 'src/models/quest/quest.model';
import { facedEnemiesOf } from 'src/quests/outcomes/dungeon/dungeon-turns';

// nemici dell'aid di dungeon (quick 261113-aql, D-12): sul filo solo i gruppi affrontati fino al turno salvato, per ogni viewer;
// a DB l'aid tiene i gruppi dell'originale (D-09); il payload WS è condiviso: infos si ricostruisce campo per campo, mai mutato
@Resolver(() => Quest)
export class QuestFacedEnemiesResolver {
    @ResolveField('infos', () => QuestInfos)
    infos(@Parent() quest: Quest): QuestInfos {
        const { infos } = quest;
        if (infos?.type !== QuestType.aid) return infos;
        const faced = facedEnemiesOf(infos.enemies ?? [], quest.rescue?.turn);
        if (!faced) return infos;
        return {
            timeToComplete: infos.timeToComplete,
            title: infos.title,
            enemies: faced,
            type: infos.type,
            markerLocation: infos.markerLocation,
            relatedLore: infos.relatedLore,
            description: infos.description,
        };
    }
}
