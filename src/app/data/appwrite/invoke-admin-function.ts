import { Functions, type Models } from 'appwrite';
import { ServiceError } from '../../core/services/service-error';
import { environment } from '../../../environments/environment';

interface FunctionErrorBody {
  error?: string;
}

/** The Function ran and answered with a non-2xx status — kept so callers can tell a
 *  definitive rejection (4xx) from a transient server failure (5xx). */
export class FunctionRejectedError extends ServiceError {
  constructor(
    message: string,
    cause: unknown,
    public readonly status: number,
  ) {
    super(message, cause);
    this.name = 'FunctionRejectedError';
  }
}

export interface AdminFunctionRequest {
  action: string;
  /** ServiceError message when the Function can't be reached at all. */
  invokeFailureMessage: string;
  payload: object;
}

/**
 * Calls the one trusted Appwrite Function (AD-9) that writes user Labels and, per Story 2.3,
 * Event.assignedUserIds + the Appwrite permissions derived from it (AD-2). Shared by every
 * data-layer service that needs it (UserService, EventDataService) so the
 * execute/parse/error-shape logic exists exactly once.
 */
export async function invokeAdminFunction<T>(
  functions: Functions,
  request: AdminFunctionRequest,
): Promise<T> {
  const execution = await executeAdminFunction(functions, request);
  const parsedBody = parseBody(execution.responseBody);
  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    throw rejectionFrom(execution, parsedBody);
  }
  return parsedBody as T;
}

async function executeAdminFunction(
  functions: Functions,
  { action, invokeFailureMessage, payload }: AdminFunctionRequest,
): Promise<Models.Execution> {
  try {
    return await functions.createExecution({
      functionId: environment.setRoleFunctionId,
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (error) {
    throw new ServiceError(invokeFailureMessage, error);
  }
}

function rejectionFrom(execution: Models.Execution, parsedBody: unknown): FunctionRejectedError {
  const message =
    (parsedBody as FunctionErrorBody | undefined)?.error ??
    `Function rejected the request (status ${execution.responseStatusCode})`;
  return new FunctionRejectedError(message, execution.responseBody, execution.responseStatusCode);
}

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
