export interface Documentation {
  id: number;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  owner_id: number;
  revision: number;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentationSection {
  id: number;
  documentation_id: number;
  title: string;
  display_order: number;
}

export interface DocumentationArticle {
  id: number;
  documentation_id: number;
  section_id?: number;
  slug: string;
  title: string;
  summary: string;
  content?: string;
  display_order: number;
  author_id: number;
  last_edited_by: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentationManifest {
  documentation: Documentation;
  sections: DocumentationSection[];
  articles: DocumentationArticle[];
}

export interface DocumentationArticleView {
  article: DocumentationArticle;
  previous?: DocumentationArticle;
  next?: DocumentationArticle;
}

export interface DocumentationSearchResult {
  article_id: number;
  slug: string;
  title: string;
  summary: string;
  excerpt: string;
  section_id?: number;
}

export interface ForumDocumentationArticle {
  id: number;
  category_id: number;
  title: string;
  summary: string;
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  updated_at: string;
}

export interface ForumDocumentationManifest {
  categories: Array<{
    id: number;
    name: string;
    description: string;
    display_order: number;
    is_pinned: boolean;
    is_locked: boolean;
  }>;
  articles: ForumDocumentationArticle[];
}
