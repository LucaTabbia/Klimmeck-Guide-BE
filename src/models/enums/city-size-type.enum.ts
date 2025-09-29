import { registerEnumType } from '@nestjs/graphql';


export enum CitySizeType {
    capital = "capital",
    city = "city",
    village = "village",
}

registerEnumType(CitySizeType, { name: 'CitySizeType' });
