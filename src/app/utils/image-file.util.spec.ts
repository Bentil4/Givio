import { readAndResizeImage } from './image-file.util';

function makeFile(opts: { type?: string; size?: number } = {}): File {
  const size = opts.size ?? 10;
  return new File([new Uint8Array(size)], 'photo.jpg', { type: opts.type ?? 'image/jpeg' });
}

describe('readAndResizeImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a non-image file', async () => {
    await expect(readAndResizeImage(makeFile({ type: 'text/plain' }))).rejects.toThrow(
      /image file/i,
    );
  });

  it('rejects a file over 8MB', async () => {
    await expect(readAndResizeImage(makeFile({ size: 9 * 1024 * 1024 }))).rejects.toThrow(
      /too large/i,
    );
  });

  it('downscales to fit maxDimension, preserving aspect ratio, and returns a JPEG data URL', async () => {
    const bitmap = { width: 2000, height: 1000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,mock');

    const result = await readAndResizeImage(makeFile(), { maxDimension: 500, quality: 0.5 });

    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 500, 250);
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.5);
    expect(result).toBe('data:image/jpeg;base64,mock');
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('does not upscale an image already smaller than maxDimension', async () => {
    const bitmap = { width: 200, height: 100, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));

    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,x');

    await readAndResizeImage(makeFile(), { maxDimension: 1024 });

    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 200, 100);
  });
});
