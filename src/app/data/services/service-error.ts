/**
 * Domain-level error surfaced by every data-access service. These services catch
 * AppwriteException (or any other data-layer failure) and rethrow this instead, so
 * Presentation/Domain code never sees an Appwrite-shaped error.
 * [Source: ARCHITECTURE-SPINE.md — Consistency Conventions]
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
