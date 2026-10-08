# Givio operations runbook

Things that live in consoles and settings rather than in code. Tick them off and add the date.

## 1. Lock down the Appwrite accounts

- [ ] Turn on TOTP multi-factor authentication for every Admin and Super Admin Appwrite account (Account > Security in the app's Appwrite project, and the personal console accounts of everyone with Console access).
- [ ] List who is in the Appwrite organisation and project teams. Remove anyone who no longer needs Console access; keep Owner/Developer roles to the fewest people.
- [ ] Confirm exactly one account carries the `superadmin` label. Write down who takes over if that person is unavailable, because no in-app path grants it.

## 2. Uptime and smoke check for the Function

The Function `set-role-and-permissions` is the only writer of roles and permissions, so a silent outage would go unnoticed.

- [ ] Add a scheduled GitHub Actions workflow (cron every 15 minutes) that calls a harmless Function action and fails if the answer is not the expected one. Use an action that needs no secrets, such as a request that returns a clean 400/401 JSON error, so a 5xx or a timeout is the failure signal.
- [ ] Alternative: an external monitor (for example UptimeRobot or Better Stack) hitting the same request.
- [ ] Make failures reach a person: GitHub notifications for the workflow owner, or the monitor's email/Slack alert.

## 3. Backups and retention

- [ ] Appwrite Cloud: check the project's backup policy (Project > Backups). Keep daily backups with a retention that matches how long you need to restore from.
- [ ] Monthly schema snapshot: run `appwrite pull` and commit or archive the result, so tables and permissions can be rebuilt.
- [ ] Decide how long Function execution logs and `audit_logs` rows are kept, and write the number here: ______.

## 4. Route-diagram bot token

- [ ] `ROUTE_DIAGRAM_PR_TOKEN` (fine-grained PAT, Contents and Pull requests read/write) expires on: ______. Put a calendar reminder two weeks before.
- [ ] When it lapses, the route-diagram sync PR stops getting CI Gate runs. Create a new token and update the repository secret.

## 5. Dependabot hygiene

- [ ] PR #138 "bump the angular group ... 15 updates" (opened 2026-10-04): merge it after a green CI run, or close it so Dependabot reopens a fresh one.
- [ ] Look at the open Dependabot PRs weekly; none should sit longer than two weeks.
- [ ] `npm audit` is report-only in CI. Review its output monthly until it can become a blocking gate.

## 6. Manual live checks still owed

- [ ] Story 6.4 end to end: sign up a new company, upload the registration document, submit the application, and confirm it appears in the Admin approval queue with the document openable.
- [ ] Client-upload permission proof: the file uploaded from the browser must carry `update("user:<id>")` exactly as sent. Read the file in the `tenant_documents` bucket and check its permissions.

## 7. Appwrite console settings worth checking

- [ ] Auth > Security: session length (shorter is safer; shared devices argue for shorter), maximum sessions per user, password history and dictionary options.
- [ ] Auth > Security: rate limits for sign-in and account creation are on, and "limit sessions" matches what the team expects.
- [ ] Function settings: timeout 30 s, execute permissions `users` and `any` (family access is anonymous), variables present (including `APPWRITE_AUDIT_LOGS_COLLECTION_ID=audit_logs`).
- [ ] Platforms: only the production and preview web origins are listed.
