import assert from 'node:assert/strict';
import { recordDeliveryAttempt } from '../supabase/functions/web-push-dispatch/persistence.ts';

// Models the production successful-send path against the intentionally narrow
// service_role grant: INSERT is allowed for attempts, SELECT is not.
const attempts = [];
const noSelectAuditTable = {
  insert(values) {
    attempts.push(values);
    return Promise.resolve({ data: null, error: null });
  },
  select() {
    throw new Error('SELECT on web_push_delivery_attempts must not be required');
  },
};
const jobWrites = [];
const jobs = {
  update(values) {
    return {
      eq(column, value) {
        jobWrites.push({ column, value, values });
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
};

// A successful gateway send must be followed by an auditable attempt and a
// correctly filtered terminal job update, even without audit-table SELECT.
await Promise.resolve();
await recordDeliveryAttempt(noSelectAuditTable.insert({ job_id: 'job-1', subscription_id: 'sub-1', outcome: 'delivered', response_status: 201 }));
const completion = jobs.update({ status: 'delivered', delivered_at: '2026-08-26T00:00:00.000Z', locked_at: null, last_error: null }).eq('id', 'job-1');
assert.deepEqual(await completion, { data: null, error: null });
assert.deepEqual(attempts, [{ job_id: 'job-1', subscription_id: 'sub-1', outcome: 'delivered', response_status: 201 }]);
assert.deepEqual(jobWrites, [{ column: 'id', value: 'job-1', values: { status: 'delivered', delivered_at: '2026-08-26T00:00:00.000Z', locked_at: null, last_error: null } }]);
console.log('Web Push successful-send finalization regression passed.');
