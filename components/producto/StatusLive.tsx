"use client";

import { useEffect, useState } from "react";

/**
 * Estado en vivo del servicio (issue #168): consulta el health real de la app
 * (`/api/health` —proceso y base) desde el navegador cada 60 segundos y lo
 * muestra sin inventar métricas. Sin JS queda el estado «Verificando…» y el
 * resto de la página (canales de soporte y alcance) sigue siendo útil.
 */

type DatabaseState = "ok" | "unavailable";
type HealthPayload = { status?: string; database?: DatabaseState; migrations?: number | null };
type CheckState = "verificando" | "operativo" | "degradado" | "sin-conexion";

const CHECK_INTERVAL_MS = 60_000;

const STATE_LABEL: Record<CheckState, string> = {
  verificando: "Verificando…",
  operativo: "Operativo",
  degradado: "Con incidencias",
  "sin-conexion": "Sin conexión con la verificación",
};

function hora(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function StatusLive() {
  const [state, setState] = useState<CheckState>("verificando");
  const [database, setDatabase] = useState<DatabaseState | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) throw new Error(`health ${response.status}`);
        const payload = (await response.json()) as HealthPayload;
        if (!active) return;
        const db: DatabaseState = payload.database === "unavailable" ? "unavailable" : "ok";
        setDatabase(db);
        setState(db === "ok" ? "operativo" : "degradado");
        setCheckedAt(new Date());
      } catch {
        if (!active) return;
        setDatabase(null);
        setState("sin-conexion");
        setCheckedAt(new Date());
      }
    }

    void check();
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const rows: Array<{ label: string; ok: boolean | null }> = [
    { label: "Plataforma web — panel, portales y sitios", ok: state === "verificando" ? null : state !== "sin-conexion" },
    { label: "Base de datos", ok: state === "verificando" ? null : database === "ok" },
  ];

  return (
    <section className={`producto-status producto-status--${state}`} aria-labelledby="status-actual">
      <div className="producto-status-head">
        <span className="producto-status-dot" aria-hidden="true" />
        <div>
          <p className="producto-kicker" id="status-actual">Estado actual</p>
          <p className="producto-status-state" role="status" aria-live="polite">{STATE_LABEL[state]}</p>
        </div>
      </div>

      <dl className="producto-status-rows">
        {rows.map((row) => (
          <div className="producto-status-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.ok === null ? "Verificando…" : row.ok ? "Operativo" : "Con incidencias"}</dd>
          </div>
        ))}
      </dl>

      <p className="producto-status-check">
        Última verificación: <strong>{hora(checkedAt)}</strong> · se actualiza solo cada 60 segundos.
      </p>
    </section>
  );
}
