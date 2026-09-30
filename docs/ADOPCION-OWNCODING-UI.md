# Adopción de `owncoding-ui` en LedBox/EventOS

Estado y plan del uso de la librería compartida de OwnCoding
(`github.com/dariodeoli/owncoding-ui`) en esta app.

> **Relevamiento del 30-09-2026 (issues #100 y #103).** Pin actual:
> **v0.55.0** (subido en la Tanda 0, issue #103); librería publicada: **v0.55.0**.
> Piloto y capturas comparativas: `docs/PILOTO-OWNCODING-UI.md` y
> `docs/piloto-owncoding-ui/`.
> Regla madre: **buscar antes de crear**. Si el objeto existe en la librería, se
> usa; si falta y es genérico, se crea **en la librería** y se adopta acá.
>
> **En una línea:** la Tanda 0 ya está (pin v0.55.0, sin cambios de código) y
> siguen dos frentes —utils puros y privacidad—; los objetos grandes esperan al
> rediseño. El detalle y los issues propuestos están en §5.

## 1. Estado actual (relevamiento)

### 1.1 Qué usa EventOS hoy (pin v0.55.0)

Todo entra por el **root** del paquete (`dist/index.js`, marcado `use client`).
No hay ningún objeto de interfaz adoptado todavía: solo utils y catálogos.

| Archivo | Importa de `owncoding-ui` |
| --- | --- |
| `lib/field-rules.ts` | `CIUDADES_PARAGUAY`, `departamentoDe`, `parseTelefono`, `componerTelefono`, `parseGsInput`, `formatGsInput`, `excedeMonto`, `largoMaximoMonto`, `normalizarMontoInput`, `caretTrasDigitos`, `limpiarPercent` |
| `lib/admin-format.ts` | `formatGs` |
| `lib/bank-mark.ts` | `BANCOS_PARAGUAY`, `normalizarBanco`, `logoDeBanco`, `sugerenciasDeBanco`, `inicialesDeBanco`, `colorDeBanco` |
| `tests/admin-format.test.ts`, `tests/bank-mark.test.ts` | `formatGs` y los helpers de bancos |

- El QR se genera con el paquete `qrcode` directo (`lib/qr.ts`), no con la librería.
- La librería expone además el subcamino **`owncoding-ui/utils`** (JS puro, sin
  `"use client"`) con los mismos helpers: es el destino natural de estos imports
  (hoy pasan por el bundle cliente, riesgo anotado en el piloto para las hojas
  imprimibles del servidor).
- **`limpiarPercent` es la excepción**: hoy vive solo en el root (dentro de
  `PercentField.jsx`), no en el entry de utils. Migrar los imports exige dejarla
  apuntando al root o pedir su pase a `utils` en la librería.

### 1.2 Qué publicó la librería desde el pin

Entre v0.39.0 y v0.55.0 hay **24 commits**; el índice pasó de **425 a 478
nombres exportados, con 0 quitados** (conteo propio sobre `src/index.js`).

| Versión | Lo relevante para EventOS |
| --- | --- |
| v0.40.0–v0.40.1 | Manifiesto de envío (no aplica) y fix del CSS publicado |
| v0.41.0 | `BuscadorProveedor` (recientes + alta rápida) |
| v0.42.0 | `SelectorCuentaCobro` + `TarjetaCuentaCobro` |
| v0.43.0 | `ConfirmarConPalabra` y el flujo de unificar clientes |
| v0.44.0 | `BloquePago` (tarjeta de medio de pago con la papelera adentro) |
| v0.45.0–v0.48.2 | Chip/preview de fusión, `Cronologia` con estados, `NavegacionSeccion`, listas virtualizadas y fix de avatares |
| v0.49.0–v0.50.0 | Tickets de prueba y **`ProductFooter`** (pie institucional obligatorio) |
| v0.51.0 | Reglas transversales §15 y notificaciones §16, con `partesVersion`/`compararVersiones`/`hayVersionNueva`, `rutaDeAviso`, `payloadPush`, `enHorarioSilencioso` |
| v0.52.0–v0.53.1 | `REGLAS-ECOSISTEMA.md` anexado, compactación de escritorio §17 y fix de campos cortos (`PhoneField`) |
| v0.54.0 | **§12 Protección de datos personales** + `AvisoPrivacidad`, `ConsentimientoDatos` y `registroConsentimiento` |
| v0.55.0 | Docs (sin cambios de API): §1 «un componente por tipo de dato» y alineación de formularios (issue #10 de la librería); refuerza «biblioteca primero, sin duplicar» en §5 y §7 |

## 2. Diff v0.39.0 → v0.55.0

### 2.1 Compatibilidad

- **Sin exports quitados ni renombres** en el índice del paquete.
- **Los utils que EventOS ya usa no cambiaron**: `moneda.js`, `telefono.js`,
  `bancos.js` y `catalogo/ciudades.js` son byte a byte idénticos entre ambas
  versiones (diff vacío); los nombres usados siguen en `utils`.
- **Sin dependencias de runtime nuevas**: `qrcode` sigue como peer opcional;
  `jsdom` es devDependency de la librería (no llega a la app).
- Los objetos nuevos son **aditivos**. La librería documenta que en `0.x` un
  objeto puede cambiar de nombre; en este rango no hubo renombres ni exports
  quitados de lo que EventOS consume.

### 2.2 Estado del pin

La **Tanda 0 ya está hecha (issue #103)**: el pin pasó de v0.39.0 a **v0.55.0**
sin tocar código funcional, con `typecheck`, `test:rules` (205/205) y `build`
verdes. `v0.54.0` trajo la §12 y los objetos de privacidad; `v0.55.0` es
docs-only (0 exports nuevos). La Tanda 1 (#105) migró los imports al subcamino
de utils y actualizó la aserción de fuente de `tests/bank-mark.test.ts`.

## 3. Catálogo de candidatos a adoptar

### 3.1 Prioridad 1 — privacidad (Ley 7593/2025)

Lo que la §12 de la librería pide ya tiene una base en EventOS: la política
pública (#92), los avisos del portal (#93) y el registro interno
(`docs/PRIVACIDAD.md`, #94). Falta el objeto único y el **consentimiento
versionado y registrable**.

| Objeto de la librería | Qué resuelve | Hoy en EventOS | Cuándo |
| --- | --- | --- | --- |
| `ConsentimientoDatos` | Casilla explícita por finalidad, **nunca pre-tildada**, con versión visible y error accesible | Texto de aviso sin casilla ni versión (sitio y portal); la brecha B2 sigue abierta | Tanda 2 |
| `AvisoPrivacidad` | Aviso de finalidad con enlaces a política y derechos | Texto local (`LeadCaptureDialog`, portal, footer) | Tanda 2 |
| `registroConsentimiento` (utils) | Constancia de aceptación/revocación con versión, fecha y canal | Solo `consentAt` en el lead; sin versión ni canal | Tanda 1 |
| `ProductFooter` | Pie institucional obligatorio (§14) con versión y crédito | `components/app-footer.tsx` y `PublicFooter` propios | Tanda 2/4 |

> El guardado del registro de consentimiento necesita un campo/entidad nueva
> (migración aditiva) además del componente: es la continuación de la brecha B2
> de `docs/PRIVACIDAD.md`, no solo UI.

### 3.2 Prioridad 1 — utils puros (sin Tailwind, adopción directa)

| Helper | Para qué en EventOS | Hoy |
| --- | --- | --- |
| `partesVersion`, `compararVersiones`, `hayVersionNueva` | Aviso de «versión nueva» (regla 10) | `lib/version.ts` solo expone la versión |
| `claveTelefonoCliente`, `coincideTelefonoCliente`, `digitosCliente` | Dedup lead → cliente por teléfono nacional | `phoneKey` privado en `app/api/leads/route.ts` |
| `extraerRuc`, `esRuc`, `RUC_RE` | Validar/extraer RUC de leads y clientes | Campo libre (`optionalText(40)`) |
| `filtrarProveedores`, `normalizarProveedor`, `nombreProveedor`, `detalleProveedor`, `resolverRecientes` | Búsqueda de proveedores sin acentos/abreviatura | `SelectField` plano |
| `filtrarCuentasCobro`, `detalleCuentaCobro`, `simboloCuenta`, `numeroParcialCuenta`, `preseleccionDeCuenta`, `ventanaDeLista` | Cuentas de cobro y listas largas estables | `SelectField` / listas simples |
| `qrDataUrl`, `QR_OPCIONES` | Un solo QR con las mismas opciones | `lib/qr.ts` con `qrcode` y opciones propias |
| `rutaDeAviso`, `payloadPush`, `enHorarioSilencioso` | Campana y notificaciones (§16) | Lógica local en `lib/server/notifications.ts` |
| `fechaLista`, `fechaListaCorta`, `diasHasta`, `tonoVencimiento` | Columnas densas y vencimientos | `lib/admin-format.ts` propio (evaluar formatos antes de migrar) |

> **Hallazgo de la Tanda 1 (#105, 30-09-2026):** publicadas en v0.55.0, pero
> **todavía no salen por `owncoding-ui/utils`** (solo por el entry root, que
> arrastra React y el `"use client"`): `claveTelefonoCliente`,
> `coincideTelefonoCliente`, `digitosCliente`, `filtrarProveedores`,
> `normalizarProveedor`, `filtrarCuentasCobro`, `ventanaDeLista` y
> `limpiarPercent`. El código existe en el repo de la librería
> (`src/utils/cliente.js`, `cuentaCobro.js`, `abastecimiento.js`); falta el
> reexport en `src/utils/index.js` y la publicación. Hasta entonces se usan
> solo del lado cliente o se conserva la implementación local anotada
> (dedup de `/api/leads`); migrar apenas salgan por el subcamino.

### 3.3 Prioridad 2 — componentes (requieren Tailwind, ver §4)

| Objeto | Reemplaza a | Dónde | Nota |
| --- | --- | --- | --- |
| `ConfirmarConPalabra` | confirmación simple | Borrados y anulaciones (adjuntos, API keys, eventos, reapertura de mes) | Doble confirmación de la §12/§3 del ecosistema |
| `RangoFecha` | períodos fijos (`DATE_PERIODS`) | Filtros de Auditoría, Finanzas y Conciliación | Atajos + desde/hasta |
| `SelectorCuentaCobro` + `TarjetaCuentaCobro` | `SelectField` de cuentas | Finanzas / Tesorería | Preselección y virtualización |
| `BloquePago` | tarjetas de medio de pago | Tesorería / portal | Papelera dentro de la tarjeta |
| `ProductCombobox` | combobox de inventario | Ítems de presupuesto | Buscar / elegir / crear producto |
| `BuscadorProveedor` | `SelectField` de proveedor | Trabajos de proveedor | Últimos usados + alta rápida |
| `Cronologia` | `AdminTimeline` | Fichas y portal | Suma carga/error/actualizar honestos |
| `CampanaAvisos` | campana del topbar | Shell | Contrato §16 |
| `PaletaComandos` | `AdminCommandPalette` | Shell | ⌘/Ctrl+K con búsqueda async |

### 3.4 Prioridad 3 — objetos grandes (adoptar en el rediseño)

Los seis objetos que este documento pedía implementar **ya están publicados**:
`TableroKanban` (referencia: `AdminBoard`), `Cronologia` (`AdminTimeline`),
`PlanPagos` (portal y Finanzas), `DocumentoImpresion` (hojas `lbprint`),
`SubidaImagen` (`AdminImageUpload`) y `ProgresoChecklist` (`checklistProgress`).
Se adoptan una sola vez dentro del rediseño (`docs/DISENO-PANEL.md`), no antes,
para no migrar dos veces.

### 3.5 Ya cubierto por el kit propio (no adoptar tal cual)

| Objeto de la librería | Kit de EventOS | Veredicto |
| --- | --- | --- |
| `DataTable` + `CELDA_*` | `AdminTable` (plantilla `--<vista>-cols`, scroll silencioso) | **No** (veredicto del piloto) |
| `ListGridToggle` | `AdminViewSwitch` (lista/tablero/grilla/calendario, recordado) | **No**; el propio es más completo |
| `SearchField`, `PercentField`, `MoneyInput`, `NumberField`, `PhoneField`, `EmailField`, `SerialField`, `PasswordInput`, `PinInput`, `Switch`, `SegmentedField`, `AttachmentInput`, `Combobox`/`CityAutocomplete` | `components/admin/AdminFields.tsx` | Mantener; evaluar pieza por pieza al migrar el kit |
| `ChipEstado`, `Stat`, `Skeleton`, `EmptyState`, `ErrorState`, `Aviso`, `Nota` | `AdminBadge`, `AdminKpi`, `AdminLoadingRows`, `AdminEmpty`, `AdminErrorState`, `AdminNote` | Mantener por ahora; unificar en el rediseño |
| `Modal`, `ConfirmDialog`, `Drawer`, toasts | `AdminDialog` y avisos propios | Mantener; la librería entra si el rediseño lo pide |
| `BancoCombobox` | `<datalist>` + `bankSuggestions()` | Evaluar junto con el campo Banco |
| `RucField` | campo libre | Adoptar cuando se adopte el flujo de RUC |
| `GoogleButton`, `AuthLayout`, `NavLateral`, `MenuDesplegable` | shell y login propios | Baja prioridad |

### 3.6 No aplica

Operación de dispositivos (IMEI, batería, locks), impresoras LAN/ESC-POS,
abastecimiento/manifiesto de envío, buscador de dispositivos y el flujo de
unificar clientes (no hay duplicados hoy).

## 4. Prerequisito de las tandas de componentes: Tailwind

El panel **no tiene Tailwind hoy** (solo PostCSS). Los utils y catálogos son JS
puro y no lo necesitan; **cualquier componente de la librería sí**.

El piloto v0.14 ya validó la base (capturas byte a byte idénticas en el panel):

- `tailwindcss@^3.4` + `autoprefixer`, con `preflight: false` (el reset rompería
  el panel) y `content` acotado que repita los `src/**` de la librería.
- `@import "owncoding-ui/styles.css"` una sola vez, con el shim de tema
  (`--c-*` de la librería ↔ `--a-*` del panel) y el puente `html.dark` ↔
  `data-theme`.
- Costo estimado del piloto: **0,5 día**. Se paga una vez y habilita todas las
  tandas de componentes.

## 5. Plan por tandas (issues propuestos)

| # | Tanda | Alcance | Aceptación | Issue propuesto |
| --- | --- | --- | --- | --- |
| 0 | Pin | `owncoding-ui` → **v0.55.0** | `typecheck`, `test:rules` y `build` verdes sin tocar código | **Hecho (#103)** |
| 1 | Utils puros | Migrar los 3 archivos a `owncoding-ui/utils` (excepto `limpiarPercent`); adoptar `registroConsentimiento`, versión, dedup de clientes, RUC y QR de §3.2 | Mismos valores en pantalla y en los imprimibles; tests de fuente actualizados | `refactor(owncoding-ui): utils por el subcamino y adopciones sin UI` |
| 2 | Base + privacidad | Tailwind (base 0 del piloto) + `AvisoPrivacidad`/`ConsentimientoDatos` en sitio y portal + registro versionado (migración aditiva) | Capturas claro/oscuro 1440/390; casilla no pre-tildada; versión/fecha/canal guardados; brecha B2 de `docs/PRIVACIDAD.md` cerrada | `feat(privacidad): aviso y consentimiento de datos con versión (Ley 7593/2025)` |
| 3 | Operación | `ConfirmarConPalabra`, `RangoFecha`, cuentas/pagos, proveedores y productos de §3.3; incluye la moneda (#99), la fuente única por tipo (#101) y la alineación de formularios (#102) | Flujos críticos probados con rol sin privilegios; sin regresiones visuales | **#99**, **#101**, **#102** |
| 4 | Objetos grandes | `TableroKanban`, `DocumentoImpresion`, `Cronologia`, `PlanPagos`, `SubidaImagen`, `ProgresoChecklist`, `ProductFooter` | Dentro del rediseño, con paridad funcional y capturas | `feat(panel): objetos de owncoding-ui en el rediseño` |
| 5 | Librería (upstream) | Pasar `limpiarPercent` al entry de `utils`; revisar el `content` del preset | Publicado con tests y CHANGELOG | `feat(utils): exportar limpiarPercent desde utils` |

> Las issues **#99** (moneda), **#101** (fuente única por tipo) y **#102**
> (alineación de formularios) ya están abiertas y caen en las tandas 2–3; la de
> privacidad con versión registrada (§12) queda por abrir.

Cada tanda se verifica con `npm run typecheck`, `npm run test:rules` y
`npm run build`; las que tocan UI suman capturas 1440/390 en claro y oscuro
(regla §17).

## 6. Histórico del piloto (v0.14.0)

- Instalar la librería + Tailwind **no cambió el panel**: capturas byte a byte
  idénticas en `/finanzas` y `/clientes`.
- **No adoptar `DataTable`**: no soporta la plantilla `--<vista>-cols` ni el
  scroll silencioso; se mantiene `AdminTable`.
- **`ChipEstado` no se usa tal cual**: sus estados son de dispositivos; los de
  negocio viven en `lib/admin-format.ts` (mismo criterio de la §5.7 del piloto).
- **Tailwind es obligatorio para los componentes, no para las utilidades**: el
  piloto aisló `styles.css` en una ruta de prueba; esa contención es la que la
  Tanda 2 reemplaza por la base definitiva.
- Recorrido del pin: **v0.14.0** (piloto) → **v0.39.0** (utils y catálogos,
  issues #46–#49) → **v0.55.0** (Tanda 0, issue #103).
- Veredicto completo y capturas: `docs/PILOTO-OWNCODING-UI.md`.

## 7. Requisito de deploy (Coolify)

`owncoding-ui` es **público** (`github.com/dariodeoli/owncoding-ui`): no hace
falta token de lectura ni `.npmrc`. Se instala directo desde el tag:

```bash
npm install github:dariodeoli/owncoding-ui#v0.55.0
# package.json → "owncoding-ui": "github:dariodeoli/owncoding-ui#v0.55.0"
```

El build de Coolify (y cualquier `npm install` en un checkout limpio) resuelve
el paquete por HTTPS sin credenciales. Si el repo volviera a ser privado, se
reinstaura el token de lectura (fine-grained, solo lectura de
`dariodeoli/owncoding-ui`) como `GITHUB_TOKEN` de build, o
`//github.com/:_authToken=${GITHUB_TOKEN}` en `.npmrc`.

## 8. Referencias

- `docs/PILOTO-OWNCODING-UI.md` — veredicto del piloto y capturas.
- `docs/PRIVACIDAD.md` — registro de tratamiento y brechas de la Ley 7593/2025.
- `docs/REGLAS-GENERALES.md` — reglas obligatorias de la app.
- `docs/DISENO-PANEL.md` — rediseño donde se adoptan los objetos grandes.
- `dariodeoli/owncoding-ui` — `REGLAS.md` (interfaz), `REGLAS-ECOSISTEMA.md`
  (§12 privacidad, §14 pie), `CHANGELOG.md` y `ADOPCION.md`.

## 9. Verificación de este relevamiento

- Exports: conteo y diff sobre `src/index.js` de `v0.39.0` y `v0.55.0`
  (v0.54.0 → v0.55.0: 0 agregados, 0 quitados).
- Tanda 0 (#103): `npm install` + `typecheck` + `test:rules` (205/205) +
  `build` verdes, sin cambios de código funcional.
- Estabilidad de utils: `git diff` vacío en `moneda.js`, `telefono.js`,
  `bancos.js` y `catalog/ciudades.js` entre `v0.39.0` y `v0.55.0`.
- Imports actuales: `grep` de `from "owncoding-ui"` en `app`, `components`,
  `lib` y `tests`.
- Subcamino: `exports["./utils"]` presente en `package.json` desde antes de
  v0.39.0; `dist/utils.js` sin `"use client"`.
