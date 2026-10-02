# Auditoría UX de producción — v2.1.61 (escritorio + móvil 390 px)

Fuente: dueño, 01-10-2026. Superficie: **producción real v2.1.61** entrando por la demo, en escritorio y móvil de 390 px (landing, login, dashboard, eventos, clientes, presupuestos, finanzas, plan, modales y portal del cliente). **Sin cambios de código en esta ronda**; es una auditoría visual y funcional.

## Veredicto

La base visual es buena y bastante premium. El problema principal no son los colores: es la densidad de información sin suficiente jerarquía, especialmente en tablas y móvil.

## Prioridad crítica

1. **Rediseñar tablas para móvil**
   - En Eventos desaparece el nombre del evento y quedan visibles fecha, urgencia y acciones.
   - Clientes y Finanzas intentan conservar demasiadas columnas.
   - En móvil deberían convertirse en tarjetas: entidad, estado, fecha/monto y menú •••.
2. **Corregir desbordamientos**
   - El Kanban de Presupuestos queda cortado horizontalmente.
   - La tabla del plan de pagos del portal pierde parte de vencimientos.
   - El mensaje «Deslizá para ver más» ayuda, pero no soluciona la pérdida de información.
3. **Simplificar Finanzas**
   - Es demasiado larga para una sola pantalla. Dividirla en: Resumen · Por confirmar · Por cobrar · Proveedores · Tesorería · Conciliación · Gastos.
4. **Corregir el header de la landing**
   - En escritorio, el logotipo de EventOS aparece visualmente superpuesto en la esquina superior izquierda.

## Mejoras importantes por superficie

### Landing de EventOS

- Reducir ligeramente el espacio vacío del hero.
- Mantener el CTA principal visible antes del pliegue.
- Agregar beneficios cuantificables: ahorro de tiempo, reducción de faltantes, control de margen.
- Mostrar un flujo visual: Cotizá → aprobá → operá → cobrá.
- Agregar una sección específica para productoras, alquiladores y agencias.
- Mejorar la navegación: actualmente «Cómo funciona» y «Preguntas» quedan demasiado separados.

### Login

Visualmente está muy bien. Cambiaría:

- «Owncoding · private workspace» por una identidad totalmente EventOS.
- «LedBox · Panel privado» por el nombre dinámico de la empresa.
- El texto debe vender EventOS como producto multiempresa, no parecer un panel interno creado exclusivamente para LedBox.

### Dashboard

- Reducir inicialmente «Qué mirar hoy» a 5 prioridades y ofrecer «Ver las 37».
- Separar indicadores financieros de indicadores operativos.
- Hacer clickeable toda la tarjeta métrica.
- Permitir personalizar bloques según el rol.
- Convertir alertas en acciones: Cobrar, Asignar responsable, Resolver faltante.

### Clientes

La tabla es demasiado ancha incluso en escritorio.

- Dejar visibles: cliente, contacto principal, deuda, última actividad y estado.
- Mover Instagram, web, email y WhatsApp a un menú •••.
- Abrir la ficha en un drawer lateral.
- Dentro de la ficha: resumen financiero, eventos, presupuestos, conversaciones y archivos.
- Mostrar una señal clara de «requiere atención».

### Presupuestos

- En escritorio: ofrecer filtros por estado encima del Kanban.
- En móvil: usar pestañas de estado, no un tablero horizontal completo.
- Dar prioridad a monto, vencimiento, cliente y próximo paso.
- Unificar impresión, firma y portal dentro de un menú de acciones.
- Las solicitudes del portal deberían abrirse como conversación comparativa: original vs propuesta del cliente.

### Portal del cliente

Es actualmente la superficie más lograda. Tiene buen contexto, estados claros y un CTA móvil útil. Mejoraría:

- Acortar explicaciones repetidas.
- Mantener un resumen sticky con total, vencimiento y botón de decisión.
- Hacer responsive el plan de pagos como tarjetas.
- Colapsar Cronología y Resumen de lo pedido.
- Mostrar primero: productos → total → condiciones → decisión.
- Evitar tantas secciones completamente en mayúsculas.
- Después de autorizar, mostrar una pantalla de éxito muy clara con próximos pasos y descarga.

### Eventos

- En móvil, el nombre del evento debe ser SIEMPRE el primer dato.
- Presentar cada evento como tarjeta con: nombre y cliente; fecha/lugar; avance 2/4; riesgo; equipos; acción principal.
- Separar lista de eventos, calendario y checklist mediante pestañas.
- No mostrar 93 tareas juntas: agrupar por Hoy, Vencidas, Esta semana y Más adelante.

### Configuración

La demo solamente expone visualmente Plan; no se pudieron revisar las configuraciones exclusivas de OWNER/ADMIN. La sección Plan está ordenada, pero debería tener navegación lateral para:

- Empresa y marca
- Usuarios y permisos
- Cobros y cuentas
- Correos
- Integraciones
- Seguridad
- Plan y facturación
- Auditoría
- Sistema y respaldos

## Sistema visual recomendado

- Padding desktop de página: 24px.
- Padding móvil: 16px.
- Cards: 20px desktop y 16px móvil.
- Separación entre secciones: 24px.
- Altura mínima de controles táctiles: 44px.
- Filas de escritorio: 52–56px.
- Usar mayúsculas solamente en etiquetas pequeñas, no en títulos largos.
- Reservar: cyan para navegación/acción; verde para éxito/cobrado; amarillo para pendiente; rojo para vencido/error; violeta únicamente para identidad y selección secundaria.
- Evitar que cada tarjeta tenga un fondo de color diferente si no representa estado.

## Orden recomendado de implementación

1. Tablas móviles, desbordamientos y portal de pagos.
2. Finanzas con subnavegación.
3. Clientes, Eventos y Presupuestos con drawers y menús compactos.
4. Landing y branding multiempresa del login.
5. Tokens globales de espaciado, tipografía, colores, modales y estados.
6. Auditoría específica del panel OWNER y configuraciones privadas.

## Key learnings

1. EventOS ya tiene una identidad visual sólida; el mayor problema es la jerarquía de información.
2. Las tablas necesitan representaciones móviles propias, no solamente desplazamiento horizontal.
3. El portal del cliente es el mejor punto de partida para estandarizar el resto de la experiencia.
