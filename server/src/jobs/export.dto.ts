import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LIMITS } from '../config/limits';

export class ClipDto {
  // Client-side key for React lists; the backend ignores it but accepts it so
  // the whitelist validator doesn't reject the payload.
  @IsOptional()
  @IsString()
  id?: string;

  @IsNumber()
  @Min(0)
  start: number;

  @IsNumber()
  @Min(0)
  end: number;

  /**
   * Transition into the *next* clip. A transition belongs to the boundary
   * between two clips, so this is set on every clip except the last (where it
   * is ignored). Omitted means a hard cut.
   */
  @IsOptional()
  @IsIn(['cut', 'fade'])
  transitionAfter?: 'cut' | 'fade';
}

export class ExportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.MAX_CLIPS)
  @ValidateNested({ each: true })
  @Type(() => ClipDto)
  clips: ClipDto[];

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(LIMITS.MAX_TRANSITION_DURATION)
  fadeDuration?: number;
}
