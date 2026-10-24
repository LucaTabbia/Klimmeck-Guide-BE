import { Injectable } from '@nestjs/common';
import type { PendingRequest } from 'src/models/pending-request.model';

@Injectable()
export class PendingRequestsService {
    list(): Promise<PendingRequest[]> {
        return Promise.resolve([]);
    }
}
