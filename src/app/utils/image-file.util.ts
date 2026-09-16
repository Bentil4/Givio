const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1024;
const DEFAULT_QUALITY = 0.75;

export interface ResizeImageOptions {
  maxDimension?: number;
  quality?: number;
}

/**
 * Reads an image file, downscales it to fit within `maxDimension` (preserving aspect ratio),
 * and re-encodes it as JPEG. Output is always JPEG so callers (e.g. the receipt PDF) never
 * need to sniff the format back out of the data URL.
 */
export async function readAndResizeImage(
  file: File,
  opts: ResizeImageOptions = {},
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Image is too large — please choose a file under 8MB.');
  }

  const maxDimension = opts.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not process the selected image.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}
