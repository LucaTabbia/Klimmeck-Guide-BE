import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    DungeonContext,
    DungeonResolution,
    DungeonResolver,
} from 'src/quests/outcomes/dungeon/dungeon-resolver';

// l'harness accetta solo useValue: la porta della dungeon si sostituisce per caso e registra i contesti ricevuti; il segnaposto reale resta il default
export class SwappableDungeonResolver extends DungeonResolver {
    readonly contexts: DungeonContext[] = [];
    private current: DungeonResolver;

    constructor(readonly placeholder: DungeonResolver) {
        super();
        this.current = placeholder;
    }

    use(resolver: DungeonResolver): void {
        this.current = resolver;
    }

    reset(): void {
        this.current = this.placeholder;
        this.contexts.length = 0;
    }

    explore(context: DungeonContext, chance: ChanceSource): DungeonResolution {
        this.contexts.push(context);
        return this.current.explore(context, chance);
    }
}
