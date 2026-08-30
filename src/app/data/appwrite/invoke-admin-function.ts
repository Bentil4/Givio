import { Functions } from 'appwrite';
import { ServiceError } from '../services/service-error';
import { environment } from '../../../environments/environment';

interface FunctionErrorBody {
  error?: string;
}

/**
 * Calls the one trusted Appwrite Function (AD-9) that writes user Labels and, per Story 2.3,
 * Event.assignedUserIds + the Appwrite permissions derived from it (AD-2). Shared by every
 * data-layer service that needs it (UserService, EventDataService) so the
 * execute/parse/error-shape logic exists exactly once.
 */
export async function invokeAdminFunction<T>(
  functions: Functions,
  action: string,
  invokeFailureMessage: string,
  payload: object,
): Promise<T> {
  let execution;
  try {
    execution = await functions.createExecution({
      functionId: environment.setRoleFunctionId,
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (error) {
    throw new ServiceError(invokeFailureMessage, error);
  }

  const parsedBody = parseBody(execution.responseBody);

  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    const message =
      (parsedBody as FunctionErrorBody | undefined)?.error ??
      `Function rejected the request (status ${execution.responseStatusCode})`;
    throw new ServiceError(message, execution.responseBody);
  }

  return parsedBody as T;
}

function parseBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
