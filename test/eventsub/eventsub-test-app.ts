import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EVENTSUB_CONFIG } from 'src/config/eventsub-config';
import type { EventSubConfig } from 'src/config/eventsub-config';
import type { ThrottleConfig } from 'src/config/throttle-config';
import { PUSH_CONFIG } from 'src/config/push-config';
import { EventSubModule } from 'src/eventsub/eventsub.module';
import { TwitchHelixClient } from 'src/eventsub/helix/twitch-helix.client';
import { EventSubSubscriptionManager } from 'src/eventsub/subscriptions/eventsub-subscription.manager';
import { PushTransport } from 'src/push/transport/push-transport';
import { AuthTestApp, createAuthTestApp } from '../auth/auth-test-app';
import { FakePushTransport } from '../push/fake-push-transport';
import type { SignedEventSubRequest } from './eventsub-fixtures';
import { FakeTwitchHelixClient } from './fake-twitch-helix.client';
import { buildTestEventSubConfig } from './test-eventsub-config';

export const EVENTSUB_WEBHOOK_PATH = '/webhooks/twitch/eventsub';

export interface EventSubTestAppOptions {
    throttle?: Partial<ThrottleConfig>;
}

export interface EventSubTestApp extends AuthTestApp {
    helix: FakeTwitchHelixClient;
    push: FakePushTransport;
    manager: EventSubSubscriptionManager;
}

// EventSubModule sul vero stack Nest: Helix e FCM finti, nessuna rete; il reconcile di boot è drenato prima dei test
export async function createEventSubTestApp(
    config: EventSubConfig = buildTestEventSubConfig(),
    options: EventSubTestAppOptions = {},
): Promise<EventSubTestApp> {
    const helix = new FakeTwitchHelixClient();
    const push = new FakePushTransport();
    const harness = await createAuthTestApp({
        imports: [EventSubModule],
        throttle: options.throttle,
        overrides: [
            { token: EVENTSUB_CONFIG, useValue: config },
            { token: TwitchHelixClient, useValue: helix },
            { token: PushTransport, useValue: push },
            { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
        ],
    });
    const manager = harness.app.get(EventSubSubscriptionManager);
    await manager.reconcile();
    return { ...harness, helix, push, manager };
}

export function postEventSub(
    app: INestApplication,
    signed: SignedEventSubRequest,
    contentType = 'application/json',
): request.Test {
    return request(app.getHttpServer())
        .post(EVENTSUB_WEBHOOK_PATH)
        .set(signed.headers)
        .set('Content-Type', contentType)
        .send(signed.body);
}
