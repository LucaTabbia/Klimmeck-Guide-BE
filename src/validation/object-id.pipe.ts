import { Injectable } from '@nestjs/common';
import type { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { isObjectIdHex } from 'src/mongo/document-id';
import { BadUserInputException } from 'src/validation/bad-user-input.exception';

export const MAX_ID_LIST = 100;

function isIdHex(value: unknown): value is string {
    return typeof value === 'string' && isObjectIdHex(value);
}

function fieldOf(metadata: ArgumentMetadata, fallback: string): string {
    return metadata.data ?? fallback;
}

// argomenti scalari @Args('id', ObjectIdPipe): la pipe globale non vede gli scalari (D-02)
@Injectable()
export class ObjectIdPipe implements PipeTransform<unknown, string> {
    transform(value: unknown, metadata: ArgumentMetadata): string {
        if (isIdHex(value)) return value;
        throw new BadUserInputException([fieldOf(metadata, 'id')]);
    }
}

// liste di id: al più MAX_ID_LIST elementi, ognuno esadecimale minuscolo a 24 (D-02, D-04)
@Injectable()
export class ObjectIdListPipe implements PipeTransform<unknown, string[]> {
    transform(value: unknown, metadata: ArgumentMetadata): string[] {
        if (
            Array.isArray(value) &&
            value.length <= MAX_ID_LIST &&
            value.every(isIdHex)
        ) {
            return value;
        }
        throw new BadUserInputException([fieldOf(metadata, 'ids')]);
    }
}
