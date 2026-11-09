// motivo della revoca di una sessione (Phase 17 D-05): viaggia solo nelle extensions del rifiuto
// del refresh e nella reason del close WS 4409, mai nello schema GraphQL
export enum SessionRevokeReason {
    newLogin = 'newLogin',
    roleChanged = 'roleChanged',
    reuseDetected = 'reuseDetected',
    userLogout = 'userLogout',
}
