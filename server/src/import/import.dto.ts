import { IsString, Matches } from 'class-validator';

const YOUTUBE_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/i;

export class ImportDto {
  @IsString()
  @Matches(YOUTUBE_RE, { message: 'A valid YouTube URL is required.' })
  url: string;
}
