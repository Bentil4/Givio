import { Client, Account, TablesDB, Permission, Role } from 'node-appwrite';
import { buildClient, verifyAdminCaller, hasValue, pageRows, samePermissions } from './shared.js';

const ACTIONS = ['recomputeAuditLogReadGrants'];

// Enough to diagnose a failed sweep from the response without echoing thousands of row ids.
const MAX_REPORTED_FAILURES = 20;

/**
 * AD-12 (amended 2026-10-07): who may read an audit_logs row. A company's entry (one with a
 * tenantId) is readable by nobody client-side — its Super Organizer reads it through
 * listTenantAuditLog, with this Function's API key — while a platform entry keeps the Admin
 * Label's read. Shared by every audit writer, here and in the app's audit-log-writer.ts.
 */
export function auditLogReadPermissions(tenantId) {
  return hasValue(tenantId) ? [] : [Permission.read(Role.label('admin'))];
}

/**
 * Admin-only backfill: `{ action: 'recomputeAuditLogReadGrants' }` rewrites every existing
 * audit_logs row's permissions by auditLogReadPermissions. Idempotent — a row already in line
 * is not rewritten. 502 with the report when any row could not be updated.
 *
 * ClientCtor/AccountCtor/DatabasesCtor are injectable so tests can substitute fakes.
 */
export async function handleAuditLogGrantsRequest({
  req,
  res,
  log,
  error,
  ClientCtor = Client,
  AccountCtor = Account,
  DatabasesCtor = TablesDB,
}) {
  const request = await prepareRequest({ req, ClientCtor, AccountCtor, error });
  if (request.errorResponse) {
    return res.json(request.errorResponse.body, request.errorResponse.status);
  }
  const report = await recomputeAuditLogReadGrants({ ...request, DatabasesCtor, error });
  log(
    `recomputeAuditLogReadGrants (by admin ${request.caller.$id}): ${report.rowsScanned} ` +
      `scanned, ${report.rowsUpdated} updated, ${report.failureCount} failed`,
  );
  return res.json(
    { success: report.failureCount === 0, ...report },
    report.failureCount ? 502 : 200,
  );
}

async function prepareRequest({ req, ClientCtor, AccountCtor, error }) {
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT;
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;
  const verified = await verifyAdminCaller({
    req,
    ClientCtor,
    AccountCtor,
    endpoint,
    projectId,
    error,
  });
  if (verified.errorResponse) {
    return verified;
  }
  const dynamicKey = req.headers['x-appwrite-key'];
  if (!dynamicKey || !hasValue(auditLogsTableId()) || !hasValue(process.env.APPWRITE_DATABASE_ID)) {
    error('recomputeAuditLogReadGrants: missing execution API key or audit_logs table ID.');
    return { errorResponse: { status: 500, body: { error: 'Server misconfiguration' } } };
  }
  const adminClient = buildClient(ClientCtor, endpoint, projectId).setKey(dynamicKey);
  return { caller: verified.caller, adminClient };
}

function auditLogsTableId() {
  return process.env.APPWRITE_AUDIT_LOGS_COLLECTION_ID;
}

async function recomputeAuditLogReadGrants({ DatabasesCtor, adminClient, error }) {
  const report = { rowsScanned: 0, rowsUpdated: 0, failureCount: 0, failures: [] };
  const databases = new DatabasesCtor(adminClient);
  try {
    for await (const rows of auditLogPages({ DatabasesCtor, adminClient })) {
      await realignAuditRows({ databases, rows, report, error });
    }
  } catch (err) {
    recordFailure(report, error, { rowId: null, reason: err.message });
  }
  return report;
}

function auditLogPages({ DatabasesCtor, adminClient }) {
  return pageRows({
    DatabasesCtor,
    adminClient,
    databaseId: process.env.APPWRITE_DATABASE_ID,
    tableId: auditLogsTableId(),
    queries: [],
  });
}

async function realignAuditRows({ databases, rows, report, error }) {
  for (const row of rows) {
    report.rowsScanned += 1;
    await realignAuditRow({ databases, row, report, error });
  }
}

async function realignAuditRow({ databases, row, report, error }) {
  const permissions = auditLogReadPermissions(row.tenantId);
  if (samePermissions(row.$permissions, permissions)) {
    return;
  }
  try {
    await databases.updateRow({
      databaseId: process.env.APPWRITE_DATABASE_ID,
      tableId: auditLogsTableId(),
      rowId: row.$id,
      data: {},
      permissions,
    });
    report.rowsUpdated += 1;
  } catch (err) {
    recordFailure(report, error, { rowId: row.$id, reason: err.message });
  }
}

function recordFailure(report, error, failure) {
  error(`recomputeAuditLogReadGrants: row ${failure.rowId}: ${failure.reason}`);
  report.failureCount += 1;
  if (report.failures.length < MAX_REPORTED_FAILURES) {
    report.failures.push(failure);
  }
}

export { ACTIONS as AUDIT_LOG_GRANT_ACTIONS };
