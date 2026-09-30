"use client";

import { useEffect, useMemo, useState } from "react";
import {
  damageSummary,
  formatDateShort,
  formatMoney,
  formatNumber,
  formatTime,
  inventoryAssignmentCountdown,
  inventoryAssignmentState,
  inventoryKindLabel,
  inventoryStatusLabel,
  statusTone,
} from "@/lib/admin-format";
import { canWriteOperations, matchesQuery } from "@/lib/admin-policy";
import { csvBool, csvFilename, downloadCsv, type CsvBlock } from "@/lib/admin-export";
import {
  FIELD_LIMITS,
  FIELD_MESSAGES,
  inventoryImageError,
  inventoryImageValid,
  inventoryPriceValue,
  inventoryPriceWarning,
  inventoryWholesaleDaysValue,
} from "@/lib/field-rules";
import type {
  AdminApiResponse,
  AdminInventoryAvailability,
  AdminInventoryItemRow,
  AdminInventoryRow,
  AdminInventorySubstitute,
} from "@/lib/admin-types";
import { useAdminSession } from "../AdminShell";
import {
  AdminBadge,
  AdminButton,
  AdminCell,
  AdminCountdown,
  AdminDataState,
  AdminEmpty,
  AdminFormPanel,
  AdminKpi,
  AdminNote,
  AdminPanel,
  AdminRow,
  AdminSelect,
  AdminTable,
  AdminToolbar,
} from "../AdminUI";
import { DateField, MoneyField, NumberField, SearchField, SelectField, TextField } from "../AdminFields";
import { adminApiGet, adminSend, useAdminResource } from "@/lib/admin-api";
import { AdminViewSwitch, useAdminModuleView } from "../AdminBoard";
import { AdminCardGrid, type AdminCardData } from "../AdminCards";
import { AdminIcon } from "../AdminIcons";

const KIND_OPTIONS = [
  { value: "ALL", label: "Todos los tipos" },
  { value: "REUSABLE", label: "Reutilizable" },
  { value: "CONSUMABLE", label: "Consumible" },
  { value: "DISPOSABLE", label: "Descartable" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "AVAILABLE", label: "Disponible" },
  { value: "RESERVED", label: "Reservado" },
  { value: "IN_USE", label: "En uso" },
  { value: "MAINTENANCE", label: "Mantenimiento" },
  { value: "RETIRED", label: "Retirado" },
];

const STATUS_PICK_OPTIONS = STATUS_OPTIONS.filter((option) => option.value !== "ALL");

/** Vistas del inventario (issue #57): lista densa y cuadrícula de tarjetas. */
const INVENTARIO_VIEWS = ["list", "grid"] as const;

const EMPTY_FORM = {
  name: "",
  category: "",
  inventoryKind: "REUSABLE",
  quantity: "1",
  imageUrl: "",
  listPrice: "",
  wholesalePrice: "",
  wholesaleFromDays: "0",
  minimumPrice: "",
};

/** Precios del formulario de edición (issue #90), en el contrato de `MoneyField`. */
const EMPTY_PRICES = { listPrice: "", wholesalePrice: "", wholesaleFromDays: "0", minimumPrice: "" };

/**
 * Precio de venta listo para mostrar: Gs formateado o «—» cuando todavía no
 * está cargado (0 = sin precio, nunca un cero engañoso).
 */
function priceText(value: number): string {
  return value > 0 ? formatMoney(value) : "—";
}

/** Regla del mayorista en palabras: `desde 3 días` (0 = sin regla). */
function wholesaleDaysText(days: number): string {
  return days === 1 ? "desde 1 día" : `desde ${formatNumber(days)} días`;
}

/** Mayorista en una línea: `Gs 500.000 · desde 3 días`; sin precio, «—». */
function wholesaleText(item: Pick<AdminInventoryRow, "wholesalePrice" | "wholesaleFromDays">): string {
  if (item.wholesalePrice <= 0) return "—";
  return item.wholesaleFromDays > 0
    ? `${formatMoney(item.wholesalePrice)} · ${wholesaleDaysText(item.wholesaleFromDays)}`
    : formatMoney(item.wholesalePrice);
}

/** Detalle completo de los tres precios para el `title` de una fila o tarjeta. */
function pricesTitle(
  item: Pick<AdminInventoryRow, "listPrice" | "wholesalePrice" | "minimumPrice" | "wholesaleFromDays">,
): string {
  return `Lista ${priceText(item.listPrice)} · Mayorista ${wholesaleText(item)} · Mínimo ${priceText(item.minimumPrice)} (PYG)`;
}

/**
 * Miniatura del ítem (issue #86): la imagen del producto con fallback al ícono
 * del módulo. Nunca queda un cuadro roto: si la URL no carga, vuelve al ícono
 * (misma mecánica que el avatar único del panel).
 */
