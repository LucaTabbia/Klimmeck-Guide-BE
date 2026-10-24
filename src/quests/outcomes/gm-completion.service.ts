import { Injectable } from '@nestjs/common';
import type { Types } from 'mongoose';
import type { CompletePendingRequestInput } from 'src/models/request/complete-pending-request.model';

@Injectable()
export class GmCompletionService {
    complete(_input: CompletePendingRequestInput): Promise<Types.ObjectId[]> {
        throw new Error('not implemented');
    }
}
