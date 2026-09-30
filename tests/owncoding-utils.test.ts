import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Tanda 1 del plan #100 (issue #105): los utils puros entran por el subcamino
 * `owncoding-ui/utils` y las adopciones sin UI conservan el contrato que ya
 * consumían el panel, el portal y los imprimibles. Estas guardas fallan si
 * alguien vuelve al entry root para lo migrado.
 *
 * No se testean acá `claveTelefonoCliente`/`coincideTelefonoCliente` ni los
 * helpers de proveedores/cuentas: v0.55.0 todavía **no los publica por el
 * subcamino** (solo por el root). Quedan anotados como pedido upstream en el
 * handover del #105; el dedup de `/api/leads` conserva su clave local con la
 * guarda de los números cortos hasta esa publicación.
 */

const repoFile = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

test("los utils migrados entran por owncoding-ui/utils, no por el root", () => {
  for (const file of ["lib/admin-format.ts", "lib/bank-mark.ts", "lib/qr.ts"]) {
    const source = repoFile(file);
    assert.match(source, /from "owncoding-ui\/utils"/, `${file}: falta el subcamino de utils`);
    assert.doesNotMatch(source, /from "owncoding-ui";/, `${file}: no debe importar del root`);
  }
  // `field-rules.ts` migró todo salvo `limpiarPercent` (excepción documentada).
  const rules = repoFile("lib/field-rules.ts");
  const rootImports = rules.match(/from "owncoding-ui";/g) ?? [];
  assert.equal(rootImports.length, 1, "field-rules solo puede tocar el root para limpiarPercent");
});

test("limpiarPercent queda como la única excepción del root (pedido upstream)", () => {
  const rules = repoFile("lib/field-rules.ts");
  assert.match(rules, /import \{ limpiarPercent \} from "owncoding-ui";/);
  const library = repoFile("node_modules/owncoding-ui/src/utils/index.js");
  assert.doesNotMatch(library, /limpiarPercent/, "si upstream la publica en utils, migrar y borrar la excepción");
});
