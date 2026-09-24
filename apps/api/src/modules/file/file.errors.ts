import { DomainError } from "../../common/errors";

// The file feature's domain errors. Every code here is listed in the contract
// header of src/__tests__/file.api.test.ts.

export class FileStorageNotConfiguredError extends DomainError {
  readonly kind = "unavailable";
  readonly code = "FILE_STORAGE_NOT_CONFIGURED";
  constructor() {
    super("SUPABASE_URL / SUPABASE_KEY are not set in apps/api/.env");
    this.name = "FileStorageNotConfiguredError";
  }
}

export class FileUrlNotDeletableError extends DomainError {
  readonly kind = "bad_request";
  readonly code = "FILE_URL_NOT_DELETABLE";
  constructor(url: string) {
    super(`${url} is not an upload of this API`);
    this.name = "FileUrlNotDeletableError";
  }
}

export class FileDeleteFailedError extends DomainError {
  readonly kind = "upstream";
  readonly code = "FILE_DELETE_FAILED";
  constructor(bucket: string, reason: string) {
    super(`Delete from bucket "${bucket}" failed: ${reason}`);
    this.name = "FileDeleteFailedError";
  }
}

export class FileUploadFailedError extends DomainError {
  readonly kind = "upstream";
  readonly code = "FILE_UPLOAD_FAILED";
  constructor(bucket: string, reason: string) {
    super(`Upload to bucket "${bucket}" failed: ${reason}`);
    this.name = "FileUploadFailedError";
  }
}
