"use client";

import { useState } from "react";
import { contactPhoneValid } from "@/lib/admin-format";
import { adminSend } from "@/lib/admin-api";
import type { AdminClientOption } from "@/lib/admin-types";
import { emailValid, FIELD_MESSAGES } from "@/lib/field-rules";
import { AdminButton, AdminDialog, AdminNote, AdminPlanLimitNote } from "../AdminUI";
import { Combobox, DateTimeField, EmailField, PhoneField, TextField } from "../AdminFields";

/**
 * Altas rápidas del alta de presupuestos (issue #88): cliente y evento mínimos
 * dentro del mismo formulario, reutilizando los endpoints existentes
 * (`POST /api/admin/clients` y `POST /api/admin/events`) y el kit de campos.
 *
 * No duplican los formularios completos de Clientes/Eventos (dominio OPS): son
 * la parte mínima que el presupuesto necesita para no cortar la carga. Al
 * crear, la pantalla deja la opción elegida y refresca la lista; el resto de la
 * ficha se completa en su módulo.
 */

export function ClientQuickCreateDialog({
  initialName,
  onClose,
  onCreated,
}: {
  /** Nombre tipeado en el combobox, para no volver a escribirlo. */
  initialName: string;
  onClose: () => void;
  onCreated: (client: AdminClientOption) => void;
}) {
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const phoneError = phone && !contactPhoneValid(phone) ? FIELD_MESSAGES.phone : null;
  const emailError = email && !emailValid(email) ? FIELD_MESSAGES.email : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Ingresá el nombre del cliente.");
      return;
    }
    if (phoneError || emailError) {
      setError(phoneError ?? emailError ?? "");
      return;
    }
    setBusy(true);
    setError("");
    const result = await adminSend<{ client?: AdminClientOption }>("/api/admin/clients", {
      name: name.trim(),
      company: company.trim() || null,
      phone: phone || null,
      email: email || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const created = result.data.client;
    if (!created?.id) {
      // El alta pudo quedar guardada: se avisa sin inventar una selección.
      setError("El cliente se guardó, pero no recibimos su id: recargá Clientes y elegilo de nuevo.");
      return;
    }
    onCreated(created);
  }

  return (
    <AdminDialog title="Crear cliente" icon="clients" onClose={onClose}>
      <p className="admin-dialog-text">
        Alta mínima para el presupuesto: queda elegido al crearlo. El contacto, el logo y el resto de la ficha se completan
        después en Clientes.
      </p>
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <TextField
          label="Nombre"
          required
          maxLength={120}
          value={name}
          onChange={setName}
          placeholder="Ej.: Samsung Paraguay"
          hint="Como figura en la cartera; si es una persona, su nombre."
        />
        <TextField
          label="Empresa"
          maxLength={120}
          value={company}
          onChange={setCompany}
          placeholder="Ej.: Samsung Paraguay"
        />
        <PhoneField label="Teléfono" value={phone} onChange={setPhone} error={phoneError} />
        <EmailField label="Correo" value={email} onChange={setEmail} error={emailError} placeholder="contacto@empresa.com" />
        {error ? <AdminNote tone="error">{error}</AdminNote> : null}
        <div className="admin-dialog-foot">
          <span className="admin-dialog-spacer" />
          <AdminButton icon="close" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </AdminButton>
          <AdminButton variant="primary" icon="check" type="submit" busy={busy}>
            Crear cliente
          </AdminButton>
        </div>
      </form>
    </AdminDialog>
  );
}

export function EventQuickCreateDialog({
  initialName,
  clientId,
  clients,
  clientsLoading,
  onClose,
  onCreated,
}: {
  /** Nombre tipeado en el combobox, para no volver a escribirlo. */
  initialName: string;
  /** Cliente ya elegido en el presupuesto; vacío = se elige acá. */
  clientId: string;
  clients: AdminClientOption[];
  clientsLoading: boolean;
  onClose: () => void;
  onCreated: (event: { id: string; name: string }, clientId: string) => void;
}) {
  const [formClientId, setFormClientId] = useState(clientId);
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limitError, setLimitError] = useState("");

  const lockedClient = clientId ? clients.find((client) => client.id === clientId) ?? null : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formClientId) {
      setError("Elegí el cliente del evento.");
      return;
    }
    if (!name.trim()) {
      setError("Ingresá el nombre del evento.");
      return;
    }
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
      setError("El fin no puede ser anterior al inicio.");
      return;
    }
    setBusy(true);
    setError("");
    setLimitError("");
    const result = await adminSend<{ event?: { id: string; name: string } }>("/api/admin/events", {
      clientId: formClientId,
      name: name.trim(),
      location: location.trim() || undefined,
      startsAt: startsAt || undefined,
      endsAt: endsAt || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      // Tope del plan (issue #42): el 403 explicado se muestra con su salida a Plan.
      if (result.code === "plan_limit") setLimitError(result.error);
      else setError(result.error);
      return;
    }
    const created = result.data.event;
    if (!created?.id) {
      setError("El evento se guardó, pero no recibimos su id: recargá Eventos y elegilo de nuevo.");
      return;
    }
    onCreated({ id: created.id, name: created.name }, formClientId);
  }

  return (
    <AdminDialog title="Crear evento" icon="events" onClose={onClose}>
      <p className="admin-dialog-text">
        Alta mínima para el presupuesto: queda elegido al crearlo y el checklist base se genera solo. El resto de la
        operación se completa en Eventos.
      </p>
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        {clientId ? (
          <dl className="admin-dialog-facts">
            <div>
              <dt>Cliente</dt>
              <dd>{lockedClient ? lockedClient.company?.trim() || lockedClient.name : "El cliente del presupuesto"}</dd>
            </div>
          </dl>
        ) : (
          <Combobox
            label="Cliente"
            required
            value={formClientId}
            onChange={setFormClientId}
            options={clients.map((client) => {
              const company = client.company?.trim() || "";
              return {
                value: client.id,
                label: company || client.name,
                description: company && company !== client.name ? client.name : undefined,
              };
            })}
            placeholder="Buscá por nombre o empresa…"
            emptyLabel={
              clientsLoading
                ? "Cargando clientes…"
                : "No hay clientes cargados: creá uno desde el campo Cliente del presupuesto."
            }
            hint="El evento queda asociado a este cliente."
          />
        )}
        <TextField
          label="Nombre del evento"
          required
          maxLength={120}
          value={name}
          onChange={setName}
          placeholder="Ej.: Lanzamiento Samsung"
        />
        <TextField
          label="Lugar"
          maxLength={160}
          value={location}
          onChange={setLocation}
          placeholder="Ej.: Centro de Convenciones"
        />
        <DateTimeField
          label="Inicio"
          hint="Opcional; con inicio y fin la disponibilidad de inventario se calcula en el rango"
          value={startsAt}
          onChange={setStartsAt}
        />
        <DateTimeField label="Fin" value={endsAt} onChange={setEndsAt} />
        {limitError ? <AdminPlanLimitNote message={limitError} /> : null}
        {error ? <AdminNote tone="error">{error}</AdminNote> : null}
        <div className="admin-dialog-foot">
          <span className="admin-dialog-spacer" />
          <AdminButton icon="close" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </AdminButton>
          <AdminButton variant="primary" icon="check" type="submit" busy={busy}>
            Crear evento
          </AdminButton>
        </div>
      </form>
    </AdminDialog>
  );
}
