import { registerEnumType } from '@nestjs/graphql';


export enum CitySizeType { capital, city, village }

registerEnumType(CitySizeType, { name: 'CitySizeType' });
