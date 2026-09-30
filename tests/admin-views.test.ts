import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Regla de las vistas del panel (issue #57): un módulo que dibuja la cuadrícula
 * de tarjetas (`AdminCardGrid`) tiene que ofrecerla en su conmutador y recordar
 * la vista por usuario (`useAdminModuleView`). Si la cuadrícula queda sin opción
 * en el conmutador, el objeto es inalcanzable: este test lo frena.
 */
const MODULES_DIR = join(process.cwd(), "components", "admin", "modules");

test("los módulos con cuadrícula la ofrecen en el conmutador y recuerdan la vista", () => {
  const files = readdirSync(MODULES_DIR).filter((file) => file.endsWith(".tsx"));
  const withGrid = files.filter((file) => readFileSync(join(MODULES_DIR, file), "utf8").includes("AdminCardGrid"));

  assert.ok(withGrid.length >= 3, `se esperaban al menos 3 módulos con cuadrícula (hay ${withGrid.length})`);

  for (const file of withGrid) {
    const source = readFileSync(join(MODULES_DIR, file), "utf8");
    assert.match(
      source,
      /useAdminModuleView\(/,
      `${file}: la vista no se recuerda con useAdminModuleView`,
    );
    assert.match(source, /AdminViewSwitch/, `${file}: falta el conmutador de vistas`);
    assert.match(source, /["']grid["']/, `${file}: la cuadrícula no está declarada entre las vistas`);
  }
});

/**
 * Conmutador solo con íconos (issue #89): el nombre de la vista vive en
 * `title`/`aria-label` y el estado en `aria-pressed`; el texto visible se
 * retiró. Estas guardas frenan una vuelta atrás silenciosa.
 */
test("el conmutador de vistas va solo con íconos accesibles", () => {
  const source = readFileSync(join(process.cwd(), "components", "admin", "AdminBoard.tsx"), "utf8");
  const switchSource = source.slice(source.indexOf("export function AdminViewSwitch"));
  assert.ok(switchSource.length > 0, "no se encontró AdminViewSwitch");

  assert.match(source, /list: \{ label: "Lista", icon: "menu" \}/);
  assert.match(source, /board: \{ label: "Tablero", icon: "overview" \}/);
  assert.match(source, /grid: \{ label: "Cuadrícula", icon: "overview" \}/);
  assert.match(source, /calendar: \{ label: "Calendario", icon: "calendar" \}/);

  assert.match(switchSource, /aria-pressed={view === option}/, "el estado sigue en aria-pressed");
  assert.match(switchSource, /aria-label={optionLabel}/, "cada botón lleva aria-label con la vista");
  assert.match(switchSource, /title={optionLabel}/, "cada botón lleva title con la vista");
  assert.match(switchSource, /<AdminIcon name={MODULE_VIEW_OPTIONS\[option\]\.icon}/, "el botón dibuja el ícono");
  assert.doesNotMatch(switchSource, /\{MODULE_VIEW_OPTIONS\[option\]\.label\}/, "el nombre ya no se dibuja como texto");
});

/** Alineación de las barras (issue #89): los ítems se anclan abajo y los controles miden igual. */
test("la barra de herramientas ancla los controles a una misma línea", () => {
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(css, /\.admin-toolbar\s*\{[^}]*align-items:\s*flex-end/, "la barra alinea por la base del control");
  assert.match(css, /\.admin-toolbar \.admin-viewswitch\s*\{[^}]*height:\s*36px/, "el conmutador mide igual que los campos en la barra");
  assert.match(css, /\.admin-toolbar \.admin-btn\s*\{[^}]*min-height:\s*36px/, "los botones miden igual que los campos en la barra");
  assert.match(css, /\.admin-viewswitch-btn\s*\{[^}]*width:\s*30px[^}]*height:\s*30px/, "el botón del conmutador es cuadrado (solo ícono)");
});
