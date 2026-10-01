import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Cuenta en el panel (issue #117): el chip del sidebar es un **enlace directo**
 * a Mi perfil (sin menú desplegable) y la identidad + las acciones de cuenta
 * (Cerrar sesión arriba de Empresa; Bloquear panel si hay PIN) viven en el
 * perfil, alimentadas por el contexto de sesión del shell.
 */
const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");
const shell = read("components/admin/AdminShell.tsx");
const perfil = read("components/admin/modules/PerfilModule.tsx");
const css = readFileSync(join(root, "app", "globals.css"), "utf8");

test("el chip de usuario es un enlace directo a Mi perfil", () => {
  assert.match(shell, /className="admin-user admin-user--sidebar"\s*\n\s*href="\/perfil"/, "el chip no enlaza a /perfil");
  assert.match(shell, /aria-label=\{`Mi perfil · \$\{session\.user\.name\}`\}/, "falta el aria-label");
  assert.doesNotMatch(shell, /admin-usermenu-panel/, "el menú desplegable debe estar fuera");
  assert.doesNotMatch(shell, /setUserMenuOpen|userMenuOpen/, "ni su estado");
  assert.doesNotMatch(css, /admin-usermenu/, "ni sus estilos");
});

test("Mi perfil muestra la identidad arriba", () => {
  const start = perfil.indexOf('className="admin-account-head"');
  assert.ok(start > 0, "falta el encabezado de identidad");
  const head = perfil.slice(start, perfil.indexOf("{notice ?", start));
  assert.match(head, /<strong>\{identity\.name\}<\/strong>/, "sin nombre");
  assert.match(head, /<small>\{identity\.email\}<\/small>/, "sin correo");
  assert.match(head, /adminRoleLabel\(identity\.role\)/, "sin badge de rol");
});

test("la cuenta va al final: cerrar sesión arriba de Empresa", () => {
  const logout = perfil.indexOf('{demo ? "Salir de la demo" : "Cerrar sesión"}');
  const company = perfil.indexOf('href="/ajustes/empresa"');
  assert.ok(logout > 0, "falta el cierre de sesión");
  assert.ok(company > logout, "Empresa tiene que ir después de Cerrar sesión");
  assert.match(perfil, /demo \? "Salir de la demo" : "Cerrar sesión"/, "la demo usa su propio texto");
  assert.match(perfil, /lockEligible \?/, "el bloqueo por PIN se conserva si aplica");
  assert.match(perfil, /canManageOrganization\(user\?\.role \?\? null\)/, "Empresa solo si el rol puede editarla");
});

test("las acciones de cuenta viajan por el contexto de sesión", () => {
  assert.match(shell, /lockPanel: \(reason: "inactivity" \| "manual"\) => void;/, "el contexto no expone el bloqueo");
  assert.match(shell, /logout: \(\) => Promise<void>;/, "ni el cierre de sesión");
  assert.match(shell, /lockEligible, lockPanel, logout, loggingOut \}/, "el valor del contexto incluye las acciones");
  assert.match(shell, /lockEligible: false,\n  lockPanel: \(\) => \{\},/, "el contexto por defecto no rompe");
});
