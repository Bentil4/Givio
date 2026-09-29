import ngswConfig from '../../ngsw-config.json';

describe('ngsw-config dataGroups', () => {
  const dataGroupUrls = ngswConfig.dataGroups.flatMap((group) => group.urls);

  // Appwrite reads must reach the network or fail so data services fall back to Dexie; an ngsw
  // cache hit would be mistaken for fresh server state (overwriting local rows, skewing the
  // updatedAt conflict check) and is not partitioned per signed-in user.
  it('never caches Appwrite traffic', () => {
    expect(dataGroupUrls.some((url) => url.includes('appwrite'))).toBe(false);
  });

  it('caches the Google Fonts stylesheets and font files the app shell needs offline', () => {
    expect(dataGroupUrls).toEqual([
      'https://fonts.googleapis.com/**',
      'https://fonts.gstatic.com/**',
    ]);
  });

  it('never caches opaque responses, so a failed font fetch cannot be pinned in the cache', () => {
    expect(
      ngswConfig.dataGroups.every((group) => group.cacheConfig.cacheOpaqueResponses === false),
    ).toBe(true);
  });
});
