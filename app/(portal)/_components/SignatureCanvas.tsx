"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Firma dibujada (issue #79): canvas vanilla con **pointer events** (mouse,
 * touch y lápiz), trazo continuo y exportación a PNG con fondo blanco. No usa
 * librerías: el trazo es la evidencia y el binario viaja al API como data URL.
 *
 * Accesibilidad: el canvas no reemplaza la firma tipográfica; quien no pueda
 * dibujar puede pedirle al emisor el método tipográfico. El recuadro tiene
 * instrucciones visibles y el botón de limpiar es real (≥44 px).
 */

const INK = "#10161a";
const LINE_WIDTH = 2.6;

export function SignatureCanvas({
  onChange,
  disabled,
}: {
  /** Data URL PNG de la firma, o `null` cuando el recuadro está vacío. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const setupContext = useCallback((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.lineWidth = LINE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = INK;
    return context;
  }, []);

  const sizeRef = useRef({ width: 0, height: 0 });

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    if (width <= 0 || width === sizeRef.current.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    sizeRef.current = { width, height: Math.round(rect.height) };
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(sizeRef.current.height * dpr));
    const context = setupContext(canvas);
    context?.scale(dpr, dpr);
    setHasInk(false);
    onChange(null);
  }, [onChange, setupContext]);

  useEffect(() => {
    resetCanvas();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => resetCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [resetCanvas]);

  function pointOf(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const context = canvas ? setupContext(canvas) : null;
    if (!canvas || !context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = pointOf(event);
    lastRef.current = point;
    context.beginPath();
    context.arc(point.x, point.y, LINE_WIDTH / 2, 0, Math.PI * 2);
    context.fillStyle = INK;
    context.fill();
    if (!hasInk) setHasInk(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current;
    const context = canvas ? setupContext(canvas) : null;
    const last = lastRef.current;
    if (!canvas || !context || !last) return;
    const point = pointOf(event);
    context.beginPath();
    context.moveTo(last.x, last.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastRef.current = point;
  }

  function finish() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    exportImage();
  }

  /** PNG opaco (fondo blanco) para que la firma se lea igual en cualquier tema. */
  function exportImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0);
    onChange(output.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas ? setupContext(canvas) : null;
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="portal-signature-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="portal-signature-canvas"
        aria-label="Recuadro para dibujar tu firma"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerLeave={finish}
        onPointerCancel={finish}
      />
      <div className="portal-signature-canvas-foot">
        <span className="portal-help">{hasInk ? "Firma capturada." : "Dibujá tu firma dentro del recuadro."}</span>
        <button type="button" className="portal-btn portal-btn--ghost portal-btn--sm" onClick={clear} disabled={disabled || !hasInk}>
          Limpiar
        </button>
      </div>
    </div>
  );
}
