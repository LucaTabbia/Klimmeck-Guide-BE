import { registerEnumType } from '@nestjs/graphql';

// Phase 9 aggiungerà combatResult (deferred)
export enum PushEventType {
    travelEnd = 'travelEnd',
    questEnd = 'questEnd',
    streamerLive = 'streamerLive',
    // party sciolto dopo 24 ore senza posti pieni (utente 2026-10-25)
    questCancelled = 'questCancelled',
    // sconfitta in imboscata (Phase 15 D-12): non parte più dalla Phase 23 (D-30), resta per sendTestPush
    ambushDefeat = 'ambushDefeat',
    // fine della prigione dopo l'arresto (quick 261110-prp): personale, id = personaggio
    prisonRelease = 'prisonRelease',
    // l'oste avvia il flusso guidato di una story o worldMission (utente 2026-11-14): personale, id = personaggio
    missionStart = 'missionStart',
    // compagno sconfitto di nuovo a vita piena (D-11): personale, id = pet a catalogo
    petRecovered = 'petRecovered',
    // ogni imboscata subita, vinta o persa (D-14, D-30); ambushDefeat resta nell'enum ma non parte più
    ambush = 'ambush',
    // fine della «Fase di ricerca» con una magia trovata (Phase 24 D-29, D-31): personale, id = QuestResult della ricerca
    spellResearchSucceeded = 'spellResearchSucceeded',
    // fine di una ricerca senza magia (Phase 24 D-29): personale, id = QuestResult, al posto di questEnd
    spellResearchFailed = 'spellResearchFailed',
}

registerEnumType(PushEventType, { name: 'PushEventType' });
