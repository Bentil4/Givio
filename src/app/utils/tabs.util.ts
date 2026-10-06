/** WAI-ARIA tabs: the tab an arrow, Home or End key moves to; undefined for any other key. */
export function tabIndexForKey(key: string, index: number, count: number): number | undefined {
  const targets: Record<string, number> = {
    ArrowRight: (index + 1) % count,
    ArrowLeft: (index - 1 + count) % count,
    Home: 0,
    End: count - 1,
  };
  return targets[key];
}
