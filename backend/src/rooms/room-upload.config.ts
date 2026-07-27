import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'rooms');

export const roomPhotoUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
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

export function roomPhotoUrl(filename: string): string {
  return `/uploads/rooms/${filename}`;
}
