import mongoose, { Model } from 'mongoose';
import { SessionRevokeReason } from 'src/auth/session/session-revoke-reason.enum';
import {
    Session,
    SessionDocument,
    SessionSchema,
} from 'src/auth/session/session.model';
import { buildSession } from '../../../test/fixtures/session.fixture';

const SessionModel: Model<SessionDocument> =
    mongoose.models.Session || mongoose.model(Session.name, SessionSchema);

describe('Session model', () => {
    it('pins the four revoke reasons of the contract (D-05)', () => {
        expect(Object.values(SessionRevokeReason)).toEqual([
            'newLogin',
            'roleChanged',
            'reuseDetected',
            'userLogout',
        ]);
    });

    it('stores the revoke reason as a nullable enum next to revokedAt (D-08)', () => {
        const options = SessionSchema.path('revokeReason').options as {
            default: unknown;
            enum: unknown;
        };

        expect(options.default).toBeNull();
        expect(options.enum).toEqual(Object.values(SessionRevokeReason));
    });

    it('rejects a value outside the enum when a session is validated (D-08)', () => {
        const session = new SessionModel(buildSession({ revokeReason: 'zzz' }));

        expect(session.validateSync()?.errors.revokeReason).toBeDefined();
    });

    it('accepts a session without a revoke reason (D-11)', () => {
        const session = new SessionModel(buildSession());

        expect(session.validateSync()).toBeUndefined();
    });
});
