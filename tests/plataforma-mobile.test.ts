import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  auditValueLabel,
  dayInputText,
  formatDateTime,
  formatDayKey,
  formatMonthKey,
  maskDayInput,
  parseDayInput,
} from "../lib/admin-format";

/**
 * Auditoría y Usuarios en móvil + fechas es-PY (issue #154, críticos 3 y 5 de
 * la segunda pasada de la auditoría). Hasta 980 px —el corte del shell— las
 * dos listas se leen como tarjetas y dejan de exigir scroll horizontal; los
 * filtros de fecha de Auditoría se teclean `dd/mm/aaaa` (el input nativo
 * mostraba `yyyy-mm-dd`) y los detalles del historial no muestran ISO crudos.
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("auditoría: tarjetas en ancho compacto, con fecha, entidad y detalle adentro", () => {
  const module = repoFile("components/admin/modules/AuditoriaModule.tsx");
  assert.match(module, /const compact = useAdminNarrowViewport\(\);/);
  assert.match(module, /compact \? \(\n\s*<AdminCardGrid label="Historial de cambios" cards=\{cards\} \/>/);
  assert.match(module, /const cards: AdminCardData\[\] = logs\.map/);
  for (const label of ["Fecha y hora", "Entidad"]) {
    assert.ok(module.includes(`label: "${label}"`), `falta «${label}» en la tarjeta de auditoría`);
  }
  // El detalle se despliega dentro de la tarjeta, no en una fila aparte.
  assert.match(module, /\{open \? <AuditDetail log=\{log\} lines=\{lines\} \/> : null\}/);
  assert.match(module, /function AuditDetail\(\{ log, lines \}/);
});

test("auditoría: los filtros de fecha se leen dd/mm/aaaa (sin input nativo yyyy-mm-dd)", () => {
  const module = repoFile("components/admin/modules/AuditoriaModule.tsx");
  assert.match(module, /import \{ DayField, SearchField \} from "\.\.\/AdminFields";/);
  assert.equal(module.includes("<DateField"), false, "el input nativo mostraba yyyy-mm-dd");
  assert.equal((module.match(/<DayField/g) ?? []).length, 2, "Desde y Hasta van con el campo de día");
  const fields = repoFile("components/admin/AdminFields.tsx");
  assert.match(fields, /placeholder="dd\/mm\/aaaa"/, "el campo tiene que mostrar el formato es-PY");
});

test("el campo de día entrega AAAA-MM-DD y solo acepta días reales", () => {
  assert.equal(dayInputText("2026-09-21"), "21/09/2026");
  assert.equal(dayInputText(""), "");
  assert.equal(parseDayInput("21/09/2026"), "2026-09-21");
  assert.equal(parseDayInput("31/02/2026"), null, "el 31 de febrero no existe");
  assert.equal(parseDayInput("21/9/2026"), null, "sin los dos dígitos no se acepta");
  assert.equal(parseDayInput("21/09/26"), null);
  assert.equal(maskDayInput("21092026"), "21/09/2026");
  assert.equal(maskDayInput("21/09/2026"), "21/09/2026");
  assert.equal(maskDayInput("2"), "2");
  assert.equal(maskDayInput("2109"), "21/09");
});

test("formatDayKey y formatMonthKey dibujan es-PY sin corrimiento de zona", () => {
  assert.equal(formatDayKey("2026-10-15"), formatDayKey("2026-10-15T12:00:00.000Z"));
  assert.doesNotMatch(formatDayKey("2026-10-15"), /2026-10-1[45]T|^-/);
  assert.match(formatDayKey("2026-10-15"), /15/);
  assert.match(formatMonthKey("2026-09"), /septiembre/);
  assert.equal(formatMonthKey("2026-09").includes("2026"), true);
  assert.equal(formatMonthKey("2026-13"), "2026-13", "un mes inválido se muestra tal cual");
});

test("el detalle de auditoría no muestra fechas ISO crudas", () => {
  // Vencimiento y período son días: se dibujan sin hora.
  assert.equal(auditValueLabel("Budget", "validUntil", "2026-10-15T12:00:00.000Z"), formatDayKey("2026-10-15"));
  assert.equal(auditValueLabel("Expense", "date", "2026-10-02T03:00:00.000Z"), formatDayKey("2026-10-02"));
  assert.equal(auditValueLabel("BankStatement", "periodStart", "2026-09-02T03:00:00.000Z"), formatDayKey("2026-09-02"));
  assert.equal(auditValueLabel("Promoter", "unavailableUntil", "2026-10-20T04:00:00.000Z"), formatDayKey("2026-10-20"));
  // Un instante real conserva la hora.
  assert.equal(
    auditValueLabel("Invoice", "issuedAt", "2026-10-02T14:35:00.000Z"),
    formatDateTime(new Date("2026-10-02T14:35:00.000Z")),
  );
  // El mes fiscal se lee como mes y año.
  assert.equal(auditValueLabel("FiscalPeriod", "month", "2026-09"), formatMonthKey("2026-09"));
  // Los valores que no son fechas siguen tal cual.
  assert.equal(auditValueLabel("Client", "name", "Distribuidora Central"), "Distribuidora Central");
  assert.equal(auditValueLabel("Event", "status", "CONFIRMED"), "Confirmado");
});

test("usuarios: tarjetas para la lista y para las invitaciones", () => {
  const module = repoFile("components/admin/modules/UsuariosModule.tsx");
  assert.equal((module.match(/const compact = useAdminNarrowViewport\(\);/g) ?? []).length, 2, "faltan las dos listas");
  assert.match(module, /compact \? \(\n\s*<AdminCardGrid label="Usuarios del panel" cards=\{userCards\} \/>/);
  assert.match(module, /compact \? \(\n\s*<AdminCardGrid label="Invitaciones por aceptar" cards=\{invitationCards\} \/>/);
  assert.match(module, /const userCards: AdminCardData\[\] = rows\.map/);
  assert.match(module, /const invitationCards: AdminCardData\[\] = list\.map/);
  // El selector de rol del que puede editarlo sigue disponible en la tarjeta.
  assert.match(module, /admin-filter--cell[\s\S]{0,200}label=\{`Rol de \$\{user\.name\}`\}/);
  // Las pendientes siguen con reenviar y revocar.
  assert.match(module, /title=\{`Reenviar la invitación a \$\{invitation\.email\}`\}/);
  assert.match(module, /title=\{`Revocar la invitación de \$\{invitation\.email\}`\}/);
});

test("el detalle de auditoría dentro de la tarjeta no desborda", () => {
  const css = repoFile("app/globals.css");
  assert.match(
    css,
    /\.admin-cards-foot > \.admin-audit-detail \{ flex: 1 1 100%; position: static; width: 100%; \}/,
    "el detalle deja de ser sticky y ocupa el ancho de la tarjeta",
  );
});
