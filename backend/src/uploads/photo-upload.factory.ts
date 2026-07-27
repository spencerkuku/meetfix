import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { memoryStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import type { Express } from 'express';

// Only formats we can safely serve as a static <img> source. Anything else
// (notably image/svg+xml, which can carry a <script>) is rejected outright —
// see the security audit finding this closes. Detection is by magic bytes,
// never by the client-declared mimetype or the original filename's
// extension, both of which are attacker-controlled.
interface DetectedImage {
  ext: 'png' | 'jpg' | 'webp';
}

function detectImageType(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: 'png' };
  }
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { ext: 'jpg' };
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp' };
  }
  return null;
}

// Shared local-disk photo upload config (per ADR-0004) for any feature that
// accepts a single image upload (Room photos, Repair Ticket photos, ...).
//
// Content is buffered in memory rather than streamed straight to disk, because
// the actual image format can only be verified once the bytes are in hand —
// the client-declared mimetype and the original filename's extension are both
// attacker-controlled and are never trusted for validation or for naming the
// stored file.
export function createPhotoUploadOptions(): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  };
}

// Validates the uploaded buffer's actual content (magic bytes) against an
// allowlist of safe-to-serve image formats, then persists it to disk under a
// random filename with the extension derived from the *detected* type.
export async function persistValidatedPhoto(
  subdir: string,
  file: Express.Multer.File,
): Promise<string> {
  const detected = detectImageType(file.buffer);

  if (!detected) {
    throw new BadRequestException(
      'Only genuine JPEG, PNG, or WebP images are allowed',
    );
  }

  const uploadDir = join(process.cwd(), 'uploads', subdir);
  await mkdir(uploadDir, { recursive: true });
  const filename = `${randomUUID()}.${detected.ext}`;
  await writeFile(join(uploadDir, filename), file.buffer);
  return filename;
}

export function photoUrl(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}
