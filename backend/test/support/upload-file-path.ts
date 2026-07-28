import { join } from 'path';
import { API_PREFIX } from '../../src/bootstrap';

// The API_PREFIX lives in the imageUrl the server returns (e.g.
// '/api/uploads/rooms/x.png'), but the actual file on disk sits at
// 'uploads/rooms/x.png' — the prefix is a URL-routing concern only, not a
// filesystem path. Strip it back off to find the file to clean up.
export function uploadFilePath(imageUrl: string): string {
  return join(process.cwd(), imageUrl.replace(`/${API_PREFIX}`, ''));
}
