"use client";

import { useMemo, useState } from "react";
import {
  AdminButton,
  AdminDialog,
  AdminNote,
} from "@/components/admin/AdminUI";
import {
  AttachmentInput,
  DateField,
  MoneyField,
  NumberField,
  PercentField,
  SelectField,
  SwitchField,
  TextAreaField,
  TextField,
} from "@/components/admin/AdminFields";
import { BudgetReferenceLinks } from "./BudgetReferenceLinks";
import { InventoryLinkPicker } from "./BudgetInventoryPicker";
import { quoteProductPrice } from "@/lib/quote-sharing";
import { inventoryImageUrl } from "@/lib/server/inventory-images";
import { useAdminSession } from "@/components/admin/AdminShell";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { adminApiUpload, adminSend } from "@/lib/admin-api";
import { budgetReference, formatDate, formatMoney, formatNumber, invoiceTaxTypeLabel } from "@/lib/admin-format";
import {
  BUDGET_ATTACHMENT_MAX_BYTES,
  type AdminBudgetAttachmentRow,
  type AdminInventoryLink,
  type AdminBudgetRow,
} from "@/lib/admin-types";
import { discountForPrice, distributePrice, internalCostOf, marginOf, priceForMargin } from "@/lib/budget-costs";

/**
 * Precio, condiciones y adjunto de un presupuesto (issue #65): el lugar donde el
 * dueño define el **precio final** con su margen a la vista, separa los costos
 * internos (materiales y mano de obra, además del costo por ítem) y completa los
 * datos que ve el cliente (vigencia, entrega, IVA, garantía, observaciones).
 *
 * Los costos y el margen son internos: no se publican en el portal, el
 * imprimible ni el link enviado (lo fija `tests/budget-privacy.test.ts`). Lo
 * aprobado por el cliente no se reescribe: sin aprobación, el precio y los datos
 * del cliente se editan; los costos internos se pueden corregir siempre.
 */

type ItemDraft = {
  excluded?: boolean;
  inventory: AdminInventoryLink | null;
  id: string | null;
  name: string;
  quantity: string;
  days: string;
  unitPrice: string;
  costPrice: string;
};

type Draft = {
  items: ItemDraft[];
  materialCost: string;
  laborCost: string;
  price: string;
  priceAdjustment: number;
  marginPercent: string;
  validUntil: string;
  deliveryAt: string;
  ivaType: string;
  warranty: string;
  notes: string;
};

const IVA_OPTIONS = [
  { value: "", label: "Sin definir" },
  { value: "IVA10", label: invoiceTaxTypeLabel("IVA10") },
  { value: "IVA5", label: invoiceTaxTypeLabel("IVA5") },
  { value: "EXEMPT", label: invoiceTaxTypeLabel("EXEMPT") },
];

function toItemDraft(item: AdminBudgetRow["items"][number]): ItemDraft {
  return {
    inventory: item.inventory ? { ...item.inventory, imageUrl: inventoryImageUrl({ ...item.inventory, imageUrl: item.inventory.imageUrl ?? null }) } : null,
    id: item.id,
    excluded: Boolean(item.excluded),
    name: item.name,
    quantity: String(item.quantity),
    days: String(item.days),
    unitPrice: String(item.unitPrice),
    costPrice: String(item.costPrice),
  };
}

function draftFrom(budget: AdminBudgetRow): Draft {
  return {
    items: budget.items.map(toItemDraft),
    materialCost: String(budget.materialCost ?? 0),
    laborCost: String(budget.laborCost ?? 0),
    price: String(budget.total),
    priceAdjustment: budget.total - budget.items.reduce((sum, item) => sum + (item.excluded ? 0 : item.quantity * item.days * item.unitPrice), 0),
    marginPercent: "",
    validUntil: budget.validUntil ? budget.validUntil.slice(0, 10) : "",
    deliveryAt: budget.deliveryAt ? budget.deliveryAt.slice(0, 10) : "",
    ivaType: budget.ivaType ?? "",
    warranty: budget.warranty ?? "",
    notes: budget.notes ?? "",
  };
}

