import { spawn } from "node:child_process";
import { BUDGET_ATTACHMENT_MAX_BYTES } from "../admin-types";

// Runs in a disposable process: parser/decompression never blocks the server.
// Pinned pdf-lib internals are deliberately bounded before parsing object streams.
const parser = String.raw`
const path = require("node:path");
const libPath = require.resolve("pdf-lib");
const root = path.dirname(libPath);
const { PDFDocument, PDFDict, PDFArray, PDFName, PDFRef, PDFRawStream, PDFContext } = require(libPath);
const DecodeStream = require(path.join(root, "core/streams/DecodeStream.js")).default;
let allocation = 0, assigned = 0;
const ensure = DecodeStream.prototype.ensureBuffer;
DecodeStream.prototype.ensureBuffer = function (size) {
  if (!Number.isFinite(size) || size > 16 * 1024 * 1024) throw Error("stream limit");
  const old = this.buffer.length;
  const result = ensure.call(this, size);
  allocation += Math.max(0, this.buffer.length - old);
  if (allocation > 32 * 1024 * 1024) throw Error("decode limit");
  return result;
};
const assign = PDFContext.prototype.assign;
PDFContext.prototype.assign = function (...args) {
  if (++assigned > 20000) throw Error("object limit");
  return assign.apply(this, args);
};
const chunks = [];
process.stdin.on("data", chunk => chunks.push(chunk));
process.stdin.on("end", async () => {
  try {
    const doc = await PDFDocument.load(Buffer.concat(chunks), { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
    if (doc.isEncrypted || doc.getPageCount() < 1 || doc.getPageCount() > 1000) throw Error("unsupported document");
    const denied = new Set(["JavaScript","JS","Launch","OpenAction","AA","EmbeddedFile","EmbeddedFiles","RichMedia","XFA","Encrypt","SubmitForm","ImportData","GoToR","GoToE","Movie","Sound","Rendition","3D"]);
    const seen = new Set(); let visited = 0;
    function visit(object, depth = 0) {
      if (++visited > 100000 || depth > 128) throw Error("graph limit");
      if (!object || seen.has(object)) return;
      seen.add(object);
      if (object instanceof PDFRef) return visit(doc.context.lookup(object), depth + 1);
      if (object instanceof PDFName && denied.has(object.decodeText())) throw Error("active name");
      if (object instanceof PDFRawStream) return visit(object.dict, depth + 1);
      if (object instanceof PDFDict) for (const [key, value] of object.entries()) {
        visit(key, depth + 1); visit(value, depth + 1);
        if (key.decodeText() === "URI") {
          const target = doc.context.lookup(value);
          const text = target && typeof target.decodeText === "function" ? target.decodeText() : "";
          const url = new URL(text);
          if (!["http:", "https:", "mailto:"].includes(url.protocol)) throw Error("active uri");
        }
      }
      if (object instanceof PDFArray) for (let i = 0; i < object.size(); i++) visit(object.get(i), depth + 1);
    }
    visit(doc.catalog);
    for (const [, object] of doc.context.enumerateIndirectObjects()) visit(object);
    process.stdout.write("valid");
  } catch { process.stdout.write("invalid"); }
});
`;

let running = 0;
/** Parsed screening only, NOT malware-free certification or sanitization.
 * Retains originals byte-for-byte. Limits: 5MiB input, 3s, 96MiB heap,
 * 16MiB per decoded stream/32MiB cumulative, 20k objects/100k graph nodes.
 */
export async function quotePdfValid(data: Uint8Array): Promise<boolean> {
  if (!data.length || data.length > BUDGET_ATTACHMENT_MAX_BYTES || running >= 4) return false;
  const head = Buffer.from(data.subarray(0, 12)).toString("latin1");
  if (!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(head)) return false;
  running++;
  try {
    return await new Promise<boolean>((resolve) => {
      const child = spawn(process.execPath, ["--max-old-space-size=96", "-e", parser], { stdio: ["pipe", "pipe", "ignore"], cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: "production" } });
      let output = ""; let finished = false;
      const finish = (valid: boolean) => { if (!finished) { finished = true; clearTimeout(timer); resolve(valid); } };
      const timer = setTimeout(() => { child.kill("SIGKILL"); finish(false); }, 3000);
      child.stdout.on("data", (chunk) => { output += chunk.toString(); if (output.length > 32) { child.kill("SIGKILL"); finish(false); } });
      child.stdin.on("error", () => finish(false));
      child.on("error", () => finish(false));
      child.on("close", (code) => finish(code === 0 && output === "valid"));
      child.stdin.end(data);
    });
  } finally { running--; }
}
