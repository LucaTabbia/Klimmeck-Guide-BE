import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { UsersService } from './users.service';
import { User, UserInput } from 'src/models/user.model';

@Resolver(() => User)
export class UsersResolver {
    constructor(private usersService: UsersService) { }

    @Query(() => [User])
    async users(): Promise<User[]> {
        return this.usersService.findAll();
    }

    @Query(() => User)
    async user(@Args('id') id: string): Promise<User> {
        return this.usersService.findOne(id);
    }

    @Mutation(() => User)
    async createUser(@Args('user') user: UserInput): Promise<User> {
        return this.usersService.create(user);
    }

    @Mutation(() => User)
    async updateUser(
        @Args('user') user: UserInput,
    ): Promise<User> {
        return this.usersService.update(user);
    }

    @Mutation(() => User)
    async deleteUser(@Args('id') id: string): Promise<User> {
        return this.usersService.delete(id);
    }
}
