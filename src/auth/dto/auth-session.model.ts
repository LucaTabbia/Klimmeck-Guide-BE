import { Field, ObjectType } from '@nestjs/graphql';
import { User } from 'src/models/user.model';

@ObjectType()
export class AuthSession {
    @Field(() => String)
    accessToken: string;

    @Field(() => Date)
    accessTokenExpiresAt: Date;

    @Field(() => String)
    refreshToken: string;

    @Field(() => User)
    user: User;
}
