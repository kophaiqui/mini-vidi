import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LIMITS } from '../config/limits';

export class ClipDto {
  @IsNumber()
  @Min(0)
  start: number;

  @IsNumber()
  @Min(0)
  end: number;
}

export class ExportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.MAX_CLIPS)
  @ValidateNested({ each: true })
  @Type(() => ClipDto)
  clips: ClipDto[];

  @IsIn(['cut', 'fade'])
  transition: 'cut' | 'fade';

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(LIMITS.MAX_TRANSITION_DURATION)
  fadeDuration?: number;
}
