import {
    Args,
    Field,
    InputType,
    Int,
    Mutation,
    Query,
    Resolver,
} from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsInt,
    Min,
    ValidateNested,
} from 'class-validator';
import { Public } from 'src/auth/decorators/public.decorator';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';
import { ObjectIdPipe } from 'src/validation/object-id.pipe';

@InputType()
export class ValidationProbeItem {
    @Field()
    @IsObjectIdHex()
    item!: string;

    @Field(() => Int)
    @IsInt()
    @Min(0)
    quantity!: number;
}

@InputType()
export class ValidationProbeInput {
    @Field()
    @IsObjectIdHex()
    id!: string;

    // nessun decoratore class-validator: con whitelist deve sparire prima dell'handler
    @Field({ nullable: true })
    legacy?: string;

    @Field(() => [ValidationProbeItem])
    @IsArray()
    @ArrayMaxSize(2)
    @ValidateNested({ each: true })
    @Type(() => ValidationProbeItem)
    items!: ValidationProbeItem[];
}

@InputType()
export class UndecoratedProbeInput {
    @Field({ nullable: true })
    note?: string;
}

function sortedKeysOf(input: object): string {
    return JSON.stringify(Object.keys(input).sort());
}

// sonda solo-test: mai registrata in src; restituisce le chiavi che l'handler riceve dopo la pipe globale
@Resolver()
export class ValidationProbeResolver {
    @Public()
    @Mutation(() => String)
    probeValidation(@Args('input') input: ValidationProbeInput): string {
        return sortedKeysOf(input);
    }

    @Public()
    @Mutation(() => String)
    probeUndecorated(@Args('input') input: UndecoratedProbeInput): string {
        return sortedKeysOf(input);
    }

    @Public()
    @Query(() => String)
    probeId(@Args('id', ObjectIdPipe) id: string): string {
        return id;
    }
}
