import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City } from 'src/models/city.model';

@Injectable()
export class CitiesService {
    constructor(@InjectModel(City.name) private cityModel: Model<City>) { }

    async findAll(): Promise<City[]> {
        return await this.cityModel.find()
            .populate('relatedLore')
            .populate('markerLocation')
            .exec();
    }

    async findOne(id: string): Promise<City> {
        const city = await this.cityModel.findById(id)
            .populate('relatedLore')
            .populate('markerLocation')
            .populate({
                path: 'pointsOfInterest',
                populate: { path: 'quest' }
            })
            .exec();

        if (!city) {
            throw new NotFoundException(`City with id ${id} not found`);
        }
        return city;
    }
}
