import { registerEnumType } from "@nestjs/graphql";

export enum CityType {
  drusteaCity = "drusteaCity",
  drusteaVillage = "drusteaVillage",
  drusteaSeaCity = "drusteaSeaCity",
  drusteaCapital = "drusteaCapital",
  ferrionCity = "ferrionCity",
  necrorianCity = "necrorianCity",
  aarakocraVillage = "aarakocraVillage",
  elfCapital = "elfCapital",
  valanCapital = "valanCapital",
  valanVillage = "valanVillage",
  valanCity = "valanCity",
  valanSeaCity = "valanSeaCity",
  mirwaCapital = "mirwaCapital",
  mirwaCity = "mirwaCity",
  mirwaSeaCity = "mirwaSeaCity",
  mirwaVillage = "mirwaVillage",
  desertVillage = "desertVillage",
  tropicalVillage = "tropicalVillage",
  mountainVillage = "mountainVillage",
  northVillage = "northVillage",
  forestVillage = "forestVillage",
  flameNorthCapital = "flameNorthCapital",
  flameCenterCapital = "flameCenterCapital",
  flameSouthCapital = "flameSouthCapital",
  flameCity = "flameCity",
  flameVillage = "flameVillage",
  motherCapital = "motherCapital",
  motherCity = "motherCity",
  motherVillage = "motherVillage",
  liberiaCapital = "liberiaCapital",
  liberiaCity = "liberiaCity",
  liberiaVillage = "liberiaVillage",
  talmvereVillage = "talmvereVillage",
}


registerEnumType(CityType, { name: 'CityType' });

