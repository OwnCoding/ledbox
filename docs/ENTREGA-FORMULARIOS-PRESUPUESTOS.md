# Formularios y presupuestos — entrega #173

Alcance autorizado el 09/10/2026: [OwnCoding/ledbox#173](https://github.com/OwnCoding/ledbox/issues/173).
Plan fuente: `/Users/fredd/.opencode/plan/ledbox-formularios-presupuestos.md`.

## Base y recuperación (fase 0)

- Rama viva: `codex/ledbox-gestion-multiempresa`, base `e0f133c04c06c8bb505365921b6ec2ea77744e7f`, versión 2.1.73, árbol limpio y ref remota cotejada.
- Producción cotejada el 09/10: login v2.1.73; `/api/health` responde `ok`, base `ok`, 44 migraciones. Esto no certifica el SHA de ejecución.
- Los siete commits de las entregas #141, #150, #151, #154, #168 y #169 ya están integrados. Las entregas posteriores hasta v2.1.73 se conservan, incluyendo exclusión de ítems, comparaciones y correcciones del documento/fechas.
- Históricos `LBX-*` preservados, con respaldos y hashes en Secretaría `resguardos/ledbox-20261009/inventario.json`. El WIP histórico de dashboard, detalles operativos, finanzas y equipos no se importa por inferencia.
- Las sesiones de los carriles se trasladan mediante `session_move`; se verifica `pwd` y rama antes de editar. `foreground_cwd` de Herdr puede reflejar el directorio heredado del proceso anterior.
- No se habilitan cola, rondas generales ni vigías. Migraciones y seed de verificación solo en Postgres local.

## Responsabilidad por fases

| Fase | Responsable | Límite de archivos y gate |
|---|---|---|
| 1, 6: kit/compatibilidad | panel (`slot/panel`) | Dependencia/lock/runtime/CI, kit `AdminFields`/`AdminUI`, reglas y estilos base; conserva firmas de consumidores |
| 2: datos/OwnData | plataforma (`slot/plataforma`) | Schema/migraciones aditivas, API clientes/eventos, contratos Client/Event, proveedor RUC y documentación |
| 2: formularios | ops (`slot/operacion`) | Clientes, eventos y altas rápidas; consume contratos de plataforma y kit de panel |
| 3, 4, 5: presupuestos | fin (`slot/finanzas`) | Presupuestos, aritmética/condiciones, API budgets, portal e impresión; contratos Budget sin tocar Client/Event |
| 7: QA | pilot (`slot/pilot`) | Candidato fijado por SHA; pruebas independientes, escritorio/360/390, contratos, pagos, permisos e impresión |
| Integración/publicación | integrador | Único que mergea/pushea la viva; reúne CSS y pruebas, valida migraciones locales, checks, release y smoke |

Los carriles guardan fragmentos CSS fuera del repo hasta liberar `app/globals.css`.
No editan en paralelo el listado de pruebas de `package.json`: el integrador reúne los tests nuevos.
Las ramas compartidas se actualizan por merge sin force ni reescritura de historia.

## Gates de cierre

1. Kit compatible con ref publicada verificable y runtime local/CI/deploy coherentes.
2. Identidad comercial preservada, razón social fiscal separada, localidades y contactos coherentes; OwnData sin credencial admite entrada manual y estados honestos.
3. Alta/edición compactas, sugerencias plegadas, aritmética alquiler/servicios conservada, evento editable con permiso servidor.
4. Condiciones porcentuales/fijas/restantes cierran en PYG sobre el total final; cobros y comprobantes permanecen intactos; documentos aceptados no cambian silenciosamente.
5. Portal e impresión mantienen datos comerciales sin costos internos, con jerarquía de ítems y A4 multipágina.
6. Checks y QA independiente por SHA candidato. Verificaciones mutantes solo en base local.
7. Publicación solo después de gates aprobados; distinguir push, aceptación del Hub y versión/SHA realmente servidos.

## Dependencia externa

OwnData: credencial no provista. Revisar contrato local/documentación; no inventar URL, claves, respuestas ni datos fiscales. La consulta real requiere configuración backend y verificación del proveedor. No bloquea las fases independientes ni la entrada manual.

## Evidencia

Handoffs y resultados por carril: `~/.herdr/worktrees/ledbox/evidencia/plan-formularios/`.
Los resultados finales, SHA candidato y deploy se añaden luego de ejecutar sus gates.

Sonda de publicación (lectura, sin trigger):

```bash
node scripts/verify-release.mjs <versión> <SHA completo>
```

`/api/health` conserva su contrato y añade `version` y `sha` del build. El SHA se
sella desde `SOURCE_COMMIT`/`GITHUB_SHA` o Git durante el build; si no existe
fuente verificable, responde `null` y la sonda falla. No se usa el SHA del
checkout local como evidencia de lo servido.
