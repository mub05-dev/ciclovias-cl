import {
  IsInt,
  IsIn,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const TYPES = ['protected', 'painted', 'shared', 'unprotected'] as const;
const CONDITIONS = ['good', 'fair', 'poor'] as const;

export class CreateSegmentReportDto {
  @IsInt()
  edgeId: number;

  @IsIn(TYPES)
  type: (typeof TYPES)[number];

  @IsIn(CONDITIONS)
  condition: (typeof CONDITIONS)[number];

  @IsOptional()
  @IsBoolean()
  lit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateSegmentReportDto {
  @IsOptional()
  @IsIn(TYPES)
  type?: (typeof TYPES)[number];

  @IsOptional()
  @IsIn(CONDITIONS)
  condition?: (typeof CONDITIONS)[number];

  @IsOptional()
  @IsBoolean()
  lit?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
