import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import {
  createPhotoUploadOptions,
  photoUrl,
} from '../uploads/photo-upload.factory';

export const repairPhotoUploadOptions: MulterOptions =
  createPhotoUploadOptions('repairs');

export function repairPhotoUrl(filename: string): string {
  return photoUrl('repairs', filename);
}
