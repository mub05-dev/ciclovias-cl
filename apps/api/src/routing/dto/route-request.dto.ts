import { IsEnum, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum RouteMode {
  SHORT = 'short',
  SAFE = 'safe',
  FLAT = 'flat',
  BALANCED = 'balanced',
}

export class CoordinateDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon: number;
}

export class RouteRequestDto {
  @ValidateNested()
  @Type(() => CoordinateDto)
  origin: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  destination: CoordinateDto;

  @IsEnum(RouteMode)
  mode: RouteMode;
}