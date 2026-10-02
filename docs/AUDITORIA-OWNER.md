# Auditoría UX — panel OWNER/ADMIN y configuraciones privadas (v2.1.63)

**Issue:** #149 · paso 6 del orden recomendado de `docs/AUDITORIA-UX-PROD.md` (la demo pública solo exponía Plan, así que las configuraciones privadas quedaron pendientes).
**Fuente:** build local de la rama viva **v2.1.63**, con un **OWNER real** sembrado (`dariodeoli@gmail.com`) y una sesión **VIEWER** temporal (`auditor.vista@example.com`) para verificar permisos. Producción no se tocó y no se modificó código.
**Método:** la sesión de auditoría no tiene navegador gráfico conectado, así que la evidencia es **(a)** respuestas reales de `/api/admin/*` de la instancia local, guardadas en `~/.herdr/worktrees/ledbox/evidencia/LBX-IMPL/149/api/`, y **(b)** citas de código `archivo:línea`. Al final se lista qué no se pudo ver.

## Mapa de superficies: dónde vive hoy cada área

La guía del dueño (`docs/AUDITORIA-UX-PROD.md`, «Configuración») pedía **9 áreas**. Ajustes dibuja **4 secciones** (`components/admin/modules/AjustesModule.tsx:26-37`: Empresa · Correo · Plan · Usuarios) y Estado **2** (`estado/sistema` y `estado/auditoria`). El resto vive fuera, en módulos operativos o directamente no existe:

| Área pedida | Dónde vive hoy | Rol que la ve | Estado |
| --- | --- | --- | --- |
| Empresa y marca | `/ajustes/empresa`: nombre, identificador (solo lectura) y logos | OWNER/ADMIN | Parcial |
| Usuarios y permisos | `/ajustes/usuarios`: altas, roles, activar/desactivar, invitaciones | OWNER/ADMIN | Completa |
| Cobros y cuentas | No hay sección: **Datos de pago** es un diálogo en Presupuestos (`PresupuestosModule.tsx:462,518`); **cuentas y movimientos** están en Finanzas → panel «Tesorería» (`FinanzasModule.tsx:2876-2944,3027-3084`) | Pago: OWNER/ADMIN · Tesorería: OWNER/ADMIN/FINANCE (`admin-policy.ts:145-147`) | Dispersa |
| Correos | `/ajustes/correo`: remitente, estado de la clave, prueba e historial | OWNER/ADMIN | Lectura + prueba; proveedor por entorno |
| Integraciones | **No existe pantalla**: Google (login/SSO) y Resend (correo) se configuran por variables de entorno | — | No auditable |
| Seguridad | No hay sección de empresa: **PIN y auto-bloqueo** + **API keys** viven en `/perfil` (`PerfilModule.tsx:295-299`) | PIN: cualquiera · API keys: OWNER | Dispersa / personal |
| Plan y facturación | `/ajustes/plan`: plan vigente, consumo, catálogo y solicitud auditada | Lectura: todos · Solicitar: OWNER/ADMIN (`PlanModule.tsx:161`) | Completa, sin pasarela (a propósito) |
| Auditoría | `/estado/auditoria`: KPIs, filtros, tabla y detalle expandible | OWNER/ADMIN | Completa; sin export |
| Sistema y respaldos | `/estado/sistema`: respaldo, historial, base y migraciones | OWNER/ADMIN | Diagnóstico completo; sin acción de respaldo |

Relacionado pero fuera del pedido: **Datos fiscales** es una pestaña de Facturación (`FacturacionModule.tsx:95,102`, `canManageFiscalProfile` en `admin-policy.ts:205-207`), no de Ajustes.

## Permisos visibles (observado contra el API real)

| Endpoint (`/api/admin/…`) | OWNER | VIEWER |
| --- | --- | --- |
| `organization/branding` | 200 | 403 |
| `users`, `invitations` | 200 | 403 |
| `mail` | 200 | 403 |
| `audit` | 200 | 403 |
| `system` | 200 | 403 |
| `api-tokens` | 200 | 403 |
| `plan` | 200 | 200 |
| `profile` | 200 | 200 |
| `treasury` | 200 | 200 (lectura; escribir exige OWNER/ADMIN/FINANCE) |

Coincide con la política de UI: los módulos restringidos se filtran del sidebar (`admin-policy.ts:21-26,127-132`), las subsecciones de Ajustes se dibujan solo si el rol puede (`AjustesModule.tsx:48`), y entrar por URL directa muestra «Acceso restringido» (`AdminShell.tsx:974-978`, `AuditoriaModule.tsx:52-53`, `SistemaModule.tsx:43-50`). El servidor revalida el rol: los 403 de arriba son la defensa real, no solo cosmética. **Sin hallazgos de seguridad de permisos.**

