import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MAX_CONTENT_REPORT_DETAILS, validateContentReportDraft } from "../src/utils/contentSafetyRules.js";

const migrationPath = new URL("../supabase/migrations/20261012040126_report_details_limit_30.sql", import.meta.url);
const patchScriptPath = new URL("../scripts/apply-report-details-limit.mjs", import.meta.url);
const reportDialogPath = new URL("../src/components/safety/ReportDialog.jsx", import.meta.url);

test("content report details are capped at 30 characters in shared validation", () => {
  assert.equal(MAX_CONTENT_REPORT_DETAILS, 30);
  assert.doesNotThrow(() => validateContentReportDraft({ targetType: "post", reason: "other", details: "x".repeat(30) }));
  assert.throws(() => validateContentReportDraft({ targetType: "post", reason: "other", details: "x".repeat(31) }), /30 characters or fewer/);
});

test("main report dialog uses the shared 30-character limit for input and counter", async () => {
  const dialog = await readFile(reportDialogPath, "utf8");
  assert.match(dialog, /maxLength=\{MAX_CONTENT_REPORT_DETAILS\}/);
  assert.match(dialog, /\{details\.length\}\/\{MAX_CONTENT_REPORT_DETAILS\}/);
});

test("Marketplace limit patch updates its form, counter, and service validation", async () => {
  const script = await readFile(patchScriptPath, "utf8");
  assert.match(script, /maxLength=\{30\}/);
  assert.match(script, /\{reportDetails\.length\}\/30/);
  assert.match(script, /safeDetails\.length > 30/);
});

test("Supabase migration enforces 30 characters on both report tables and preserves historical review", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create trigger content_reports_zz_details_limit[\s\S]*before insert or update on public\.content_reports/i);
  assert.match(sql, /create trigger marketplace_reports_zz_details_limit[\s\S]*before insert or update on public\.marketplace_reports/i);
  assert.match(sql, /char_length\(new\.details\) > 30/i);
  assert.match(sql, /new\.details is distinct from old\.details/i);
  assert.doesNotMatch(sql, /delete from public\.(content_reports|marketplace_reports)/i);
});