function number(value: string): number {
  const parsed = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function BudgetPricingDialog({
  budget,
  onClose,
  onSaved,
}: {
  budget: AdminBudgetRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { organization } = useAdminSession();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(budget));
  const [attachments, setAttachments] = useState<AdminBudgetAttachmentRow[]>(budget.attachments ?? []);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const approved = Boolean(budget.approvedAt);
  const closed = budget.status === "LOST" || budget.status === "CANCELLED";

  const priced = useMemo(
    () =>
      draft.items.map((item) => {
        const quantity = Math.max(1, number(item.quantity));
        const days = Math.max(1, number(item.days));
        const unitPrice = number(item.unitPrice);
        const costPrice = number(item.costPrice);
        return { inventoryId: item.inventory?.id ?? null, id: item.id, name: item.name, quantity, days, unitPrice, costPrice, excluded: item.excluded, subtotal: item.excluded ? 0 : quantity * days * unitPrice };
      }),
    [draft.items],
  );
  const itemsSubtotal = priced.reduce((sum, item) => sum + item.subtotal, 0);
  const cost = internalCostOf({
    materialCost: number(draft.materialCost),
    laborCost: number(draft.laborCost),
    items: priced.filter((item) => !item.excluded).map((item) => ({ quantity: item.quantity, days: item.days, costPrice: item.costPrice })),
  });
  const price = number(draft.price);
  const margin = marginOf(price, cost.total);
  const intent = discountForPrice(itemsSubtotal, price);
  const needsRepricing = !intent.ok && price > 0;
  const activePriced = priced.filter((item) => !item.excluded);
  const repriced = needsRepricing ? distributePrice(activePriced, price) : null;
  const marginPercentValue = draft.marginPercent ? Number(draft.marginPercent.replace(",", ".")) : null;
  const suggested = marginPercentValue !== null && Number.isFinite(marginPercentValue) ? priceForMargin(cost.total, marginPercentValue) : null;

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setDraft((current) => {
      const old = current.items[index];
      const next = { ...old, ...patch };
      const subtotal = (item: ItemDraft) => item.excluded ? 0 : Math.max(1, number(item.quantity)) * Math.max(1, number(item.days)) * number(item.unitPrice);
      const items = current.items.map((item, position) => position === index ? next : item);
      return { ...current, price: String(Math.max(0, items.reduce((sum, item) => sum + subtotal(item), 0) + current.priceAdjustment)), items };
    });
  }

  /** Ajusta los precios unitarios para llegar al precio final escrito (misma suma). */
  function applySuggestedMargin() {
    if (suggested === null) {
      setError("El margen tiene que estar entre 0 y 99,99 % y el costo interno tiene que ser mayor a cero.");
      return;
    }
    setError("");
    setDraft((current) => ({ ...current, price: String(suggested), priceAdjustment: suggested - itemsSubtotal }));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (priced.length === 0 || priced.some((item) => !item.name.trim())) {
      setError("El presupuesto necesita al menos un ítem con nombre.");
      return;
    }
    setBusy(true);
    try {
      // 1) Ítems: se guardan si cambió algo (o si el precio final obliga a
      //    repartirlo entre los precios unitarios).
      const itemsPayload = priced.map((item) => ({
        id: item.id ?? undefined,
        name: item.name,
        quantity: item.quantity,
        days: item.days,
        unitPrice: needsRepricing && !item.excluded ? repriced?.items[activePriced.indexOf(item)]?.unitPrice ?? item.unitPrice : item.unitPrice,
        costPrice: item.costPrice,
        inventoryId: item.inventoryId,
      }));
      const itemsChanged =
        needsRepricing ||
        priced.length !== budget.items.length ||
        priced.some((item, index) => {
          const original = budget.items[index];
          return (
            !item.id ||
            !original ||
            item.inventoryId !== (original.inventoryId ?? null) ||
            item.name !== original.name ||
            item.quantity !== original.quantity ||
            item.days !== original.days ||
            item.unitPrice !== original.unitPrice ||
            item.costPrice !== original.costPrice
          );
        });
      if (itemsChanged) {
        if (approved || closed) {
          setError("El presupuesto ya está aprobado o cerrado: sus ítems no se pueden cambiar.");
          return;
        }
        const itemsResult = await adminSend(`/api/admin/budgets`, { kind: "items", budgetId: budget.id, items: itemsPayload }, "PATCH");
        if (!itemsResult.ok) {
          setError(itemsResult.error);
          return;
        }
      }

      // 2) Precio final y condiciones: el precio se aplica como descuento cuando
      //    entra en los ítems; si hubo reparto de precios, no hay descuento.
      const discount = needsRepricing ? 0 : intent.ok ? intent.discount : 0;
      const result = await adminSend(
        "/api/admin/budgets",
        {
          kind: "commercial",
          budgetId: budget.id,
          discount,
          materialCost: number(draft.materialCost),
          laborCost: number(draft.laborCost),
          validUntil: draft.validUntil || null,
          deliveryAt: draft.deliveryAt || null,
          ivaType: draft.ivaType || null,
          warranty: draft.warranty,
          notes: draft.notes,
        },
        "PATCH",
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(needsRepricing ? "Precio final y precios de los ítems guardados." : "Precio, costos y condiciones guardados.");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function setAttachmentVisibility(attachment: AdminBudgetAttachmentRow, clientVisible: boolean) {
    if (attachmentBusy) return;
    setAttachmentBusy(true); setError("");
    try {
      const result = await adminSend(`/api/admin/budgets/attachments/${attachment.id}`, { clientVisible }, "PATCH");
      if (!result.ok) { setError(result.error); return; }
      setAttachments((rows) => rows.map((row) => row.id === attachment.id ? { ...row, clientVisible } : row));
    } finally { setAttachmentBusy(false); }
  }

  async function uploadAttachment() {
    if (!attachmentFile) return;
    setAttachmentBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("budgetId", budget.id);
      form.append("file", attachmentFile);
      const result = await adminApiUpload<{ attachment?: AdminBudgetAttachmentRow }>("/api/admin/budgets/attachments", form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const created = result.data?.attachment;
      if (created) setAttachments((current) => [created, ...current]);
      setAttachmentFile(null);
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function removeAttachment(attachment: AdminBudgetAttachmentRow) {
    setAttachmentBusy(true);
    setError("");
    try {
      const result = await adminSend(`/api/admin/budgets/attachments/${attachment.id}`, {}, "DELETE");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAttachments((current) => current.filter((row) => row.id !== attachment.id));
    } finally {
      setAttachmentBusy(false);
    }
  }

  return (
    <AdminDialog title={`Precio y condiciones · ${budget.title}`} size="wide" icon="finance" onClose={onClose}>
      <p className="admin-dialog-text">
        Presupuesto Nº {budgetReference(budget.id)} de {budget.client.company?.trim() || budget.client.name}. El cliente ve el
        precio final y estas condiciones; los costos internos y el margen quedan solo en el panel.
      </p>
      {approved ? (
        <AdminNote tone="ok">
          El presupuesto ya está aprobado por el cliente: los ítems, el precio y las condiciones quedan como se enviaron. Los
          costos internos sí se pueden corregir.
        </AdminNote>
      ) : null}
      {closed ? <AdminNote tone="warn">Este presupuesto está {budget.status === "LOST" ? "perdido" : "cancelado"}: no se edita.</AdminNote> : null}

      <form onSubmit={(event) => void save(event)}>
        <h3 className="quote-document-subtitle">Productos y precio final</h3>
        <p className="admin-dialog-text">Cantidades, días y precios. Los costos unitarios son internos.</p>
        <div className="admin-plan-list">
          {draft.items.map((item, index) => (
            <div className="admin-plan-list" key={item.id ?? `nuevo-${index}`}>
              {item.excluded ? <AdminNote>Retirado / no incluido. Se conserva la línea original.</AdminNote> : null}
              <InventoryLinkPicker label={`Producto del ítem ${index + 1} (opcional)`} hint="Elegir un producto completa nombre y precio editable; no reserva stock. Sin vínculo, se conserva una línea de servicio libre." range={null} selected={item.inventory} disabled={approved || closed || busy} onSelect={(product) => updateItem(index, { inventory: product, ...(product ? { name: product.name, unitPrice: String(quoteProductPrice(product, number(item.days))) } : {}) })} />
              <div className="admin-plan-grid">
              <TextField
                label={`Ítem ${index + 1}`}
                required
                value={item.name}
                maxLength={160}
                disabled={approved || closed}
                onChange={(value) => updateItem(index, { name: value })}
              />
              <NumberField
                label="Cantidad"
                value={item.quantity}
                maxLength={4}
                disabled={approved || closed}
                onChange={(value) => updateItem(index, { quantity: value })}
              />
              <NumberField
                label="Días"
                value={item.days}
                maxLength={3}
                disabled={approved || closed}
                onChange={(value) => updateItem(index, { days: value })}
              />
              <MoneyField
                label="Precio unitario (Gs)"
                value={item.unitPrice}
                disabled={approved || closed}
                onChange={(value) => updateItem(index, { unitPrice: value })}
              />
              <MoneyField
                label="Costo unitario (Gs)"
                hint="Interno"
                value={item.costPrice}
                disabled={approved || closed}
                onChange={(value) => updateItem(index, { costPrice: value })}
              />
              {!approved && !closed && draft.items.length > 1 ? (
                <AdminButton
                  icon="close"
                  title={`Quitar el ítem ${index + 1}`}
                  aria-label={`Quitar el ítem ${index + 1}`}
                  onClick={() => setDraft({ ...draft, items: draft.items.filter((_, position) => position !== index) })}
                />
              ) : null}
              </div>
            </div>
          ))}
          {!approved && !closed ? (
            <AdminButton
              icon="plus"
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  items: [...draft.items, { inventory: null, id: null, name: "", quantity: "1", days: "1", unitPrice: "0", costPrice: "0" }],
                })
              }
            >
              Agregar ítem
            </AdminButton>
          ) : null}
        </div>

        <p className="admin-dialog-text">Costos internos y precio final (no los ve el cliente).</p>
        <div className="admin-plan-grid">
          <MoneyField
            label="Materiales (Gs)"
            hint="Costo interno"
            value={draft.materialCost}
            onChange={(value) => setDraft({ ...draft, materialCost: value })}
          />
          <MoneyField
            label="Mano de obra (Gs)"
            hint="Costo interno"
            value={draft.laborCost}
            onChange={(value) => setDraft({ ...draft, laborCost: value })}
          />
          <MoneyField
            label="Precio final (Gs)"
            hint="Lo que paga el cliente"
            value={draft.price}
            disabled={approved || closed}
            onChange={(value) => setDraft({ ...draft, price: value, priceAdjustment: number(value) - itemsSubtotal })}
          />
          <PercentField
            label="Margen deseado (%)"
            hint="Sobre el precio final"
            value={draft.marginPercent}
            disabled={approved || closed}
            onChange={(value) => setDraft({ ...draft, marginPercent: value })}
          />
          <AdminButton icon="finance" type="button" disabled={approved || closed} onClick={applySuggestedMargin}>
            {suggested !== null ? `Usar ${formatMoney(suggested)}` : "Calcular precio"}
          </AdminButton>
        </div>

        <AdminNote tone={margin && margin.amount < 0 ? "warn" : undefined}>
          Costo interno {formatMoney(cost.total)} (ítems {formatMoney(cost.items)} · materiales {formatMoney(cost.materials)} ·
          mano de obra {formatMoney(cost.labor)}). Precio final {formatMoney(price)} ·{" "}
          {margin ? `margen ${formatNumber(margin.percent)} % (${formatMoney(margin.amount)})` : "sin margen calculable: cargá el costo interno y el precio final"}.
          {needsRepricing && repriced ? " Al guardar, el precio se reparte entre los precios unitarios de los ítems." : ""}
        </AdminNote>

        <section className="quote-document-section quote-document-section--conditions" aria-labelledby="quote-editor-conditions">
          <h3 id="quote-editor-conditions" className="quote-document-subtitle">Condiciones y fechas</h3>
          <div className="admin-plan-grid">
            <DateField
              label="Vigencia de la oferta"
              value={draft.validUntil}
              disabled={approved || closed}
              onChange={(value) => setDraft({ ...draft, validUntil: value })}
            />
            <DateField
              label="Fecha de entrega"
              value={draft.deliveryAt}
              disabled={approved || closed}
              onChange={(value) => setDraft({ ...draft, deliveryAt: value })}
            />
            <SelectField
              label="IVA"
              value={draft.ivaType}
              options={IVA_OPTIONS}
              disabled={approved || closed}
              onChange={(value) => setDraft({ ...draft, ivaType: value })}
            />
            <TextAreaField
              label="Garantía"
              wide
              value={draft.warranty}
              maxLength={400}
              rows={2}
              disabled={approved || closed}
              onChange={(value) => setDraft({ ...draft, warranty: value })}
              placeholder="Ej.: 12 meses por defectos de fabricación"
            />
          </div>
        </section>
        <section className="quote-document-section quote-document-section--observations" aria-labelledby="quote-editor-observations">
          <h3 id="quote-editor-observations" className="quote-document-subtitle">Observaciones</h3>
          <TextAreaField
            label="Observaciones para el cliente"
            wide
            value={draft.notes}
            maxLength={2000}
            rows={3}
            disabled={approved || closed}
            onChange={(value) => setDraft({ ...draft, notes: value })}
          />
        </section>
        <section className="quote-document-section quote-document-section--payments" aria-labelledby="quote-editor-payments">
          <h3 id="quote-editor-payments" className="quote-document-subtitle">Plan y condiciones de pago</h3>
          <p className="quote-document-copy">{budget.paymentTerms || "Sin condiciones de pago registradas."}</p>
          <p>Anticipo: <strong>{formatMoney(budget.advanceAmount)}</strong></p>
          {budget.installmentsJson?.length ? <ul className="quote-document-copy">{budget.installmentsJson.map((installment, index) => (
            <li key={index}>{installment.label}: {formatMoney(installment.amount)}{installment.dueAt ? ` · ${formatDate(installment.dueAt)}` : ""}</li>
          ))}</ul> : null}
          <p className="admin-dialog-text">Vista del plan registrado. Se gestiona desde el plan de pagos del presupuesto.</p>
        </section>
        {organization ? <section className="quote-document-section quote-document-section--issuer" aria-labelledby="quote-editor-issuer">
          <h3 id="quote-editor-issuer" className="quote-document-subtitle">Emitido por</h3>
          <p className="quote-document-copy"><strong>{organization.name}</strong></p>
          <p className="admin-dialog-text">La firma electrónica se gestiona por separado.</p>
        </section> : null}

        {error ? <AdminNote tone="error">{error}</AdminNote> : null}
        <div className="admin-dialog-foot">
          <AdminButton type="button" onClick={onClose}>
            Cancelar
          </AdminButton>
          <span className="admin-dialog-spacer" />
          <AdminButton type="submit" variant="primary" disabled={busy} aria-busy={busy || undefined}>
            {busy ? "Guardando…" : needsRepricing ? "Ajustar precios y guardar" : "Guardar"}
          </AdminButton>
        </div>
      </form>

      <div className="admin-plan-list">
        <AttachmentInput
          label="Adjunto del presupuesto"
          hint={`El PDF original u otro archivo (hasta ${Math.round(BUDGET_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB). Privado por defecto; solo un PDF validado puede hacerse visible explícitamente.`}
          wide
          disabled={attachmentBusy}
          onSelect={setAttachmentFile}
        />
        <AdminButton icon="upload" type="button" disabled={!attachmentFile || attachmentBusy} onClick={() => void uploadAttachment()} aria-busy={attachmentBusy || undefined}>
          {attachmentBusy ? "Subiendo…" : attachmentFile ? `Subir «${attachmentFile.name}»` : "Subir adjunto"}
        </AdminButton>
        {attachments.length > 0 ? (
          <ul className="admin-plan-list">
            {attachments.map((attachment) => (
              <li className="admin-plan-row" key={attachment.id}>
                <a
                  className="admin-btn admin-btn--ghost"
                  href={`/api/admin/budgets/attachments/${attachment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Abrir «${attachment.name}»`}
                >
                  <AdminIcon name="receipt" size={14} />
                  <span>{attachment.name}</span>
                </a>
                <small className="admin-cell-sub">
                  {formatNumber(Math.max(1, Math.round(attachment.size / 1024)))} kB · {attachment.uploadedByName}
                </small>
                {attachment.mime === "application/pdf" ? <SwitchField label={`Visible para el cliente: ${attachment.name}`} checked={attachment.clientVisible === true} disabled={attachmentBusy} onChange={(visible) => void setAttachmentVisibility(attachment, visible)} /> : <small>Solo interno</small>}
                <AdminButton
                  icon="trash"
                  title={`Borrar «${attachment.name}»`}
                  aria-label={`Borrar «${attachment.name}»`}
                  disabled={attachmentBusy}
                  onClick={() => void removeAttachment(attachment)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-dialog-text">Sin adjuntos: subí el PDF original del cliente para tenerlo a mano.</p>
        )}
      </div>
      <BudgetReferenceLinks budgetId={budget.id} initial={budget.referenceLinks ?? []} />
    </AdminDialog>
  );
}
