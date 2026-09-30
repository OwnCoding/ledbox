"use client";

import { useState } from "react";
import { CLIENT_LINK_MESSAGES, contactPhoneValid, instagramValid, websiteValid } from "@/lib/admin-format";
import { adminSend } from "@/lib/admin-api";
import type { AdminClientOption } from "@/lib/admin-types";
import { emailValid, FIELD_LIMITS, FIELD_MESSAGES } from "@/lib/field-rules";
import { AdminButton, AdminDialog, AdminDisclosure, AdminNote } from "../AdminUI";
import { EmailField, PhoneField, RucField, SelectField, TextField } from "../AdminFields";

/**
 * Formulario mínimo del cliente (issue #106): Nombre (con foco) + Teléfono y
 * Correo opcionales; el resto —empresa, tipo, RUC/CI, encargado y links—
 * detrás de «Más datos». Lo comparten el alta de Clientes y el «+ Nuevo
 * cliente» del evento, así el alta rápida es la misma en los dos lados; el
 * resto de la ficha se completa después desde el detalle del cliente.
 *
 * Sin cambios de API: usa `POST /api/admin/clients` como el formulario completo.
 */

export type ClientQuickValues = {
  name: string;
  phone: string;
  email: string;
  company: string;
  type: string;
  ruc: string;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  website: string;
  instagram: string;
  whatsapp: string;
};

export const EMPTY_CLIENT_QUICK: ClientQuickValues = {
  name: "",
  phone: "",
  email: "",
  company: "",
  type: "FINAL",
  ruc: "",
  contactName: "",
  contactRole: "",
  contactPhone: "",
  contactEmail: "",
  website: "",
  instagram: "",
  whatsapp: "",
};

/** Avisos del front con el mismo mensaje que revalida el API (regla única). */
export type ClientQuickErrors = {
  phone: string | null;
  email: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  instagram: string | null;
  whatsapp: string | null;
};

export function clientQuickErrors(values: ClientQuickValues): ClientQuickErrors {
  return {
    phone: values.phone && !contactPhoneValid(values.phone) ? FIELD_MESSAGES.phone : null,
    email: values.email && !emailValid(values.email) ? FIELD_MESSAGES.email : null,
    contactPhone: values.contactPhone && !contactPhoneValid(values.contactPhone) ? FIELD_MESSAGES.phone : null,
    contactEmail: values.contactEmail && !emailValid(values.contactEmail) ? FIELD_MESSAGES.email : null,
    website: values.website && !websiteValid(values.website) ? CLIENT_LINK_MESSAGES.website : null,
    instagram: values.instagram && !instagramValid(values.instagram) ? CLIENT_LINK_MESSAGES.instagram : null,
    whatsapp: values.whatsapp && !contactPhoneValid(values.whatsapp) ? FIELD_MESSAGES.phone : null,
  };
}

export function clientQuickFirstError(errors: ClientQuickErrors): string {
  return Object.values(errors).find(Boolean) ?? "";
}

/**
 * Los campos del alta mínima. `children` se dibuja dentro de «Más datos»
 * (notas y logo en Clientes); el diálogo del evento no agrega nada.
 */
