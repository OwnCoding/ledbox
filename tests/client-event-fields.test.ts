import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClientFields } from "../app/api/admin/clients/client-fields";
import { eventDateViolation, parseEventFields } from "../app/api/admin/events/event-fields";

test("fantasía empresarial independiente: 200 caracteres, sin conversión de historia/contacto", () => {
  const parsed = parseClientFields({ tradeName: "  SCALE   STRATEGY GROUP EAS  ", legalName: "RAZÓN SOCIAL OFICIAL S.A.", city: "Asunción", department: "Capital" });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.data, { tradeName: "SCALE STRATEGY GROUP EAS", legalName: "RAZÓN SOCIAL OFICIAL S.A.", city: "Asunción", department: "Capital" });
  assert.equal(parseClientFields({ tradeName: "x".repeat(200) }).ok, true);
  assert.equal(parseClientFields({ name: "x".repeat(200) }).ok, true);
  assert.equal(parseClientFields({ name: "x".repeat(201) }).ok, false);
  assert.equal(parseClientFields({ tradeName: "x".repeat(201) }).ok, false);
  assert.equal(parseClientFields({ tradeName: 123 }).ok, false);
  assert.deepEqual(parseClientFields({ tradeName: "", department: null }), { ok: true, data: { tradeName: null, department: null } });
});

test("contactos por función normalizados sin inferir campos principales", () => {
  const result = parseClientFields({ billingEmail: "  FACTURA@EXAMPLE.COM ", contacts: [{ name: " Ana  Pérez ", role: "Compras", phone: "+595 981123456", email: "ANA@EXAMPLE.COM" }] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.billingEmail, "factura@example.com");
  assert.deepEqual(result.data.contacts, [{ name: "Ana Pérez", role: "Compras", phone: "+595 981123456", email: "ana@example.com" }]);
  assert.equal(result.data.contactName, undefined);
  const foreign = parseClientFields({ contacts: [{ name: "Ana QA", phone: "+54 91112345678" }] });
  assert.equal(foreign.ok, true);
  if (foreign.ok) assert.equal(foreign.data.contacts?.[0].phone, "+54 91112345678", "preserva país explícito, no fuerza +595");
  for (const contacts of [[{ name: "" }], [{ name: "Ana", email: "no-correo" }], [{ name: "Ana", phone: "inválido" }], [{ name: "Ana", email: {} }], Array(21).fill({ name: "Ana" }), {}]) {
    assert.equal(parseClientFields({ contacts }).ok, false);
  }
  assert.equal(parseClientFields({ billingEmail: "x".repeat(255) + "@example.com" }).ok, false);
});

test("enlaces de ubicación HTTP/HTTPS, nunca código o credenciales; locality manual explícita", () => {
  assert.deepEqual(parseClientFields({ locationUrl: "maps.example.com/punto", city: "Ciudad manual", department: null }), { ok: true, data: { locationUrl: "https://maps.example.com/punto", city: "Ciudad manual", department: null } });
  for (const locationUrl of ["javascript:alert(1)", "ftp://example.com", "https://user:secret@example.com", {}]) {
    assert.equal(parseClientFields({ locationUrl }).ok, false);
    assert.equal(parseEventFields({ locationUrl }).ok, false);
  }
});

test("evento rápido opcional y edición parcial conservan recinto separado de localidad", () => {
  assert.deepEqual(parseEventFields({ name: " Evento  empresarial ", city: "Asunción", department: "Capital", location: "Recinto QA", attendees: 0, startsAt: "" }), { ok: true, data: { name: "Evento empresarial", city: "Asunción", department: "Capital", location: "Recinto QA", attendees: 0, startsAt: null } });
  assert.deepEqual(parseEventFields({ department: null }), { ok: true, data: { department: null } });
  for (const attendees of [-1, 1.5, "10", 2147483648]) assert.equal(parseEventFields({ attendees }).ok, false);
  assert.equal(parseEventFields({ name: "  " }).ok, false);
  assert.equal(parseEventFields({ startsAt: "no-fecha" }).ok, false);
  assert.equal(parseEventFields({ startsAt: "2030-02-30T12:00" }).ok, false);
  assert.equal(parseEventFields({ startsAt: "2030-01-01T24:00" }).ok, false);
  assert.equal(parseEventFields({ venueContactEmail: "inválido" }).ok, false);
  assert.equal(parseEventFields({ responsiblePhone: "inválido" }).ok, false);
  assert.equal(eventDateViolation({ startsAt: new Date("2030-01-02"), endsAt: new Date("2030-01-01") }), "El fin del evento no puede ser anterior al inicio.");
  assert.equal(eventDateViolation({ setupAt: new Date("2030-01-03"), startsAt: new Date("2030-01-02") }), "El montaje no puede ser posterior al inicio.");
});
