export enum OwnedResource {
    character = 'Character',
    pendingQuest = 'PendingQuest',
}

export enum ResourceAccess {
    owner = 'owner',
    onBehalf = 'onBehalf',
}

export interface OnBehalfTarget {
    type: OwnedResource;
    id: string;
}
