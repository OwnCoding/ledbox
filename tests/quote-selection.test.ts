import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveQuoteSelection, selectionSubtotal, selectionApprovalError } from "../lib/quote-selection";

const items = [
  { id: "paid", name: "Stand", quantity: 2, days: 3, unitPrice: 1000 },
  { id: "gift", name: "Brindis", quantity: 1, days: 1, unitPrice: 0 },
];

test("exclusion preserves original terms, excludes cost from total and can be restored", () => {
  const proposal = resolveQuoteSelection(items, [{ ...items[0], unitPrice: undefined, name: undefined, excluded: true }]);
  assert.equal(proposal.ok, true);
  if (!proposal.ok) return;
  assert.equal(selectionSubtotal({ ...items[0], ...proposal.value[0] }), 0);
  assert.equal(proposal.value[0].quantity, 2);
  assert.equal(proposal.value[0].days, 3);
  assert.equal(selectionApprovalError([{ ...items[0], excluded: true }, items[1]]), null, "free active items remain valid");
  const restore = resolveQuoteSelection([{ ...items[0], excluded: true }], [{ id: "paid", quantity: 2, days: 3, excluded: false }]);
  assert.equal(restore.ok, true);
  assert.equal(selectionSubtotal(items[0]), 6000);
});

test("all excluded cannot be submitted or approved, including an unchanged free line", () => {
  const rows = items.map((item) => ({ id: item.id, quantity: item.quantity, days: item.days, excluded: true }));
  assert.equal(resolveQuoteSelection(items, rows).ok, false);
  assert.ok(selectionApprovalError(items.map((item) => ({ ...item, excluded: true }))));
});

test("reject foreign, duplicate, tampered and invalid proposals", () => {
  for (const raw of [
    [{ id: "foreign", quantity: 1, days: 1, excluded: true }],
    [{ id: "paid", quantity: 2, days: 3, excluded: true }, { id: "paid", quantity: 2, days: 3 }],
    [{ id: "paid", quantity: 0, days: 3 }],
    [{ id: "paid", quantity: 2, days: 0 }],
    [{ id: "paid", quantity: 2, days: 3, excluded: "true" }],
    [{ id: "paid", quantity: 2, days: 3, unitPrice: 1 }],
    [{ id: "paid", quantity: 2, days: 3, inventoryId: "foreign-product" }],
    [{ id: "paid", quantity: 2, days: 3, subtotal: 1 }],
    [{ id: "paid", quantity: 3, days: 3, excluded: true }],
    [{ id: "paid", quantity: 9999, days: 3 }],
    [{ id: "paid", quantity: 2, days: 366 }],
  ]) assert.equal(resolveQuoteSelection(items, raw).ok, false, JSON.stringify(raw));
});

test("pending selection and overcommitted payment plan block approval", () => {
  assert.ok(selectionApprovalError(items, true));
  assert.ok(selectionApprovalError(items, false, 7000, 6000));
  assert.equal(selectionApprovalError(items, false, 6000, 6000), null);
});