## Hallazgos priorizados

### P1

**H1 — La configuración privada está dispersa y la IA objetivo no está implementada.**
Un OWNER que quiere «configurar la empresa» tiene que saber que: los datos de pago se cargan en Presupuestos (`EmpresaModule.tsx:169-181` solo ofrece un acceso), los datos fiscales en Facturación, las cuentas y la conciliación en Finanzas, y la seguridad personal en Mi perfil. La pantalla Empresa gasta un panel entero para decir «andá a otro módulo» (`EmpresaModule.tsx:169-181`). Impacto: descubribilidad baja y configuración que no se encuentra desde Ajustes. **Propuesta: I1.**

**H2 — Correo: el sistema avisa lo que falta pero no deja resolverlo desde el panel.**
Con `RESEND_API_KEY` ausente, `/ajustes/correo` muestra el aviso y deshabilita «Enviar correo de prueba»; el remitente y la clave son de entorno, no de la empresa (`CorreoModule.tsx:53-105`). La API real confirma `configured:false` y `history:[]`. Impacto: un OWNER sin acceso al servidor queda en un callejón sin salida; el único estado accionable es esperar a que alguien toque el backend. **Propuesta: I2.**

**H3 — Sistema: el respaldo se diagnostica pero no se puede ejecutar.**
`/estado/sistema` alerta con el estado real («No hay ningún respaldo registrado. Revisá el cron…») y da contexto de retención, archivo y disco (`SistemaModule.tsx:84-213,307-311`), pero la única acción es «Actualizar» (lectura). No hay «Respaldar ahora» ni comando copiable. Impacto: ante un respaldo vencido, el OWNER no tiene acción en el panel. **Propuesta: I3.**

### P2

**H4 — Usuarios: dos altas primarias compiten sin jerarquía.**
En la misma pantalla, la toolbar ofrece «Nuevo usuario» (contraseña inicial, `UsuariosModule.tsx:211-224`) y el panel de invitaciones ofrece «Invitar por correo» (`UsuariosModule.tsx:676-689`), ambos `variant="primary"`. No hay guía de cuándo conviene cada camino. Impacto: fricción y altas duplicadas. **Propuesta: I4.**

**H5 — Confirmaciones nativas fuera del patrón del panel.**
Desactivar un usuario (`UsuariosModule.tsx:191-197`), quitar un logo (`EmpresaModule.tsx:106`) y quitar la foto (`PerfilModule.tsx:107`) usan `window.confirm`; el resto del sistema usa diálogo propio (p. ej. revocar una invitación, `UsuariosModule.tsx:526-588`, o revocar una API key, `ApiKeysPanel.tsx:187-207`). Impacto: inconsistencia visual y de accesibilidad. **Propuesta: I4.**

**H6 — No hay «Seguridad» de la empresa: las API keys viven dentro de Mi perfil.**
`/perfil` mezcla datos personales, contraseña, PIN, **API keys de servicio** (solo OWNER, `PerfilModule.tsx:298-299`; `ApiKeysPanel.tsx:21-25`) y sesión en un solo scroll. No hay lista de sesiones activas ni estado de 2FA. Impacto: credenciales de automatización de la empresa escondidas en una pantalla personal. **Propuesta: I1 (sección) + I5.**

