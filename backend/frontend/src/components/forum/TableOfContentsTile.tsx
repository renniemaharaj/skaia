import React, { useMemo } from "react";
import "./TableOfContentsTile.css";
import { List } from "lucide-react";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsTileProps {
  htmlContent: string;
}

const TableOfContentsTile: React.FC<TableOfContentsTileProps> = ({ htmlContent }) => {
  const tocItems = useMemo(() => {
    if (!htmlContent) return [];
    
    // Create a temporary div to parse the HTML safely
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    const headings = doc.querySelectorAll('h1, h2, h3');
    const items: TOCItem[] = [];
    
    headings.forEach((heading, index) => {
      // Create an ID if one doesn't exist to allow linking
      let id = heading.id;
      if (!id) {
        id = `heading-${index}-${heading.textContent?.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
        heading.id = id; 
      }
      
      const level = parseInt(heading.tagName.replace('H', ''), 10);
      items.push({
        id,
        text: heading.textContent || "Untitled section",
        level
      });
    });
    
    return items;
  }, [htmlContent]);

  if (tocItems.length === 0) {
    return (
      <div className="card toc-tile">
        <div className="toc-header">
          <List size={16} />
          <h3>Table of Contents</h3>
        </div>
        <div className="toc-content">
          <div className="toc-placeholder" style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Use h tags hierarchically to populate this tile
          </div>
        </div>
      </div>
    );
  }

  const scrollToHeading = (id: string) => {
    // RichTextEditor might wipe IDs if it cleanses HTML, but if we assign IDs before rendering or search by text content.
    // Actually, reactjs-tiptap-editor generates IDs for headings if configured, but if not we might just scroll to the nearest element with that text.
    // Let's look for an element with matching text content or matching tag if ID fails.
    
      let el = document.getElementById(id);
      
      // If we found an element but it's not inside the main content, ignore it
      if (el && !el.closest('.renderer-editor')) {
        el = null;
      }

      if (!el) {
        // Fallback: try to find heading by text
        const headings = Array.from(document.querySelectorAll('.renderer-editor h1, .renderer-editor h2, .renderer-editor h3'));
      const targetText = tocItems.find(item => item.id === id)?.text;
      el = headings.find(h => h.textContent === targetText) as HTMLElement | undefined || null;
    }

    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="card toc-tile">
      <div className="toc-header">
        <List size={16} />
        <h3>Table of Contents</h3>
      </div>
      <div className="toc-content">
        {tocItems.map((item, idx) => (
          <div 
            key={`${item.id}-${idx}`} 
            className={`toc-item toc-level-${item.level}`}
            onClick={() => scrollToHeading(item.id)}
            role="button"
            tabIndex={0}
          >
            <span className="toc-dot"></span>
            {item.text}
          </div>
        ))}
        {tocItems.length > 0 && tocItems.length < 3 && (
          <div className="toc-placeholder" style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '1rem' }}>
            Use h tags hierarchically to populate this tile
          </div>
        )}
      </div>
    </div>
  );
};

export default TableOfContentsTile;
