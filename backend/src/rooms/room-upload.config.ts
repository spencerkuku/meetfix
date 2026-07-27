import type { Express } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  createPhotoUploadOptions,
  persistValidatedPhoto,
  photoUrl,
} from '../uploads/photo-upload.factory';

const SUBDIR = 'rooms';

export const roomPhotoUploadOptions: MulterOptions = createPhotoUploadOptions();

export function persistRoomPhoto(file: Express.Multer.File): Promise<string> {
  return persistValidatedPhoto(SUBDIR, file);
}

export function roomPhotoUrl(filename: string): string {
  return photoUrl(SUBDIR, filename);
}
