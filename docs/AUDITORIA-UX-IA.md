# Auditoría UX/IA — Carga con IA, altas manuales y responsive

Auditoría pedida por el dueño (issue #123, 01-10-2026): qué problemas puede traer
la Carga con IA además de los ya cubiertos por #122, qué datos pide realmente el
alta manual de cada entidad y cómo se porta la app en 390/768/1440.

**Método.** Revisión de código con rutas y líneas citadas, pruebas puntuales de
las funciones puras del motor (`node --import tsx`) y capturas reales del panel,
el portal y el sitio con datos de prueba en un Postgres local
(`evidencia/LBX-IMPL/123/`, 35 PNG). No se cambió código: los pedidos salen como
issues propuestos (§4).

---

## 1. Carga con IA — cobertura de #122 y problemas previstos

### 1.1 Qué ya está cubierto (validación)

| Problema previsto | Estado | Evidencia |
| --- | --- | --- |
| Inyección de prompt desde el texto | **Cubierto**: el prompt marca el texto como DATOS y pide ignorar instrucciones internas | `lib/server/ia-carga.ts` (`instruccionesIa`), tests #120/#122 |
| Duplicados y matches ambiguos | **Cubierto**: candidato claro → `vincular`; ambiguo → opciones + aviso; nunca a ciegas | `asignarExistentes` + tests de umbrales; captura `05-ambiguo-1440` (#122) |
| Idempotencia de lo aplicado | **Cubierto**: cada acción con `Idempotency-Key`; Finanzas ya es idempotente | `components/admin/AdminCargaIa.tsx`; probado con doble POST (#122) |
| Proveedor caído / respuesta inválida | **Cubierto**: 502 `ia_proveedor`, nada se crea | `app/api/admin/ia/carga/route.ts`, tests |
| Permisos por acción | **Cubierto**: cobros con `finance.write`, altas con sus capacidades; avisos sin permiso | ruta + diálogo; E2E OPERATIONS → 403 (#122) |
| Límites y rate-limit | **Cubierto**: 20k de texto, 25 por tipo, 10 llamadas/org/15 min | `lib/ia-carga.ts`, `rateLimit` en la ruta |
| Auditoría del análisis | **Cubierto**: fila `IaCarga` con conteos y modelo (nunca el texto) | ruta + `AUDIT_ENTITIES` |

### 1.2 Hallazgos nuevos (priorizados)

| # | Hallazgo | Prioridad | Evidencia | Propuesta |
| --- | --- | --- | --- | --- |
| IA-1 | **Monedas extranjeras se leen como guaraníes**: `montoDeTexto("USD 100")` → `100` y `"100 dólares"` → `100` (el parser borra letras y toma el número). Un cobro «me pagó USD 100» se registraría por Gs 100 | **Alta** | Probado: `montoDeTexto('USD 100') === 100` (`lib/server/ia-carga.ts`) | Detectar `usd/u$s/dólar/euro/brl` y **no** interpretar: dejar el monto vacío con aviso «monto en otra moneda: cargalo a mano» (no hay cotización en la app) |
| IA-2 | **Sin rollback ni corrección guiada**: lo aplicado se audita y se puede corregir a mano en cada módulo, pero no hay «deshacer» ni camino directo desde el resultado | **Alta** | El resultado solo muestra conteos y errores (`AdminCargaIa.tsx`) | Agrupar la carga con un `lote` en el `AuditLog`, ofrecer «abrir el registro» por fila y «anular lo creado» para clientes/productos sin historial + cobros (PATCH cancel de Finanzas) |
| IA-3 | **Alucinaciones no verificadas contra el texto**: un teléfono/correo/fecha inventado que «parece válido» pasa sin marca (las validaciones son de formato, no de origen) | **Alta** | `normalizarCliente/Evento` validan formato; no comparan con el texto pegado | Verificar cada escalar extraído contra el texto normalizado (dígitos del teléfono/RUC, fecha, nombre) y marcar «no está en el texto» exigiendo confirmación |
| IA-4 | **Fechas `d/m` sin año no ruedan**: con hoy 20-12-2026, «5/1» resuelve 2026-01-05 (pasado) aun en modo futuro; en modo pasado (cobros) «3/10» puede dar una fecha futura | Media | Probado: `fechaDeTexto('5/1', { hoy: '2026-12-20', modo: 'futuro' })` → `2026-01-05` | Rodar el año según el modo: si en evento queda > 30 días en el pasado → +1 año; si en cobro queda en el futuro → −1 año; la fecha elegida ya se muestra en el preview |
| IA-5 | **El pegado se corta sin aviso**: el textarea usa `maxLength = 20.000` y no hay contador; un texto más largo se trunca al pegar y la IA analiza menos de lo que la persona cree | Media | `TextAreaField maxLength={IA_TEXTO_MAX}`; sin contador en `AdminCargaIa.tsx` | Contador visible («18.420/20.000») y aviso al recortar (o bloquear el pegado largo con mensaje) |
| IA-6 | **Sin medidor de costo/cuota**: no se registra el `usage` de tokens del proveedor; se maneja 429 con mensaje claro, pero no hay señal de consumo mensual | Media | El proveedor devuelve `usage` y no se lee; no hay contador en el panel | Guardar tokens por llamada (auditoría `IaCarga`) y mostrar «uso del mes»/alerta de cuota cerca del límite |
| IA-7 | **Sin id de lote**: cada alta se audita por separado; no se puede ver «los 8 registros que aplicó esta carga» | Media | `recordAudit` por acción; el análisis no comparte correlación | `lote: <uuid>` en el `detail` de cada acción aplicada + enlace «Ver en Auditoría» desde el resultado |
| IA-8 | **Alcance no explícito en el diálogo**: qué no hace (usuarios, presupuestos, finanzas sensibles) solo se intuye por los permisos | Baja | Nota de permisos por tarjeta (`AdminCargaIa.tsx`) | Línea «Puede: clientes, eventos, productos y cobros. No toca usuarios, presupuestos ni facturación» |
| IA-9 | **Fecha del cobro informativa**: «me pagó ayer» se muestra resuelto pero el cobro se sella con la fecha del día (el endpoint no acepta fecha de pago) | Media | `AdminCargaIa.tsx` lo dice; `POST /api/admin/finance` usa `now` | Issue de Finanzas: `paidAt` opcional en el cobro cobrado al momento, con auditoría y snapshot |
| IA-10 | **Privacidad**: se manda solo el texto (correcto y documentado), pero pegar un chat completo envía datos de terceros sin aviso específico | Baja/Media | `docs/PRIVACIDAD.md` T10; nota del diálogo | Recordatorio breve «no pegues datos que no necesités» + evaluación de detección de PII (post-fase) |

### 1.3 Lo que la Carga con IA no hace (y conviene decir)

Usuarios y accesos, presupuestos completos, facturación, proveedores/promotoras y
borrados: **fuera de alcance**. Los cobros requieren `finance.write`. El análisis
no escribe: aplica el panel con los endpoints existentes (permisos, aislamiento y
auditoría de cada módulo).

---

## 2. Altas manuales — campos por entidad

Estado real de cada formulario de alta (labels, obligatorios y defaults según
código) y qué se propone simplificar. La referencia es el patrón de #106 («alta
rápida + Más datos plegado»), que hoy solo siguen **cliente** y **evento**.

### 2.1 Cliente — `ClientesModule` + `ClientQuickForm`

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Nombre | Sí (nativo) | Autofoco. El API exige 2–120; el front no valida el largo |
| Teléfono / Correo | No | Validación de front con mensajes es-PY |
| «Más datos» (Empresa, Tipo, RUC/CI, encargado, cargo, tel/correo directo, web, Instagram, WhatsApp, notas, logo) | No | Plegado en alta; abierto en edición |

**Veredicto:** el alta ya es la rápida de #106. **Propuesta:** validar el nombre en
el front con el mensaje del kit (`FIELD_MESSAGES.name`) para no depender del API;
nada más.

### 2.2 Evento — `EventosModule`

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Nombre del evento | Sí (nativo) | Autofoco |
| Cliente | Sí, pero **solo `aria-required`** (Combobox): sin check JS, un envío inválido cae en el error **en inglés** `"Client and event name are required."` | Con «+ Nuevo cliente» al lado (buena fricción cero) |
| Inicio | No | `DateTimeField` |
| «Más datos» (Lugar, Ciudad) | No | Plegado |

**Propuesta:** check JS con mensaje es-PY («Elegí el cliente del evento.»); ofrecer
**Fin** en «Más datos» (el quick de Presupuestos ya lo manda y el alta completa
no: inconsistencia); los 4 ítems de checklist que nacen solos están bien.

### 2.3 Producto / inventario — `InventarioModule`

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Artículo | Sí (nativo) | Sin autofoco |
| Categoría / Tipo / Cantidad / Visible en la web / Imagen / Foto | No | Todo **visible de una** |
| Precios (lista, desde-días, desde-precio, mayorista, desde-días, desde-precio, mínimo) | No | 7 campos visibles de entrada |
| SKU | — | **No existe en el alta ni lo acepta el POST**: el match por SKU depende de datos cargados por fuera |

**Veredicto:** es el alta más pesada (≈13 campos, sin pliegues). **Propuesta:**
plegar «Precios» y «Foto y web» (patrón #106); agregar SKU opcional en «Más datos»
y aceptarlo en el POST; error es-PY para el nombre (`"Name is required."` hoy).

### 2.4 Presupuesto — `PresupuestosModule`

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Cliente | Sí (JS + `aria-required`) | Con quick-create de cliente y evento |
| Título | Sí (nativo) | |
| Producto/servicio, Cantidad, Días, Precio unitario | Sí (nativos) | Cantidad y Días ya vienen en 1 |
| Evento, Costo unitario, Artículo de inventario | No | **Costo unitario es interno** y está a la vista en el alta |
| — | — | Si el required nativo se saltea, el API **crea el presupuesto sin ítems** |

**Propuesta:** mover «Costo unitario» a «Más datos» (es interno y opcional);
rechazar en el API un presupuesto sin ítems (hoy lo acepta); mensaje es-PY
(`"Client and title are required."` hoy); sugerencias de ítems frecuentes
(segunda fase).

### 2.5 Proveedor — `ProveedoresModule`

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Nombre | Sí (nativo + `minLength 2`) | |
| Empresa, Teléfono, Correo, Rubro (default «Otros»), Condiciones, Notas | No | Todo visible |
| Estado (Activo/Inactivo) | No | **El POST lo ignora** (no lee `active`): campo muerto en el alta |

**Propuesta:** quitar el switch «Estado» del alta (o soportarlo en el API);
«Condiciones de pago» como select de opciones frecuentes (Contado, 15/30/60 días)
en vez de texto libre; mensajes es-PY (`"Supplier name is required."` hoy).

### 2.6 Promotora — `PromotorasModule`

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Nombre | Sí (nativo) | Error del API en inglés |
| Teléfono, Especialidades | No | |
| Correo | — | El modelo lo tiene y la auditoría lo registra, pero **no está en el alta** |

**Veredicto:** el alta más simple (3 campos), correcta. **Propuesta:** sumar
Correo opcional y mensajes es-PY.

### 2.7 Transversal a las altas

- **Mensajes del API en inglés** en eventos, presupuestos, proveedores e
  inventario/promotoras (`"Client and event name are required."`,
  `"Name is required."`, `"Supplier name is required."`, `"Client and title are
  required."`): el usuario los ve tal cual cuando el front no valida. Propuesta:
  traducirlos y reusar `FIELD_MESSAGES.required`.
- **`required` nativo** del navegador: el globo de validación sale en el idioma
  del sistema; donde importe, validar en el front con mensajes es-PY.
- **Dos quick-create de cliente** (`ClientQuickForm` y `BudgetQuickCreate`)
  duplican campos y POST: unificar en uno.
- **Rama muerta** `kind: "supplier"` en `/api/admin/resources` (sin llamador): el
  alta real vive en `/api/admin/suppliers`; limpiar para no confundir.

---

## 3. Responsive y facilidad (390 / 768 / 1440)

Base verificada con capturas (`evidencia/LBX-IMPL/123/`): el panel usa drawer
≤980, barra inferior ≤720, tablas con scroll horizontal y aviso «Deslizá para ver
más», KPIs 2-columnas, diálogos a 358 px en 390 y la ficha 360 scrollea; el portal
apila las tablas ≤640 con barra fija de decisión; el sitio colapsa a 1 columna.
Lo que sigue son los puntos flojos.

| # | Hallazgo | Prioridad | Evidencia | Propuesta |
| --- | --- | --- | --- | --- |
| R-1 | **`.admin-plan-row` no tiene breakpoint**: `grid-template-columns` con mínimos ≈31 rem (496 px) dentro de diálogos de 358 px a 390; el diálogo solo scrollea vertical y `body { overflow-x: hidden }` esconde el desborde horizontal | **Alta** | `app/globals.css:1834`; usado en `PresupuestosModule.tsx:2174` y `BudgetPricingDialog.tsx:459` | Un `@media (max-width: 720px)` que apile la fila (Cuota / Vence / Monto / quitar) |
| R-2 | **Acciones sticky incoherentes**: a ≤1379 la **cabecera** de la última columna queda sticky en todas las tablas, pero la fila solo si trae `.admin-cell--actions` (17 de ~48 vistas): en Leads, Usuarios, Proveedores, Promotoras, Auditoría, Correo, Sistema, Plan y Resumen la cabecera «Acciones» queda pegada sobre datos que se deslizan | Media | `app/globals.css:1658-1664`; grep de `admin-cell--actions` | Marcar la última celda de esas vistas o hacer la cabecera sticky condicional a la clase |
| R-3 | **KPIs a 768 en 2 columnas** por conflicto de reglas (una `min-width: 720` quedó pisada por otra posterior; 2 col hasta 899) | Media | `app/globals.css:1317/2411/3444/3445`; captura `dashboard-768.png` | Limpiar reglas muertas y pasar a 3–4 columnas desde 720 si el espacio lo permite |
| R-4 | **Toolbar denso en móvil**: en Inventario los filtros ocupan ~5 filas antes del formulario (búsqueda, 2 selects, 2 fechas, vista, exportar, alta) | Media | Captura `inventario-390.png` | Plegar filtros secundarios en un «Filtros» desplegable ≤720, dejando búsqueda + vista + acción |
| R-5 | **Blancos táctiles < 44 px**: iconos del topbar 34, view switch 30, acciones de fila 28, acciones de tarjeta de tablero 26, steppers del portal 28 | Media | `app/globals.css:1257/2267/1300/2310/2942` | Subirlos a 40–44 px en punteros gruesos (`@media (pointer: coarse)`) |
| R-6 | **768 sin barra inferior** (corta en ≤720) pero con drawer: en tablet la navegación exige abrir el menú | Media | `app/globals.css:2418-2431` vs `3303-3313`; captura `clientes-768.png` | Extender la barra a ≤768 o dejar el sidebar colapsado visible |
| R-7 | **`100vh` sin `dvh`** en drawer, diálogos, hero y portal: en móvil las barras del navegador recortan la parte baja | Baja | `app/globals.css:1590/2420/211/2662` | `100dvh` con fallback |
| R-8 | **`body { overflow-x: hidden }`** global esconde cualquier desborde (R-1 y futuros) en vez de permitir scroll | Baja | `app/globals.css:28` | Revisar caso por caso; dejar el `overflow` al contenedor que corresponda |
| R-9 | **`.admin-dialog-table` recorta sin scroll** (mín ≈29 rem, `overflow: hidden`): la contra-propuesta de ítems a 390 se corta | Baja | `app/globals.css:1846-1850`, `PresupuestosModule.tsx:2022` | Scroll horizontal propio o apilado ≤720 |
| R-10 | **Encabezados y KPIs truncados** («CONT.», «TOTAL CONTRATA…»): aceptable por diseño denso, pero pierde legibilidad sin `title` | Baja | Capturas `clientes-390/768`, `finanzas-390` | Asegurar `title` en todas las celdas/KPIs truncados (varias ya lo tienen) |

**Lo que está bien y conviene no romper:** drawer con backdrop y bloqueo de
scroll, barra inferior con safe-area, aviso «Deslizá para ver más», tablas del
portal apiladas ≤640, barra de decisión del portal, ficha 360 usable a 390 y el
layout del sitio en los tres anchos.

---

## 4. Issues propuestos

| # | Título propuesto | Dominio | Prioridad | Alcance |
| --- | --- | --- | --- | --- |
| 1 | `fix(ia): no interpretar montos en moneda extranjera como guaraníes` | Plataforma | Alta | Detectar USD/US$/€/BRL; monto vacío + aviso; tests |
| 2 | `feat(ia): verificar lo extraído contra el texto y marcar lo no citado` | Plataforma | Alta | Anti-alucinación: comparar escalares; aviso y confirmación |
| 3 | `feat(ia): deshacer/corregir una carga aplicada (lote auditable)` | Plataforma | Alta | `lote` en auditoría; abrir/anular lo creado; cobros cancelables |
| 4 | `fix(ia): fechas d/m coherentes con el modo (rodar el año)` | Plataforma | Media | Eventos +1 año si quedó lejos en el pasado; cobros −1 si quedó futuro |
| 5 | `feat(ia): contador de texto y aviso de recorte en el pegado` | Plataforma | Media | Contador 20k + mensaje; tests del límite |
| 6 | `feat(ia): medidor de uso del proveedor (tokens/cuota)` | Plataforma | Media | Guardar `usage`; mostrar uso del mes y aviso de cuota |
| 7 | `fix(panel): mensajes es-PY y validación de front en altas` | Panel | Media | Eventos, presupuestos, proveedores, inventario, promotoras |
| 8 | `feat(inventario): alta por etapas (precios/foto plegados) + SKU` | Operación | Media | «Más datos»; SKU opcional en POST y formulario |
| 9 | `fix(panel): fila del plan de pagos apilada en móvil` | Panel | Alta | Breakpoint de `.admin-plan-row` (R-1) |
| 10 | `fix(panel): acciones sticky coherentes en todas las tablas` | Panel | Media | R-2 (última celda o cabecera condicional) |
| 11 | `feat(panel): filtros plegables en móvil y KPIs por ancho` | Panel | Media | R-3/R-4 |
| 12 | `fix(panel): blancos táctiles ≥ 40 px en punteros gruesos` | Panel | Media | R-5 |
| 13 | `feat(panel): navegación tablet (barra inferior ≤768) y dvh` | Panel | Baja | R-6/R-7 |
| 14 | `fix(presupuestos): no crear sin ítems y costo interno en «Más datos»` | Operación | Media | API + formulario |
| 15 | `chore(panel): unificar quick-create de cliente y limpiar rama muerta` | Panel | Baja | `ClientQuickForm`/`BudgetQuickCreate`; `resources supplier` |

---

## Anexo · Evidencia

- Capturas: `evidencia/LBX-IMPL/123/` — panel (dashboard, clientes, eventos,
  inventario, presupuestos, finanzas, facturación) en 390/768/1440, altas
  manuales abiertas a 390, ficha de cliente a 390/768, portal demo y sitio en
  390/768/1440. Script: `capturas.mjs`.
- Pruebas puntuales citadas: `montoDeTexto` con moneda extranjera y
  `fechaDeTexto` con `d/m` sin año (ejecutadas con `node --import tsx`).
- Código: líneas citadas en cada hallazgo (rutas del repo).
