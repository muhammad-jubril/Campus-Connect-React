import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const changes = [
  {
    path: "src/pages/MarketplacePage.jsx",
    description: "Marketplace report form limit and character counter",
    operations: [
      {
        label: "Marketplace report textarea maxLength",
        before: 'id="market-report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={800}',
        after: 'id="market-report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={30}',
      },
      {
        label: "Marketplace report character counter",
        before: "{reportDetails.length}/800",
        after: "{reportDetails.length}/30",
      },
    ],
  },
  {
    path: "src/services/supabase/marketplace.js",
    description: "Marketplace report client-side service validation",
    operations: [
      {
        label: "Marketplace report details validation",
        before: `  if (!listingId || !reporterId) throw new Error("Sign in to report a listing.");
  const { error } = await supabase.from("marketplace_reports").insert({
    listing_id: listingId, reporter_id: reporterId, reason, details: details.trim() || null,
  });`,
        after: `  if (!listingId || !reporterId) throw new Error("Sign in to report a listing.");
  const safeDetails = typeof details === "string" ? details.trim() : "";
  if (safeDetails.length > 30) throw new Error("Report details must be 30 characters or fewer.");
  const { error } = await supabase.from("marketplace_reports").insert({
    listing_id: listingId, reporter_id: reporterId, reason, details: safeDetails || null,
  });`,
      },
    ],
  },
];

function applyOperations(source, operations, filePath) {
  let result = source;
  for (const operation of operations) {
    const occurrences = result.split(operation.before).length - 1;
    if (occurrences === 1) {
      result = result.replace(operation.before, operation.after);
      continue;
    }
    // Idempotent: allow an already-applied exact change, but reject unknown source shapes.
    if (occurrences === 0 && result.includes(operation.after)) continue;
    throw new Error(
      `${filePath}: expected exactly one match for ${operation.label}, found ${occurrences}. No files were written. Check that this is the correct Campus Connect project version.`,
    );
  }
  return result;
}

async function main() {
  const prepared = [];
  for (const change of changes) {
    const filePath = path.join(root, change.path);
    let source;
    try {
      source = await readFile(filePath, "utf8");
    } catch {
      throw new Error(`${change.path} was not found. Run this script from the Campus Connect project root.`);
    }
    prepared.push({ ...change, filePath, content: applyOperations(source, change.operations, change.path) });
  }

  // Validate every source anchor above before writing either file.
  for (const item of prepared) {
    if (item.content !== await readFile(item.filePath, "utf8")) {
      await writeFile(item.filePath, item.content, "utf8");
    }
  }

  console.log("Report-details limit patch applied.");
  console.log("- Content report dialog: 30 characters (set by src/utils/contentSafetyRules.js in this ZIP)");
  console.log("- Marketplace report: 30 characters and a matching counter");
  console.log("- Marketplace service rejects longer report details before sending the request");
  console.log("Apply supabase/migrations/20261012160000_report_details_limit_30.sql to enforce the limit in Supabase.");
  console.log("No Git commit or push was performed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
