import { registerEnumType } from '@nestjs/graphql';

export enum CitySize {
    village = 'village',
    city = 'city',
    capital = 'capital',
}

registerEnumType(CitySize, { name: 'CitySize' });
