import type { GraphQLResolveInfo } from 'graphql';
import { AuthorizationDecisions } from 'src/authz/ownership/authorization-decisions';
import { OwnedResource } from 'src/authz/ownership/owned-resource';

function buildInfo(): GraphQLResolveInfo {
    return {} as GraphQLResolveInfo;
}

describe('AuthorizationDecisions', () => {
    let decisions: AuthorizationDecisions;

    beforeEach(() => {
        decisions = new AuthorizationDecisions();
    });

    it('returns the on-behalf target recorded for the same resolve info', () => {
        const info = buildInfo();

        decisions.recordOnBehalf(info, {
            type: OwnedResource.character,
            id: 'x',
        });

        expect(decisions.onBehalfTargetOf(info)).toEqual({
            type: 'Character',
            id: 'x',
        });
    });

    it('keeps the decisions of different resolve infos apart', () => {
        decisions.recordOnBehalf(buildInfo(), {
            type: OwnedResource.character,
            id: 'x',
        });

        expect(decisions.onBehalfTargetOf(buildInfo())).toBeUndefined();
    });
});
