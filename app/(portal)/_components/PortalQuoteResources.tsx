import type { PortalBudget } from "@/lib/server/budget-portal";

export function PortalQuoteResources({ budget, token }: { budget: PortalBudget; token: string }) {
  const attachments = budget.attachments ?? [];
  const links = budget.referenceLinks ?? [];
  if (!attachments.length && !links.length) return null;
  return (
    <section className="portal-card" aria-labelledby="quote-resources">
      <h2 id="quote-resources">Documentos y referencias</h2>
      {attachments.map((file) => {
        const url = `/api/portal/budget/${encodeURIComponent(token)}/attachments/${encodeURIComponent(file.id)}`;
        return <div className="portal-quote-resource" key={file.id}>
          <strong>{file.name}</strong>
          <a className="portal-btn portal-btn--secondary" href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Ver PDF: ${file.name}`}>Ver PDF</a>
          <a className="portal-btn portal-btn--secondary" href={`${url}?download=1`} referrerPolicy="no-referrer" aria-label={`Descargar PDF: ${file.name}`}>Descargar</a>
        </div>;
      })}
      {links.map((link, index) => <p key={`${link.url}-${index}`} className="portal-note"><a href={link.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{link.label} ↗</a></p>)}
    </section>
  );
}
