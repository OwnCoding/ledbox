import { quotePdfValid } from "../lib/server/pdf-validation";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { deflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";
import { quotePortalAvailable, quoteReferenceUrl, quoteProductPrice, quoteComparisonEligible } from "../lib/quote-sharing";

const pdf = (extra = "") => Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${extra} >>\nendobj\nstartxref\n9\n%%EOF\n`);
test("references accept only bounded HTTP(S) links without credentials", () => {
  assert.equal(quoteReferenceUrl(" https://example.com/a?q=1 "), "https://example.com/a?q=1");
  for (const value of ["javascript:alert(1)", "data:text/html,test", "/local", "//host", "https://u:p@host/", "https://host/\nx", "https://host/\\x", "https://host/" + "x".repeat(2000)]) assert.equal(quoteReferenceUrl(value), null);
});
test("parsed PDF screen accepts ordinary object streams and rejects decoded active objects", async () => {
  const doc = await PDFDocument.create(); doc.addPage();
  const ordinary = await doc.save({ useObjectStreams: true });
  assert.equal(await quotePdfValid(ordinary), true);
  doc.addJavaScript("hidden-script", "app.alert('unsafe')");
  const active = await doc.save({ useObjectStreams: true });
  assert.equal(Buffer.from(active).includes(Buffer.from("/JavaScript")), false, "payload must actually be compressed");
  assert.equal(await quotePdfValid(active), false);
  const action = await PDFDocument.create(); action.addPage();
  action.catalog.set(PDFName.of("OpenAction"), action.context.obj({ S: "JavaScript", JS: "unsafe" }));
  assert.equal(await quotePdfValid(await action.save()), false);
  for (const value of [Buffer.from("%PDF-1.7"), Buffer.from("<html>test</html>"), Buffer.alloc(5 * 1024 * 1024 + 1), pdf("/Encrypt 2 0 R")]) assert.equal(await quotePdfValid(value), false);
});

test("PDF decompression and graph budgets fail closed", async () => {
  const doc = await PDFDocument.create(); doc.addPage();
  const compressed = deflateSync(Buffer.alloc(20 * 1024 * 1024, 32));
  doc.context.register(PDFRawStream.of(doc.context.obj({ Type: "ObjStm", N: 0, First: 0, Filter: "FlateDecode" }), compressed));
  const before = Date.now();
  assert.equal(await quotePdfValid(await doc.save({ useObjectStreams: false })), false);
  assert.ok(Date.now() - before < 5000);
});

const compatibilityPaths: string[] = JSON.parse(process.env.QUOTE_COMPAT_PDFS || "[]");
test("customer originals with object streams remain compatible, read-only", { skip: !compatibilityPaths.length }, async () => {
  for (const path of compatibilityPaths) {
    const bytes = await readFile(path);
    assert.equal(bytes.includes(Buffer.from("/ObjStm")), true);
    assert.equal(await quotePdfValid(bytes), true);
  }
});
test("portal hides expired unapproved and closed quotes but preserves approved payment access", () => {
  const now = new Date("2026-10-08T15:00:00Z");
  const budget = { status: "SENT", validUntil: new Date("2026-10-07T12:00:00Z"), approvedAt: null };
  assert.equal(quotePortalAvailable(budget, now), false);
  assert.equal(quotePortalAvailable({ ...budget, validUntil: now }, now), true);
  assert.equal(quotePortalAvailable({ ...budget, approvedAt: now }, now), true);
  assert.equal(quotePortalAvailable({ ...budget, status: "CANCELLED", approvedAt: now }, now), false);
});

test("product selection defaults to the final price and honors the duration threshold", () => {
  const product = { listPrice: 100, listFromDays: 3, listFromPrice: 80 };
  assert.equal(quoteProductPrice(product, 1), 100);
  assert.equal(quoteProductPrice(product, 3), 80);
  assert.equal(quoteProductPrice({}, 1), 0);
});


test("comparison eligibility uses the Paraguay day after UTC midnight", () => {
  const quote = { comparisonId: null, approvedAt: null, status: "DRAFT", validUntil: "2026-10-08T12:00:00.000Z" };
  const lateParaguay = new Date("2026-10-09T01:00:00.000Z"); // Oct8 22:00 PY.
  assert.equal(quoteComparisonEligible(quote, lateParaguay), true);
  assert.equal(quotePortalAvailable({ ...quote, validUntil: new Date(quote.validUntil) }, lateParaguay), true);
  assert.equal(quoteComparisonEligible(quote, new Date("2026-10-09T03:00:00.000Z")), false);
  assert.equal(quoteComparisonEligible({ ...quote, status: "APPROVED" }, lateParaguay), false);
});
