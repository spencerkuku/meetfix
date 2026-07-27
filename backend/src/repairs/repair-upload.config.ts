import type { Express } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  createPhotoUploadOptions,
  persistValidatedPhoto,
  photoUrl,
} from '../uploads/photo-upload.factory';

const SUBDIR = 'repairs';

export const repairPhotoUploadOptions: MulterOptions =
  createPhotoUploadOptions();

export function persistRepairPhoto(file: Express.Multer.File): Promise<string> {
  return persistValidatedPhoto(SUBDIR, file);
}

export function repairPhotoUrl(filename: string): string {
  return photoUrl(SUBDIR, filename);
}
