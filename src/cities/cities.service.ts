import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City, CityDocument } from 'src/models/city.model';

@Injectable()
export class CitiesService {
    constructor(@InjectModel(City.name) private cityModel: Model<CityDocument>) { }

    async findAll(): Promise<City[]> {
        const cities = await this.cityModel.find().exec();
        console.log(cities)
        return cities
    }

    async findOne(id: string): Promise<City> {
        const city = await this.cityModel.findById(id).exec();
        if (!city) throw new NotFoundException(`City with id ${id} not found`);
        return city;
    }
}
