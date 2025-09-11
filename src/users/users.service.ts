import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserInput } from 'src/models/user.model';

@Injectable()
export class UsersService {
    constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) { }

    async findAll(): Promise<User[]> {
        return await this.userModel.find().populate('currentCharacter').exec();
    }

    async findOne(id: string): Promise<User> {
        const user = await this.userModel.findById(id).populate('currentCharacter').exec();
        if (!user) throw new NotFoundException(`User with id ${id} not found`);
        return user;
    }

    async create(userData: Partial<UserInput>): Promise<User> {
        const createdUser = new this.userModel(userData);
        return await createdUser.save();
    }

    async update(updatedUser: Partial<UserInput>): Promise<User> {
        const user = await this.userModel.findByIdAndUpdate(updatedUser.id, updatedUser, { new: true }).exec();
        if (!user) throw new NotFoundException(`User with id ${updatedUser.id} not found`);
        return user;
    }

    async delete(id: string): Promise<User> {
        const user = await this.userModel.findByIdAndDelete(id).exec();
        if (!user) throw new NotFoundException(`User with id ${id} not found`);
        return user;
    }
}
