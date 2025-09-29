import { registerEnumType } from "@nestjs/graphql";

export enum CityType {
  drusteaCity = "drusteaCity",
  drusteaVillage = "drusteaVillage",
  drusteaSeaCity = "drusteaSeaCity",
  drusteaCapital = "drusteaCapital",
  harkenCity = "harkenCity",
  necrorianCity = "necrorianCity",
  goblinVillage = "goblinVillage",
  aarakocraVillage = "aarakocraVillage",
  giantVillage = "giantVillage",
  orcVillage = "orcVillage",
  devilsCity = "devilsCity",
  elfCapital = "elfCapital",
  valanCapital = "valanCapital",
  valanVillage = "valanVillage",
  valanCity = "valanCity",
  mirwaCapital = "mirwaCapital",
  mirwaCity = "mirwaCity",
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

