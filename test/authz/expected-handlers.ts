// whitelist enumerate (D-15): ogni nuova operazione admin o sul personaggio deve passare da qui
export const EXPECTED_INNKEEPER_HANDLERS = [
    'CharactersResolver.characters',
    'GuidedMissionResolver.discardMissionDraft',
    'GuidedMissionResolver.missionDraft',
    'GuidedMissionResolver.missionEnemies',
    'GuidedMissionResolver.startMissionDraft',
    'PendingQuestsResolver.pendingQuests',
    'PendingRequestsResolver.completePendingRequest',
    'PendingRequestsResolver.pendingRequests',
    'PendingRequestsResolver.pendingRequestsUpdated',
    'PushResolver.sendTestPush',
    'QuestGenerationResolver.generateQuests',
    'ShopAdminResolver.shopPoolReport',
    'TravelAdminResolver.teleportCharacter',
    'UsersResolver.user',
    'UsersResolver.users',
] as const;
export const EXPECTED_OWNERSHIP_HANDLERS = [
    'CharactersResolver.character',
    'CharactersResolver.characterUpdated',
    'CharactersResolver.doTransaction',
    'CharactersResolver.equipItem',
    'CharactersResolver.equipPet',
    'CharactersResolver.equipSpell',
    'CharactersResolver.equipment',
    'CharactersResolver.unequipPet',
    'CharactersResolver.unequipSpell',
    'CharactersResolver.useSpell',
    'PartyResolver.abandonQuest',
    'PendingQuestsResolver.pendingQuest',
    'QuestAcceptanceResolver.acceptQuest',
    'QuestAcceptanceResolver.questTravelPreview',
    'QuestResultsResolver.acknowledgeQuestResult',
    'QuestResultsResolver.questResult',
    'QuestResultsResolver.questResultReceived',
    'TravelResolver.startTravel',
    'TravelResolver.travelPreview',
] as const;
// nessun bypass innkeeper (07 D-11): ogni handler owner-only deve passare da qui
export const EXPECTED_OWNER_ONLY_HANDLERS = [
    'PartyResolver.abandonQuest',
    'QuestAcceptanceResolver.acceptQuest',
    'QuestAcceptanceResolver.questTravelPreview',
    'QuestResultsResolver.acknowledgeQuestResult',
    'QuestResultsResolver.questResult',
    'QuestResultsResolver.questResultReceived',
    'TravelResolver.startTravel',
    'TravelResolver.travelPreview',
] as const;

export type InnkeeperHandler = (typeof EXPECTED_INNKEEPER_HANDLERS)[number];
export type OwnershipHandler = (typeof EXPECTED_OWNERSHIP_HANDLERS)[number];
export type ProtectedHandler = InnkeeperHandler | OwnershipHandler;
