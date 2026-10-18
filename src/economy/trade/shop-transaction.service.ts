import { Injectable } from '@nestjs/common';
import type { CommonResponse } from 'src/models/common/common-response.model';
import type { TransactionRequest } from 'src/models/request/transaction-request.model';

@Injectable()
export class ShopTransactionService {
    execute(request: TransactionRequest): Promise<CommonResponse> {
        return Promise.reject(
            new Error(`execute: not implemented (${request.id})`),
        );
    }
}
