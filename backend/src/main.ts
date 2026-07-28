import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { serveUploads } from './uploads/serve-uploads';
import { setApiPrefix } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  setApiPrefix(app);
  // Deliberately unauthenticated: <img> tags can't send an Authorization
  // header, and uploaded photos (room photos, repair-ticket photos) aren't
  // sensitive data. Filenames are random UUIDs, so this is "unlisted", not
  // enumerable — but it does mean anyone with a URL can view a photo
  // without logging in, unlike every other endpoint in this API.
  serveUploads(app);
  const configService = app.get(ConfigService);
  await app.listen(configService.get('PORT') ?? 3000);
}
void bootstrap();
