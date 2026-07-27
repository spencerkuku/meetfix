import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

// Shared local-disk photo upload config (per ADR-0004) for any feature that
// accepts a single image upload (Room photos, Repair Ticket photos, ...).
export function createPhotoUploadOptions(subdir: string): MulterOptions {
  const uploadDir = join(process.cwd(), 'uploads', subdir);
  return {
    storage: diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new BadRequestException('Only image uploads are allowed'), false);
        return;
      }
      cb(null, true);
    },
  };
}

export function photoUrl(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}
