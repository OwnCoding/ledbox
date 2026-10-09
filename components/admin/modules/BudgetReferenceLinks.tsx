"use client";
import { useState } from "react";
import type { AdminBudgetReferenceLink } from "@/lib/admin-types";
import { adminSend } from "@/lib/admin-api";
import { AdminButton, AdminNote } from "../AdminUI";
import { SwitchField, TextField } from "../AdminFields";

export function BudgetReferenceLinks({ budgetId, initial }: { budgetId: string; initial: AdminBudgetReferenceLink[] }) {
  const [links, setLinks] = useState(initial);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function mutate(method: "POST" | "PATCH" | "DELETE", link?: AdminBudgetReferenceLink) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await adminSend<{ reference?: AdminBudgetReferenceLink }>("/api/admin/budgets/references", { budgetId, id: link?.id, label, url, clientVisible: link ? !link.clientVisible : visible }, method);
      if (!result.ok) { setError(result.error); return; }
      if (method === "DELETE") setLinks((rows) => rows.filter((row) => row.id !== link?.id));
      else if (method === "PATCH") setLinks((rows) => rows.map((row) => row.id === link?.id ? { ...row, clientVisible: !row.clientVisible } : row));
      else if (result.data.reference) { setLinks((rows) => [...rows, result.data.reference!]); setLabel(""); setUrl(""); setVisible(false); }
    } finally { setBusy(false); }
  }
  return <section className="admin-plan-list" aria-label="Referencias del presupuesto">
    <h3>Enlaces de referencia</h3>
    <TextField label="Título de la referencia" value={label} onChange={setLabel} maxLength={120} disabled={busy} />
    <TextField label="Enlace http o https" value={url} onChange={setUrl} maxLength={2000} disabled={busy} hint="Solo se guarda el enlace; no se descarga su contenido." />
    <SwitchField label="Visible para el cliente" checked={visible} onChange={setVisible} disabled={busy} />
    <AdminButton type="button" icon="plus" disabled={busy || !label.trim() || !url.trim()} onClick={() => void mutate("POST")}>Agregar referencia</AdminButton>
    {error ? <AdminNote tone="error">{error}</AdminNote> : null}
    {!links.length ? <p className="admin-dialog-text">Sin referencias.</p> : links.map((link) => <div key={link.id} className="admin-quote-resource">
      <a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{link.label}</a>
      <SwitchField label={`Visible para el cliente: ${link.label}`} checked={link.clientVisible} onChange={() => void mutate("PATCH", link)} disabled={busy} />
      <AdminButton type="button" icon="close" aria-label={`Quitar referencia: ${link.label}`} disabled={busy} onClick={() => void mutate("DELETE", link)} />
    </div>)}
  </section>;
}