**H7 — Auditoría: toolbar densa y sin exportación.**
7 controles fijos en una fila (búsqueda, entidad, actor, desde, hasta, tamaño y «Actualizar», más «Limpiar filtros» condicional; `AuditoriaModule.tsx:151-200`) y el detalle expandible se abre dentro de la tabla (`:264-292`). En móvil se suma lo ya registrado en la segunda pasada («Auditoría» exige desplazamiento horizontal, issue #155). No hay export CSV. **Propuesta: I6.**

**H8 — Ayuda desactualizada de `/ajustes/correo`.**
El texto de ayuda dice «correo de la empresa **y seguridad del panel**» y describe el PIN como parte de esa sección (`lib/module-help.ts:233-244`), pero la seguridad se movió a Mi perfil en la consolidación #56 (`docs/DISENO-PANTALLAS.md:100`). Impacto: la ayuda contradice la pantalla. **Propuesta: I7.**

### P3

- **H9 — Historial de correo fijo a 30 envíos**, sin filtros ni paginación (`CorreoModule.tsx:108`).
- **H10 — Sistema es un scroll largo**: 8 campos de solo lectura en una grilla, más 2 paneles y 1 tabla, sin anclas ni agrupación (`SistemaModule.tsx:128-305`). En móvil es difícil volver al dato buscado.
- **H11 — API keys usa acciones con botón de texto** («Revocar», `ApiKeysPanel.tsx:163-177`) mientras el resto de las tablas usa iconos compactos.

## Lo que funciona bien (a preservar)

- **Permisos**: UI y API alineadas, con revalidación server-side; la demo es solo lectura en los módulos mutantes.
- **Plan**: visible para todos (los topes son información de la empresa) y la solicitud gateada con explicación honesta en la tarjeta (`PlanModule.tsx:314-331`); el texto asume que no hay pasarela y lo dice.
- **Estados vacíos honestos y con acción donde corresponde**: usuarios (`UsuariosModule.tsx:307-316`), invitaciones (`:713-719`), correo (`CorreoModule.tsx:113-115`), tesorería (`FinanzasModule.tsx:3022-3024`), respaldos (`SistemaModule.tsx:216-220`), auditoría (`AuditoriaModule.tsx:206-213`).
- **API keys**: token mostrado una sola vez con copiar, roles acotados (nunca OWNER) y revocación con diálogo explícito (`ApiKeysPanel.tsx:21-25,119-129,187-207`).
- **PIN/contraseña**: auto-avance del PIN y cambio de contraseña que cierra las demás sesiones (`AdminPinSettings.tsx`, `PerfilModule.tsx:146-155`).
- **Sistema**: estado real de respaldo/base/migraciones, con alerta por correo auditada cuando falta respaldo (observado: `backup.status:"never"`, entrada en Auditoría `entity:"System"`).

## Qué no se pudo ver (y por qué)

1. **Captura visual**: el navegador del desktop no está conectado a esta sesión. La evidencia es código + API real; no hay screenshots.
2. **Envío real de correo**: sin `RESEND_API_KEY` en el entorno local, la pantalla queda en «falta configurar»; no se pudo probar el envío ni sus errores reales.
3. **Integraciones (Google/SSO)**: no se probó el flujo OAuth por falta de credenciales; solo se citó `docs/SSO.md` y el código. Además, **no existe una pantalla de Integraciones** que auditar (H1).
4. **Datos fiscales**: son una pestaña operativa de Facturación, fuera del pedido «plan y facturación»; se listan como superficie relacionada, no se auditaron a fondo.

## Issues propuestos (para abrir desde #149)

| # | Título propuesto | Prioridad | Alcance | Evidencia |
| --- | --- | --- | --- | --- |
| I1 | `feat(panel): Ajustes con subnavegación de configuración (Cobros y cuentas · Seguridad · Integraciones)` | P1 | Llevar a Ajustes las 9 áreas de `AUDITORIA-UX-PROD.md`, sin duplicar formularios: mover o enlazar la sección canónica de cada una; registrar rutas en `lib/admin-routes.ts`, `module-help.ts` y las subsecciones de `AjustesModule` | H1, H6 |
| I2 | `feat(correo): configurar el proveedor desde el panel (clave por empresa)` | P1 | Guardar la clave de Resend cifrada por organización (o, mínimo, diagnóstico con instrucciones y reintento); hoy es solo variable de entorno | H2 |
| I3 | `feat(sistema): respaldar ahora desde el panel` | P1 | Acción OWNER/ADMIN que dispara `scripts/backup.mjs` (o equivalente), con estado en vivo y registro en Auditoría | H3 |
| I4 | `fix(usuarios): jerarquía de altas y confirmaciones propias` | P2 | Un CTA primario (definir invitación vs usuario con contraseña) y reemplazar `window.confirm` por el diálogo del panel (Usuarios, Empresa, Perfil) | H4, H5 |
| I5 | `feat(seguridad): sesiones activas y 2FA en la sección de seguridad` | P2 | Lista de sesiones con cierre remoto y estado de segundo factor; el PIN queda en Mi perfil | H6 |
| I6 | `feat(estado/auditoria): exportar CSV y filtros usables en móvil` | P2 | Export de la vista filtrada + toolbar que se pliegue en móvil (coordinado con #155) | H7 |
| I7 | `fix(ayuda): corregir el texto de /ajustes/correo` | P3 | Quitar la referencia a «seguridad del panel»/PIN (vive en Mi perfil) | H8 |
| I8 | `feat(correo): filtros y paginación del historial` | P3 | Buscar por destinatario/estado y navegar más allá de los últimos 30 | H9 |

## Verificación

- Documento **docs-only**: no se tocó código de producto.
- `npm run typecheck` en verde; sin marcadores de conflicto; `git status --porcelain` limpio tras el commit.
- Instancia local usada para la evidencia: base `ledbox_audit149` (Postgres local, puerto 55432) y dev server en 3002; efímera, sin tocar producción. La sesión VIEWER de prueba se creó solo en esa base local.
