export interface DocumentHeading {
  id: string;
  text: string;
  level: number;
}

function slugifyHeading(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  );
}

export function indexDocumentHeadings(html: string): { html: string; headings: DocumentHeading[] } {
  if (typeof DOMParser === "undefined") return { html, headings: [] };
  const document = new DOMParser().parseFromString(
    `<div id="documentation-root">${html}</div>`,
    "text/html"
  );
  const root = document.getElementById("documentation-root");
  if (!root) return { html, headings: [] };

  const counts = new Map<string, number>();
  const headings = Array.from(root.querySelectorAll("h2,h3,h4")).map(element => {
    const text = element.textContent?.trim() || "Section";
    const authored = element.id.trim();
    const base = /^[A-Za-z][\w:.-]*$/.test(authored) ? authored : slugifyHeading(text);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    element.id = id;
    return { id, text, level: Number(element.tagName.slice(1)) };
  });

  return { html: root.innerHTML, headings };
}
