import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PointOfInterest, PointOfInterestDocument } from 'src/models/point-of-interest.model';

@Injectable()
export class PointOfInterestsService {
    constructor(@InjectModel(PointOfInterest.name) private pointOfInterestModel: Model<PointOfInterestDocument>) { }

    async findAll(): Promise<PointOfInterest[]> {
        return await this.pointOfInterestModel.find().exec();
    }

    async findOne(id: string): Promise<PointOfInterest> {
        const pointOfInterest = await this.pointOfInterestModel.findById(id).exec();
        if (!pointOfInterest) throw new NotFoundException(`PointOfInterest with id ${id} not found`);
        return pointOfInterest;
    }
}
