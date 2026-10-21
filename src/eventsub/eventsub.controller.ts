import { Controller, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';
import { EventSubWebhookService } from 'src/eventsub/eventsub-webhook.service';

@Controller('webhooks/twitch')
export class EventSubController {
    constructor(private readonly webhook: EventSubWebhookService) {}

    // decoratore pubblico solo sull'handler (Phase 2 D-12): la fiducia è la firma HMAC, verificata nel service
    @Public()
    @Post('eventsub')
    async receive(
        @Req() req: RawBodyRequest<Request>,
        @Res() res: Response,
    ): Promise<void> {
        const reply = await this.webhook.handle(
            req.headers,
            req.rawBody,
            req.body,
        );
        switch (reply.kind) {
            case 'challenge':
                res.status(HttpStatus.OK)
                    .type('text/plain')
                    .send(reply.challenge);
                return;
            case 'noContent':
                res.status(HttpStatus.NO_CONTENT).end();
                return;
            case 'forbidden':
                res.status(HttpStatus.FORBIDDEN).end();
                return;
            case 'retryLater':
                res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
        }
    }
}