export function ClientQuickFields({
  values,
  onChange,
  errors,
  autoFocus,
  moreOpen,
  children,
}: {
  values: ClientQuickValues;
  onChange: (patch: Partial<ClientQuickValues>) => void;
  errors?: ClientQuickErrors;
  /** Foco automático en el Nombre al abrir el alta (issue #106). */
  autoFocus?: boolean;
  /** «Más datos» abierto de entrada (al editar, para no esconder lo cargado). */
  moreOpen?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      <TextField
        label="Nombre"
        required
        autoFocus={autoFocus}
        maxLength={FIELD_LIMITS.name}
        value={values.name}
        onChange={(value) => onChange({ name: value })}
        placeholder="Ej.: Samsung Paraguay"
        hint="Como figura en la cartera; si es una persona, su nombre."
      />
      <PhoneField
        label="Teléfono"
        hint="Opcional · con código de país"
        value={values.phone}
        onChange={(value) => onChange({ phone: value })}
        error={errors?.phone ?? null}
      />
      <EmailField
        label="Correo"
        value={values.email}
        onChange={(value) => onChange({ email: value })}
        placeholder="contacto@empresa.com"
        error={errors?.email ?? null}
      />
      <AdminDisclosure title="Más datos" hint="empresa, RUC, encargado y links" defaultOpen={moreOpen}>
        <TextField
          label="Empresa"
          maxLength={FIELD_LIMITS.company}
          value={values.company}
          onChange={(value) => onChange({ company: value })}
          placeholder="Ej.: Samsung Paraguay"
        />
        <SelectField
          label="Tipo"
          value={values.type}
          onChange={(value) => onChange({ type: value })}
          options={[
            { value: "FINAL", label: "Cliente final" },
            { value: "RESELLER", label: "Mayorista / revendedor" },
          ]}
        />
        <RucField label="RUC / CI" maxLength={30} value={values.ruc} onChange={(value) => onChange({ ruc: value })} />
        <TextField
          label="Nombre del encargado"
          maxLength={FIELD_LIMITS.name}
          value={values.contactName}
          onChange={(value) => onChange({ contactName: value })}
          placeholder="Ej.: María González"
        />
        <TextField
          label="Cargo"
          maxLength={FIELD_LIMITS.name}
          value={values.contactRole}
          onChange={(value) => onChange({ contactRole: value })}
          placeholder="Ej.: Gerenta de marketing"
        />
        <PhoneField
          label="Teléfono directo"
          value={values.contactPhone}
          onChange={(value) => onChange({ contactPhone: value })}
          error={errors?.contactPhone ?? null}
        />
        <EmailField
          label="Correo directo"
          value={values.contactEmail}
          onChange={(value) => onChange({ contactEmail: value })}
          error={errors?.contactEmail ?? null}
        />
        <TextField
          label="Sitio web"
          maxLength={200}
          value={values.website}
          onChange={(value) => onChange({ website: value })}
          placeholder="empresa.com.py"
          inputMode="url"
          error={errors?.website ?? null}
          hint="Sin «https://» también funciona."
        />
        <TextField
          label="Instagram"
          maxLength={64}
          value={values.instagram}
          onChange={(value) => onChange({ instagram: value })}
          placeholder="@empresa"
          error={errors?.instagram ?? null}
          hint="El usuario con arroba o el link del perfil."
        />
        <PhoneField
          label="WhatsApp"
          hint="Solo si difiere del teléfono general"
          value={values.whatsapp}
          onChange={(value) => onChange({ whatsapp: value })}
          error={errors?.whatsapp ?? null}
        />
        {children}
      </AdminDisclosure>
    </>
  );
}

/**
 * «+ Nuevo cliente» del evento (issue #106, patrón de #88): el mismo alta
 * mínima dentro del diálogo, con el nombre que se venía tipeando. Al crear,
 * el llamador lo deja elegido en el evento.
 */
export function ClientQuickDialog({
  initialName = "",
  onClose,
  onCreated,
}: {
  /** Nombre tipeado en el selector, para no volver a escribirlo. */
  initialName?: string;
  onClose: () => void;
  onCreated: (client: AdminClientOption) => void;
}) {
  const [values, setValues] = useState<ClientQuickValues>({ ...EMPTY_CLIENT_QUICK, name: initialName });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errors = clientQuickErrors(values);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("Ingresá el nombre del cliente.");
      return;
    }
    const firstError = clientQuickFirstError(errors);
    if (firstError) {
      setError(firstError);
      return;
    }
    setBusy(true);
    setError("");
    // Mismo contrato del alta completa; acá no se cargan notas.
    const result = await adminSend<{ client?: AdminClientOption }>("/api/admin/clients", {
      name: values.name,
      company: values.company || null,
      type: values.type,
      ruc: values.ruc || null,
      phone: values.phone || null,
      email: values.email || null,
      contactName: values.contactName || null,
      contactRole: values.contactRole || null,
      contactPhone: values.contactPhone || null,
      contactEmail: values.contactEmail || null,
      website: values.website || null,
      instagram: values.instagram || null,
      whatsapp: values.whatsapp || null,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const created = result.data.client;
    if (!created?.id) {
      // El alta pudo quedar guardada: se avisa sin inventar una selección.
      setError("El cliente se guardó, pero no recibimos su id: recargá Eventos y elegilo de nuevo.");
      return;
    }
    onCreated(created);
  }

  return (
    <AdminDialog title="Nuevo cliente" icon="clients" onClose={onClose}>
      <p className="admin-dialog-text">
        Alta mínima: al crearlo queda elegido en el evento. El resto de la ficha se completa después en Clientes.
      </p>
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <ClientQuickFields
          values={values}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          errors={errors}
          autoFocus
        />
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
