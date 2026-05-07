/**
 * Custom error subclasses for the filesystem store. They preserve `cause` so
 * upstream loggers can include the underlying ENOENT / EEXIST.
 */

export class FsStoreError extends Error {
  override readonly name: string = 'FsStoreError';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class PathOutsideRootError extends FsStoreError {
  override readonly name = 'PathOutsideRootError';
}

export class TransactionPreparedOnlyError extends FsStoreError {
  override readonly name = 'TransactionPreparedOnlyError';
  constructor(public readonly txId: string) {
    super(`transaction ${txId} is prepared but not committed`);
  }
}

export class LockNotAcquiredError extends FsStoreError {
  override readonly name = 'LockNotAcquiredError';
  constructor(public readonly path: string, public readonly heldBy: unknown) {
    super(`lock at ${path} is held: ${JSON.stringify(heldBy)}`);
  }
}

export class StaleLeaseError extends FsStoreError {
  override readonly name = 'StaleLeaseError';
}

export class ExclusiveCreateConflictError extends FsStoreError {
  override readonly name = 'ExclusiveCreateConflictError';
  constructor(public readonly path: string) {
    super(`file already exists: ${path}`);
  }
}