function InventoryThumb({ item, size = 26 }: { item: Pick<AdminInventoryRow, "imageUrl">; size?: number }) {
  const [failed, setFailed] = useState(false);

  // Una imagen nueva (otro ítem u otra URL) vuelve a intentar cargarla.
  useEffect(() => setFailed(false), [item.imageUrl]);

  return (
    <span className="admin-item-thumb" style={{ width: size, height: size }} aria-hidden="true">
      {item.imageUrl && !failed ? (
        <img
          src={item.imageUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <AdminIcon name="inventory" size={Math.max(12, Math.round(size * 0.5))} />
      )}
    </span>
  );
}

/** Horas de salida/devolución en formato de tabla (es-PY, 24 h). */
function stamp(value: string | null): string {
  return value ? `${formatDateShort(value)} · ${formatTime(value)}` : "—";
}

/** Rango asignado en una línea: `09-oct. 08:00 → 12-oct. 20:00` (fin abierto si falta). */
function rangeStamp(start: string | null, end: string | null): string {
  if (!start && !end) return "Sin fechas";
  if (start && !end) return `${formatDateShort(start)} ${formatTime(start)} → sin fin`;
  if (!start && end) return `sin inicio → ${formatDateShort(end)} ${formatTime(end)}`;
  return `${formatDateShort(start)} ${formatTime(start)} → ${formatDateShort(end)} ${formatTime(end)}`;
}

/** Rango pedido en la vista por rango: `21-sept. 00:00 → 23-sept. 23:59`. */
function dayRangeLabel(from: string, to: string): string {
  return `${formatDateShort(`${from}T00:00`)} 00:00 → ${formatDateShort(`${to}T23:59`)} 23:59`;
}

/**
 * Vista de disponibilidad del equipo (issue #18): día de hoy o rango pedido.
 * Cuando hay rango, cada ítem muestra sus unidades libres en el rango, los
 * rangos comprometidos que se solapan y —al abrir el ítem— los sustitutos de la
 * misma categoría con stock libre. El cálculo vive en el API.
 */
export function InventarioModule() {
  const { role } = useAdminSession();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusBusyId, setStatusBusyId] = useState("");
  const [statusError, setStatusError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [view, setView] = useAdminModuleView("inventario", INVENTARIO_VIEWS);

  // Edición de precios de venta del ítem abierto (issue #90).
  const [priceItem, setPriceItem] = useState<AdminInventoryItemRow | null>(null);
  const [priceForm, setPriceForm] = useState(EMPTY_PRICES);
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceError, setPriceError] = useState("");
  /** El aviso del alta (por ejemplo, precios incoherentes) se muestra en tono warn. */
  const [noticeTone, setNoticeTone] = useState<"ok" | "warn">("ok");

  // Disponibilidad del ítem abierto en el rango pedido (issue #18).
  const [rangeAvailability, setRangeAvailability] = useState<AdminInventoryAvailability | null>(null);
  const [substitutes, setSubstitutes] = useState<AdminInventorySubstitute[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState("");

  const writable = canWriteOperations(role);
  const rangeActive = Boolean(from && to);

  // La lista viaja con el rango cuando está completo: el API devuelve la
  // disponibilidad de cada ítem en ese rango además de la de hoy.
  const listPath = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("startsAt", `${from}T00:00`);
    if (to) params.set("endsAt", `${to}T23:59`);
    const search = params.toString();
    return search ? `/api/admin/inventory?${search}` : "/api/admin/inventory";
  }, [from, to]);

  const resources = useAdminResource(
    listPath,
    (payload) => (payload.inventory ?? []) as AdminInventoryItemRow[],
  );

  const inventory = useMemo(() => resources.data ?? [], [resources.data]);
  const selected = useMemo(() => inventory.find((item) => item.id === selectedId) ?? null, [inventory, selectedId]);

  const rows = useMemo(
    () =>
      inventory
        .filter((item) => (kind === "ALL" ? true : item.kind === kind))
        .filter((item) => (status === "ALL" ? true : item.status === status))
        .filter((item) => matchesQuery(query, [item.name, item.category, item.sku, item.status])),
    [inventory, kind, status, query],
  );

  const totals = useMemo(
    () =>
      inventory.reduce(
        (accumulator, item) => {
          const range = item.availability.range ?? null;
          accumulator.units += item.quantity;
          accumulator.committed += rangeActive ? (range?.committed ?? 0) : item.availability.committedNow;
          accumulator.available += rangeActive ? (range?.available ?? 0) : item.availability.availableNow;
          if (rangeActive ? (range?.overcommitted ?? false) : item.availability.overcommittedNow) accumulator.conflicts += 1;
          return accumulator;
        },
        { units: 0, committed: 0, available: 0, conflicts: 0 },
      ),
    [inventory, rangeActive],
  );

  // Aviso de coherencia de precios (issue #90): se ve mientras se cargan o
  // editan (el guardado no se bloquea; el API devuelve el mismo aviso).
  const formPriceWarning = useMemo(() => {
    const list = inventoryPriceValue(form.listPrice);
    const wholesale = inventoryPriceValue(form.wholesalePrice);
    const minimum = inventoryPriceValue(form.minimumPrice);
    if (list === false || wholesale === false || minimum === false) return null;
    return inventoryPriceWarning({ listPrice: list ?? 0, wholesalePrice: wholesale ?? 0, minimumPrice: minimum ?? 0 });
  }, [form.listPrice, form.wholesalePrice, form.minimumPrice]);

  const editPriceWarning = useMemo(() => {
    const list = inventoryPriceValue(priceForm.listPrice);
    const wholesale = inventoryPriceValue(priceForm.wholesalePrice);
    const minimum = inventoryPriceValue(priceForm.minimumPrice);
    if (list === false || wholesale === false || minimum === false) return null;
    return inventoryPriceWarning({ listPrice: list ?? 0, wholesalePrice: wholesale ?? 0, minimumPrice: minimum ?? 0 });
  }, [priceForm.listPrice, priceForm.wholesalePrice, priceForm.minimumPrice]);

  const selectedPriceWarning = selected ? inventoryPriceWarning(selected) : null;

  // Disponibilidad del ítem abierto en el rango pedido + sustitutos sugeridos.
  useEffect(() => {
    if (!selectedId || !rangeActive) {
      setRangeAvailability(null);
      setSubstitutes([]);
      setRangeError("");
      setRangeLoading(false);
      return;
    }
    const params = new URLSearchParams({ inventoryId: selectedId, startsAt: `${from}T00:00`, endsAt: `${to}T23:59` });
    const controller = new AbortController();
    setRangeLoading(true);
    setRangeError("");
    void adminApiGet<AdminApiResponse>(`/api/admin/inventory?${params.toString()}`, {
      fresh: true,
      signal: controller.signal,
      fallbackError: "No pudimos calcular la disponibilidad del rango.",
    })
      .then((result) => {
        if (!result.ok) {
          if (result.aborted) return;
          setRangeAvailability(null);
          setSubstitutes([]);
          setRangeError(result.error);
          return;
        }
        setRangeAvailability(result.data.availability ?? null);
        setSubstitutes(result.data.substitutes ?? []);
      })
      .finally(() => setRangeLoading(false));
    return () => controller.abort();
  }, [selectedId, rangeActive, from, to]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    const image = form.imageUrl.trim();
    const imageError = inventoryImageError(image);
    if (imageError) {
      setFormError(imageError);
      return;
    }
    const listPrice = inventoryPriceValue(form.listPrice);
    const wholesalePrice = inventoryPriceValue(form.wholesalePrice);
    const minimumPrice = inventoryPriceValue(form.minimumPrice);
    if (listPrice === false || wholesalePrice === false || minimumPrice === false) {
      setFormError(FIELD_MESSAGES.price);
      return;
    }
    const wholesaleFromDays = inventoryWholesaleDaysValue(form.wholesaleFromDays);
    if (wholesaleFromDays === false) {
      setFormError(FIELD_MESSAGES.wholesaleDays);
      return;
    }
    setBusy(true);
    // El alta de ítems vive en `/api/admin/resources` (contrato existente del panel).
    const result = await adminSend<AdminApiResponse>("/api/admin/resources", {
      kind: "inventory",
      name: form.name,
      category: form.category || "General",
      inventoryKind: form.inventoryKind,
      quantity: Number(form.quantity) || 1,
      imageUrl: image,
      listPrice: listPrice ?? 0,
      wholesalePrice: wholesalePrice ?? 0,
      wholesaleFromDays: wholesaleFromDays ?? 0,
      minimumPrice: minimumPrice ?? 0,
    });
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    // El aviso de precios incoherentes no bloquea el alta: se muestra tal cual.
    const warning = typeof result.data.warning === "string" ? result.data.warning : "";
    setNotice(`Ítem «${form.name}» cargado.${warning ? ` ${warning}` : ""}`);
    setNoticeTone(warning ? "warn" : "ok");
    setForm(EMPTY_FORM);
    resources.reload();
  }

  /** Abre la edición de precios del ítem con los valores actuales. */
  function openPrices(item: AdminInventoryItemRow) {
    setShowForm(false);
    setFormError("");
    setPriceError("");
    setNotice("");
    setNoticeTone("ok");
    setPriceItem(item);
    setPriceForm({
      listPrice: item.listPrice > 0 ? String(item.listPrice) : "",
      wholesalePrice: item.wholesalePrice > 0 ? String(item.wholesalePrice) : "",
      wholesaleFromDays: String(item.wholesaleFromDays),
      minimumPrice: item.minimumPrice > 0 ? String(item.minimumPrice) : "",
    });
  }

  /** Guarda los precios de venta del ítem abierto (issue #90). */
  async function submitPrices(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceItem) return;
    setPriceError("");
    setNotice("");
    setNoticeTone("ok");
    const listPrice = inventoryPriceValue(priceForm.listPrice);
    const wholesalePrice = inventoryPriceValue(priceForm.wholesalePrice);
    const minimumPrice = inventoryPriceValue(priceForm.minimumPrice);
    if (listPrice === false || wholesalePrice === false || minimumPrice === false) {
      setPriceError(FIELD_MESSAGES.price);
      return;
    }
    const wholesaleFromDays = inventoryWholesaleDaysValue(priceForm.wholesaleFromDays);
    if (wholesaleFromDays === false) {
      setPriceError(FIELD_MESSAGES.wholesaleDays);
      return;
    }
    setPriceBusy(true);
    const result = await adminSend<AdminApiResponse>("/api/admin/inventory", {
      kind: "prices",
      id: priceItem.id,
      listPrice: listPrice ?? 0,
      wholesalePrice: wholesalePrice ?? 0,
      wholesaleFromDays: wholesaleFromDays ?? 0,
      minimumPrice: minimumPrice ?? 0,
    });
    setPriceBusy(false);
    if (!result.ok) {
      setPriceError(result.error);
      return;
    }
    const warning = typeof result.data.warning === "string" ? result.data.warning : "";
    setNotice(`Precios de «${priceItem.name}» guardados.${warning ? ` ${warning}` : ""}`);
    setNoticeTone(warning ? "warn" : "ok");
    setPriceItem(null);
    setPriceForm(EMPTY_PRICES);
    resources.reload();
  }

  /** CSV del inventario filtrado: cantidades y costos reales de cada ítem. */
  function exportInventory() {
    const units = rows.reduce((sum, item) => sum + item.quantity, 0);
    const available = rows.reduce(
      (sum, item) => sum + (rangeActive ? (item.availability.range?.available ?? 0) : item.availability.availableNow),
      0,
    );
    const committed = rows.reduce(
      (sum, item) => sum + (rangeActive ? (item.availability.range?.committed ?? 0) : item.availability.committedNow),
      0,
    );
    const availabilityLabel = rangeActive ? "Libres en el rango" : "Libres ahora";
    const committedLabel = rangeActive ? "Comprometidas en el rango" : "Comprometidas ahora";
    const blocks: CsvBlock[] = [
      {
        title: rangeActive ? `Inventario · ${from} a ${to}` : "Inventario",
        header: [
          "Artículo",
          "Categoría",
          "SKU",
          "Tipo",
          "Estado",
          "Cantidad",
          availabilityLabel,
          committedLabel,
          "Reposición (PYG)",
          "Costo diario (PYG)",
          "Conflicto",
        ],
        rows: [
          ...rows.map((item) => [
            item.name,
            item.category,
            item.sku ?? "",
            inventoryKindLabel(item.kind),
            inventoryStatusLabel(item.status),
            item.quantity,
            rangeActive ? (item.availability.range?.available ?? 0) : item.availability.availableNow,
            rangeActive ? (item.availability.range?.committed ?? 0) : item.availability.committedNow,
            item.replacementCost,
            item.dailyCost,
            csvBool(rangeActive ? (item.availability.range?.overcommitted ?? false) : item.availability.overcommittedNow),
          ]),
          ["Total", "", "", "", "", units, available, committed, "", "", ""],
        ],
      },
    ];
    downloadCsv(csvFilename("inventario"), blocks);
  }

  async function changeStatus(item: AdminInventoryItemRow, next: string) {
    setStatusBusyId(item.id);
    setStatusError("");
    setNotice("");
    const result = await adminSend("/api/admin/inventory", { kind: "status", id: item.id, status: next });
    setStatusBusyId("");
    if (!result.ok) {
      setStatusError(result.error);
      return;
    }
    setNotice(`«${item.name}» pasó a ${inventoryStatusLabel(next)}.`);
    resources.reload();
  }

  function clearRange() {
    setFrom("");
    setTo("");
  }

  const selectedRange = selected?.availability.range ?? null;

  return (
    <div className="admin-module-page">
      <section className="admin-kpis" aria-label="Indicadores de inventario">
        <AdminKpi label="Ítems" icon="inventory" value={formatNumber(inventory.length)} note="controlados" />
        <AdminKpi label="Unidades" icon="inventory" value={formatNumber(totals.units)} note="en total" />
        <AdminKpi
          label={rangeActive ? "Comprometidas en el rango" : "En eventos ahora"} icon="events"
          value={formatNumber(totals.committed)}
          note={rangeActive ? dayRangeLabel(from, to) : "unidades comprometidas"}
          tone={totals.committed > 0 ? "accent" : undefined}
        />
        <AdminKpi
          label={rangeActive ? "Disponibles en el rango" : "Disponibles ahora"} icon="check"
          value={formatNumber(totals.available)}
          note={totals.conflicts > 0 ? `${formatNumber(totals.conflicts)} ítems en conflicto` : "libres para asignar"}
          tone={totals.available === 0 || totals.conflicts > 0 ? "warn" : "ok"}
        />
      </section>

      <AdminToolbar>
        <SearchField value={query} onChange={setQuery} label="Buscar inventario" placeholder="Buscar por artículo, categoría o SKU…" />
        <AdminSelect value={kind} onChange={setKind} label="Filtrar por tipo" options={KIND_OPTIONS} />
        <AdminSelect value={status} onChange={setStatus} label="Filtrar por estado" options={STATUS_OPTIONS} />
        <div className="admin-field--filter">
          <DateField
            label="Disponible desde"
            max={to || undefined}
            value={from}
            onChange={setFrom}
            title="Primer día del rango de disponibilidad"
          />
        </div>
        <div className="admin-field--filter">
          <DateField
            label="Hasta"
            min={from || undefined}
            value={to}
            onChange={setTo}
            title="Último día del rango de disponibilidad"
          />
        </div>
        {rangeActive ? (
          <AdminButton icon="close" title="Quitar el rango y volver a la disponibilidad de hoy" aria-label="Quitar el rango de disponibilidad" onClick={clearRange}>
            Hoy
          </AdminButton>
        ) : null}
        <AdminViewSwitch view={view} onChange={setView} label="Vista de inventario" views={INVENTARIO_VIEWS} />
        <span className="admin-export">
          <AdminButton
            icon="download"
            onClick={exportInventory}
            title="Exportar el inventario filtrado a CSV"
            aria-label="Exportar el inventario filtrado a CSV"
          >
            Exportar CSV
          </AdminButton>
        </span>
        {writable ? (
          <AdminButton
            variant="primary"
            icon="plus"
            onClick={() => {
              setFormError("");
              setPriceItem(null);
              setShowForm((open) => !open);
            }}
            aria-expanded={showForm}
          >
            Nuevo ítem
          </AdminButton>
        ) : null}
      </AdminToolbar>

      {notice ? <AdminNote tone={noticeTone}>{notice}</AdminNote> : null}
      {statusError ? <AdminNote tone="error">{statusError}</AdminNote> : null}
      {from && !to ? <AdminNote>Elegí «Hasta» para ver la disponibilidad en el rango (mientras tanto se muestra la de hoy).</AdminNote> : null}
      {!from && to ? <AdminNote>Elegí «Disponible desde» para ver la disponibilidad en el rango (mientras tanto se muestra la de hoy).</AdminNote> : null}

      {writable && showForm ? (
        <AdminFormPanel
          title="Nuevo ítem de inventario"
          submitLabel="Cargar ítem"
          onSubmit={submit}
          onCancel={() => setShowForm(false)}
          busy={busy}
          status={formError}
          statusNote={!formError && formPriceWarning ? <AdminNote tone="warn">{formPriceWarning}</AdminNote> : undefined}
        >
          <TextField
            label="Artículo"
            required
            maxLength={120}
            value={form.name}
            onChange={(value) => setForm({ ...form, name: value })}
            placeholder="Ej.: Pantalla LED P3.9 500×500"
          />
          <TextField
            label="Categoría"
            maxLength={80}
            value={form.category}
            onChange={(value) => setForm({ ...form, category: value })}
            placeholder="Ej.: Pantallas"
          />
          <SelectField
            label="Tipo"
            value={form.inventoryKind}
            onChange={(value) => setForm({ ...form, inventoryKind: value })}
            options={[
              { value: "REUSABLE", label: "Reutilizable" },
              { value: "CONSUMABLE", label: "Consumible" },
              { value: "DISPOSABLE", label: "Descartable" },
            ]}
          />
          <NumberField
            label="Cantidad"
            required
            maxLength={6}
            value={form.quantity}
            onChange={(value) => setForm({ ...form, quantity: value })}
          />
          <TextField
            label="Imagen (URL)"
            maxLength={FIELD_LIMITS.image}
            value={form.imageUrl}
            onChange={(value) => setForm({ ...form, imageUrl: value })}
            placeholder="Ej.: /assets/products/pantalla-led.png"
            hint="Ruta interna (/assets/…) o URL http(s). Opcional."
            inputMode="url"
            autoCapitalize="none"
          />
          {/* Vista previa con la misma caja uniforme del módulo (issue #98):
              sin imagen (o con una URL que no carga) muestra el ícono, nunca
              un cuadro roto. */}
          <div className="admin-field">
            <span className="admin-field-label">Vista previa</span>
            <span className="admin-image-preview">
              <InventoryThumb item={{ imageUrl: inventoryImageValid(form.imageUrl.trim()) ? form.imageUrl.trim() : null }} size={64} />
            </span>
          </div>
          <MoneyField
            label="Precio de lista"
            value={form.listPrice}
            onChange={(value) => setForm({ ...form, listPrice: value })}
            hint="En guaraníes; vacío o 0 = sin cargar."
          />
          <MoneyField
            label="Mayorista"
            value={form.wholesalePrice}
            onChange={(value) => setForm({ ...form, wholesalePrice: value })}
            hint="Precio por volumen."
          />
          <NumberField
            label="Mayorista desde (días)"
            maxLength={4}
            value={form.wholesaleFromDays}
            onChange={(value) => setForm({ ...form, wholesaleFromDays: value })}
            hint="0 = sin regla mayorista."
          />
          <MoneyField
            label="Mínimo"
            value={form.minimumPrice}
            onChange={(value) => setForm({ ...form, minimumPrice: value })}
            hint="Piso de venta del ítem."
          />
        </AdminFormPanel>
      ) : null}

      {writable && priceItem ? (
        <AdminFormPanel
          title={`Precios de venta · ${priceItem.name}`}
          submitLabel="Guardar precios"
          onSubmit={submitPrices}
          onCancel={() => setPriceItem(null)}
          busy={priceBusy}
          status={priceError}
          statusNote={!priceError && editPriceWarning ? <AdminNote tone="warn">{editPriceWarning}</AdminNote> : undefined}
        >
          <MoneyField
            label="Precio de lista"
            value={priceForm.listPrice}
            onChange={(value) => setPriceForm({ ...priceForm, listPrice: value })}
            hint="En guaraníes; vacío o 0 = sin cargar."
          />
          <MoneyField
            label="Mayorista"
            value={priceForm.wholesalePrice}
            onChange={(value) => setPriceForm({ ...priceForm, wholesalePrice: value })}
            hint="Precio por volumen."
          />
          <NumberField
            label="Mayorista desde (días)"
            maxLength={4}
            value={priceForm.wholesaleFromDays}
            onChange={(value) => setPriceForm({ ...priceForm, wholesaleFromDays: value })}
            hint="0 = sin regla mayorista."
          />
          <MoneyField
            label="Mínimo"
            value={priceForm.minimumPrice}
            onChange={(value) => setPriceForm({ ...priceForm, minimumPrice: value })}
            hint="Piso de venta del ítem."
          />
        </AdminFormPanel>
      ) : null}

      <AdminDataState
        loading={resources.loading}
        error={resources.error}
        onRetry={resources.reload}
        empty={inventory.length === 0}
        emptyTitle="Inventario vacío" emptyIcon="inventory"
        emptyHint="Cargá los equipos y materiales para asignarlos a los eventos."
      >
        {rows.length === 0 ? (
          <AdminEmpty icon="search" title="Sin resultados" hint="Probá con otro término de búsqueda o cambiá los filtros." />
        ) : view === "grid" ? (
          <AdminCardGrid label="Inventario" cards={rows.map((item): AdminCardData => {
            const { availableNow, overcommittedNow, range } = item.availability;
            const available = rangeActive ? (range?.available ?? 0) : availableNow;
            const overcommitted = rangeActive ? (range?.overcommitted ?? false) : overcommittedNow;
            const conflictEvents = range?.conflicts ?? [];
            const availableTitle = `${formatNumber(available)} libres de ${formatNumber(item.quantity)} · comprometidas ${
              rangeActive ? `entre ${dayRangeLabel(from, to)}` : "ahora"
            }${conflictEvents.length > 0 ? ` · ${conflictEvents.map((conflict) => `${conflict.eventName} (${formatNumber(conflict.quantity)})`).join(", ")}` : ""}`;
            return {
              id: item.id,
              title: (
                <span className="admin-item-identity">
                  <InventoryThumb item={item} size={32} />
                  <span className="admin-item-name">{item.name}</span>
                </span>
              ),
              titleTooltip: item.sku ? `${item.name} · ${item.sku}` : item.name,
              subtitle: item.sku ? `SKU ${item.sku} · ${item.category}` : item.category,
              badges: [
                { label: inventoryKindLabel(item.kind), tone: statusTone(item.kind) },
                ...(overcommitted ? [{ label: "Conflicto", tone: "danger" as const, title: "Hay más unidades comprometidas que las que tiene el ítem." }] : []),
              ],
              fields: [
                { label: "Cantidad", value: formatNumber(item.quantity), title: `${formatNumber(item.quantity)} unidades` },
                { label: rangeActive ? "Libres en rango" : "Libres ahora", value: formatNumber(available), title: availableTitle },
                { label: "Reposición", value: formatMoney(item.replacementCost), title: formatMoney(item.replacementCost) },
                { label: "Costo diario", value: formatMoney(item.dailyCost), title: formatMoney(item.dailyCost) },
                { label: "Precio lista", value: priceText(item.listPrice), title: pricesTitle(item) },
                { label: "Mayorista", value: wholesaleText(item), title: pricesTitle(item) },
                { label: "Mínimo", value: priceText(item.minimumPrice), title: pricesTitle(item) },
                {
                  label: "Estado",
                  value: <AdminBadge tone={statusTone(item.status)}>{inventoryStatusLabel(item.status)}</AdminBadge>,
                  title: inventoryStatusLabel(item.status),
                },
              ],
              footer: (
                <>
                  {writable ? (
                    <AdminSelect
                      className="admin-filter admin-filter--cell"
                      value={item.status}
                      disabled={statusBusyId === item.id}
                      onChange={(value) => void changeStatus(item, value)}
                      label={`Cambiar estado: ${item.name}`}
                      title={`Cambiar estado: ${item.name}`}
                      options={STATUS_PICK_OPTIONS}
                    />
                  ) : null}
                  <span className="admin-actions">
                    {writable ? (
                      <AdminButton
                        icon="edit"
                        title={`Editar precios: ${item.name}`}
                        aria-label={`Editar precios: ${item.name}`}
                        onClick={() => openPrices(item)}
                      />
                    ) : null}
                    <AdminButton
                      icon="info"
                      title={`Ver asignaciones y disponibilidad: ${item.name}`}
                      aria-label={`Ver asignaciones y disponibilidad: ${item.name}`}
                      onClick={() => setSelectedId((current) => (current === item.id ? "" : item.id))}
                    />
                  </span>
                </>
              ),
            };
          })} />
        ) : (
          <AdminTable
            view="inventario"
            label="Inventario"
            columns={[
              { label: "Artículo" },
              { label: "Categoría" },
              { label: "Tipo" },
              { label: "Cantidad", end: true },
              { label: rangeActive ? "Libres en rango" : "Libres ahora", end: true },
              { label: "Reposición", end: true },
              { label: "Costo diario", end: true },
              { label: "Precios", end: true },
              { label: "Estado" },
              { label: "Acciones", end: true },
            ]}
          >
            {rows.map((item) => {
              const { availableNow, committedNow, overcommittedNow, range } = item.availability;
              const available = rangeActive ? (range?.available ?? 0) : availableNow;
              const committed = rangeActive ? (range?.committed ?? 0) : committedNow;
              const overcommitted = rangeActive ? (range?.overcommitted ?? false) : overcommittedNow;
              const conflictEvents = range?.conflicts ?? [];
              return (
                <AdminRow key={item.id}>
                  <AdminCell title={item.name}>
                    <span className="admin-item-identity">
                      <InventoryThumb item={item} />
                      <span className="admin-item-name">
                        <strong>{item.name}</strong>
                        {item.sku ? <span className="admin-code"> · {item.sku}</span> : null}
                      </span>
                    </span>
                  </AdminCell>
                  <AdminCell title={item.category}>{item.category}</AdminCell>
                  <AdminCell>
                    <AdminBadge tone={statusTone(item.kind)}>{inventoryKindLabel(item.kind)}</AdminBadge>
                  </AdminCell>
                  <AdminCell end title={`${formatNumber(item.quantity)} unidades`}>
                    {formatNumber(item.quantity)}
                  </AdminCell>
                  <AdminCell
                    end
                    title={`${formatNumber(available)} libres de ${formatNumber(item.quantity)} · ${formatNumber(committed)} comprometidas ${
                      rangeActive ? `entre ${dayRangeLabel(from, to)}` : "ahora"
                    }${conflictEvents.length > 0 ? ` · ${conflictEvents.map((conflict) => `${conflict.eventName} (${formatNumber(conflict.quantity)})`).join(", ")}` : ""}`}
                  >
                    <span className="admin-nowrap" data-tone={available === 0 ? "warn" : undefined}>
                      {formatNumber(available)}
                    </span>
                    {overcommitted ? (
                      <AdminBadge
                        tone="danger"
                        title={
                          rangeActive
                            ? "Hay más unidades comprometidas en el rango que las que tiene el ítem."
                            : "Hay más unidades asignadas a eventos vigentes que las que tiene el ítem."
                        }
                      >
                        Conflicto
                      </AdminBadge>
                    ) : null}
                  </AdminCell>
                  <AdminCell end title={formatMoney(item.replacementCost)}>
                    {formatMoney(item.replacementCost)}
                  </AdminCell>
                  <AdminCell end title={formatMoney(item.dailyCost)}>
                    {formatMoney(item.dailyCost)}
                  </AdminCell>
                  <AdminCell end title={pricesTitle(item)}>
                    <span className="admin-cell-stack">
                      <span className="admin-nowrap">{priceText(item.listPrice)}</span>
                      {item.wholesalePrice > 0 || item.minimumPrice > 0 ? (
                        <small className="admin-cell-sub">
                          {item.wholesalePrice > 0
                            ? `May. ${formatNumber(item.wholesalePrice)}${item.wholesaleFromDays > 0 ? ` (${item.wholesaleFromDays} d)` : ""}`
                            : null}
                          {item.wholesalePrice > 0 && item.minimumPrice > 0 ? " · " : null}
                          {item.minimumPrice > 0 ? `Mín. ${formatNumber(item.minimumPrice)}` : null}
                        </small>
                      ) : null}
                    </span>
                  </AdminCell>
                  <AdminCell title={writable ? `Cambiar estado: ${item.name}` : `Estado: ${inventoryStatusLabel(item.status)}`}>
                    {writable ? (
                      <AdminSelect
                        className="admin-filter admin-filter--cell"
                        value={item.status}
                        disabled={statusBusyId === item.id}
                        onChange={(value) => void changeStatus(item, value)}
                        label={`Cambiar estado: ${item.name}`}
                        title={`Cambiar estado: ${item.name}`}
                        options={STATUS_PICK_OPTIONS}
                        tone={statusTone(item.status)}
                      />
                    ) : (
                      <AdminBadge tone={statusTone(item.status)}>{inventoryStatusLabel(item.status)}</AdminBadge>
                    )}
                  </AdminCell>
                  <AdminCell end className="admin-cell--actions">
                    <span className="admin-actions">
                      {writable ? (
                        <AdminButton
                          icon="edit"
                          title={`Editar precios: ${item.name}`}
                          aria-label={`Editar precios: ${item.name}`}
                          onClick={() => openPrices(item)}
                        />
                      ) : null}
                      <AdminButton
                        icon="info"
                        title={`Ver asignaciones y disponibilidad: ${item.name}`}
                        aria-label={`Ver asignaciones y disponibilidad: ${item.name}`}
                        onClick={() => setSelectedId((current) => (current === item.id ? "" : item.id))}
                      />
                    </span>
                  </AdminCell>
                </AdminRow>
              );
            })}
          </AdminTable>
        )}
      </AdminDataState>

      {selected ? (
        <AdminPanel
          title={`Disponibilidad · ${selected.name}`} icon="inventory"
          meta={
            rangeActive
              ? `${formatNumber(selectedRange?.available ?? 0)} de ${formatNumber(selected.quantity)} libres entre ${dayRangeLabel(from, to)}`
              : `${formatNumber(selected.availability.availableNow)} de ${formatNumber(selected.quantity)} libres ahora`
          }
          action={
            <span className="admin-panel-actions">
              {writable ? (
                <AdminButton
                  icon="edit"
                  title={`Editar precios: ${selected.name}`}
                  aria-label={`Editar precios: ${selected.name}`}
                  onClick={() => openPrices(selected)}
                />
              ) : null}
              <AdminButton
                icon="close"
                title="Cerrar disponibilidad"
                aria-label="Cerrar disponibilidad"
                onClick={() => setSelectedId("")}
              />
            </span>
          }
        >
          {selected.imageUrl ? (
            <figure className="admin-item-figure">
              <InventoryThumb item={selected} size={72} />
              <figcaption>
                {selected.category}
                {selected.sku ? ` · ${selected.sku}` : ""}
              </figcaption>
            </figure>
          ) : null}
          <dl className="admin-item-prices">
            <div>
              <dt>Precio de lista</dt>
              <dd>{priceText(selected.listPrice)}</dd>
            </div>
            <div>
              <dt>Mayorista</dt>
              <dd>{wholesaleText(selected)}</dd>
            </div>
            <div>
              <dt>Mínimo</dt>
              <dd>{priceText(selected.minimumPrice)}</dd>
            </div>
          </dl>
          {selectedPriceWarning ? <AdminNote tone="warn">{selectedPriceWarning}</AdminNote> : null}
          {rangeActive ? (
            rangeLoading ? (
              <AdminNote>Calculando la disponibilidad del rango…</AdminNote>
            ) : rangeError ? (
              <AdminNote tone="error">{rangeError}</AdminNote>
            ) : (
              <>
                <AdminNote tone={rangeAvailability && rangeAvailability.available === 0 ? "error" : undefined}>
                  {rangeAvailability
                    ? `${formatNumber(rangeAvailability.available)} de ${formatNumber(rangeAvailability.total)} unidades libres entre ${dayRangeLabel(from, to)}.`
                    : "Sin datos de disponibilidad para el rango."}
                  {rangeAvailability?.blocked
                    ? ` «${rangeAvailability.name}» está ${rangeAvailability.status === "MAINTENANCE" ? "en mantenimiento" : "retirado"}: no se puede asignar.`
                    : ""}
                  {rangeAvailability && rangeAvailability.conflicts.length > 0
                    ? ` Comprometidas: ${rangeAvailability.conflicts
                        .map((conflict) => `${conflict.eventName} (${formatNumber(conflict.quantity)})`)
                        .join(", ")}.`
                    : " Sin rangos comprometidos en el rango."}
                </AdminNote>

                {rangeAvailability && rangeAvailability.conflicts.length > 0 ? (
                  <AdminTable
                    view="inventario-rangos"
                    label={`Rangos comprometidos de ${selected.name} en el rango`}
                    columns={[
                      { label: "Evento" },
                      { label: "Rango comprometido" },
                      { label: "Cantidad", end: true },
                    ]}
                  >
                    {rangeAvailability.conflicts.map((conflict) => (
                      <AdminRow key={conflict.id}>
                        <AdminCell title={conflict.eventName}>{conflict.eventName}</AdminCell>
                        <AdminCell title={rangeStamp(conflict.startsAt, conflict.endsAt)}>
                          {rangeStamp(conflict.startsAt, conflict.endsAt)}
                        </AdminCell>
                        <AdminCell end title={`${formatNumber(conflict.quantity)} unidades`}>
                          {formatNumber(conflict.quantity)}
                        </AdminCell>
                      </AdminRow>
                    ))}
                  </AdminTable>
                ) : null}

                {substitutes.length > 0 ? (
                  <AdminTable
                    view="inventario-sustitutos"
                    label={`Sustitutos de ${selected.name} con stock libre en el rango`}
                    columns={[
                      { label: "Sustituto" },
                      { label: "Categoría" },
                      { label: "Libres", end: true },
                      { label: "Total", end: true },
                      { label: "Estado" },
                    ]}
                  >
                    {substitutes.map((substitute) => (
                      <AdminRow key={substitute.id}>
                        <AdminCell title={substitute.name}>
                          <strong>{substitute.name}</strong>
                          {substitute.sku ? <span className="admin-code"> · {substitute.sku}</span> : null}
                        </AdminCell>
                        <AdminCell title={substitute.category}>{substitute.category}</AdminCell>
                        <AdminCell
                          end
                          title={`${formatNumber(substitute.available)} libres de ${formatNumber(substitute.total)} en el rango (${formatNumber(substitute.committed)} comprometidas)`}
                        >
                          <span className="admin-nowrap">{formatNumber(substitute.available)}</span>
                        </AdminCell>
                        <AdminCell end title={`${formatNumber(substitute.total)} unidades`}>
                          {formatNumber(substitute.total)}
                        </AdminCell>
                        <AdminCell>
                          <AdminBadge tone={statusTone(substitute.status)}>{inventoryStatusLabel(substitute.status)}</AdminBadge>
                        </AdminCell>
                      </AdminRow>
                    ))}
                  </AdminTable>
                ) : (
                  <AdminNote>
                    Sin sustitutos de la categoría «{selected.category}» con stock libre en el rango.
                  </AdminNote>
                )}
                <p className="admin-note">
                  Los sustitutos se vinculan desde el presupuesto (Presupuestos → Inventario del presupuesto) para que la
                  aprobación reserve el reemplazo.
                </p>
              </>
            )
          ) : (
            <AdminNote>Elegí un rango (desde y hasta) para ver los rangos comprometidos y los sustitutos sugeridos.</AdminNote>
          )}

          {selected.assignments.length === 0 ? (
            <AdminEmpty
              icon="inventory"
              title="Sin asignaciones"
              hint="Los equipos se asignan a los eventos con cantidad y rango de fechas desde el módulo Eventos, o se reservan al aprobar un presupuesto con ítems vinculados."
            />
          ) : (
            <AdminTable
              view="inventario-asignaciones"
              label={`Asignaciones de ${selected.name}`}
              columns={[
                { label: "Evento" },
                { label: "Rango" },
                { label: "Cantidad", end: true },
                { label: "Salida" },
                { label: "Devolución" },
                { label: "Estado" },
                { label: "Daños" },
              ]}
            >
              {selected.assignments.map((assignment) => {
                const state = inventoryAssignmentState(assignment);
                const countdown = inventoryAssignmentCountdown(assignment);
                const damages = damageSummary(assignment.damagedQuantity, assignment.missingQuantity);
                const startsAt = assignment.startsAt ?? assignment.event.startsAt;
                const endsAt = assignment.endsAt ?? assignment.event.endsAt ?? startsAt;
                return (
                  <AdminRow key={assignment.id}>
                    <AdminCell title={assignment.event.name}>{assignment.event.name}</AdminCell>
                    <AdminCell title={startsAt && endsAt ? rangeStamp(startsAt, endsAt) : "Sin fechas"}>
                      {rangeStamp(startsAt, endsAt)}
                    </AdminCell>
                    <AdminCell end title={`${formatNumber(assignment.quantity)} unidades`}>
                      {formatNumber(assignment.quantity)}
                    </AdminCell>
                    <AdminCell title={assignment.checkedOutAt ? `Salida: ${stamp(assignment.checkedOutAt)}` : undefined}>
                      {stamp(assignment.checkedOutAt)}
                    </AdminCell>
                    <AdminCell title={assignment.checkedInAt ? `Devolución: ${stamp(assignment.checkedInAt)}` : undefined}>
                      {stamp(assignment.checkedInAt)}
                    </AdminCell>
                    <AdminCell title={countdown ? countdown.title : "Asignación cerrada"}>
                      <AdminBadge tone={state.tone}>{state.label}</AdminBadge>
                      {countdown ? (
                        <AdminCountdown
                          value={countdown.at}
                          short
                          className="admin-countdown--inline"
                          title={`${countdown.title}: ${selected.name}`}
                        />
                      ) : null}
                    </AdminCell>
                    <AdminCell
                      title={damages ? `${damages}${assignment.damageNotes ? ` · ${assignment.damageNotes}` : ""}` : "Sin daños ni faltantes"}
                    >
                      {damages ?? "—"}
                    </AdminCell>
                  </AdminRow>
                );
              })}
            </AdminTable>
          )}
        </AdminPanel>
      ) : null}
    </div>
  );
}
