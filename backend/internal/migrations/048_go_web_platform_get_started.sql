-- Surface-only Go Web Platform seed refresh.
--
-- The legacy document is matched as a complete pristine signature. A tenant
-- that changed its title, description, visibility, ownership, SEO fields, or
-- content is intentionally left untouched. Re-running this migration is a no-op
-- after the first successful update.
WITH legacy_seed AS (
    SELECT $legacy$
    [
      {
        "id": "gs-hero",
        "display_order": 1,
        "section_type": "hero",
        "heading": "Welcome to Your Site",
        "subheading": "This is a sample landing page created by the seed. Customise or replace it from the page builder.",
        "config": {},
        "items": []
      },
      {
        "id": "gs-features",
        "display_order": 2,
        "section_type": "features",
        "heading": "Feature Highlights",
        "subheading": "Showcase what makes your community special.",
        "config": {},
        "items": [
          {"id": "gs-f1", "display_order": 1, "icon": "star",    "heading": "Block Builder",  "subheading": "Drag-and-drop sections to build pages visually.", "image_url": "", "link_url": ""},
          {"id": "gs-f2", "display_order": 2, "icon": "users",   "heading": "Community",      "subheading": "Forums, comments, and real-time presence.", "image_url": "", "link_url": ""},
          {"id": "gs-f3", "display_order": 3, "icon": "palette", "heading": "Theming",        "subheading": "Full branding control from the admin panel.", "image_url": "", "link_url": ""}
        ]
      },
      {
        "id": "gs-cta",
        "display_order": 3,
        "section_type": "cta",
        "heading": "Ready to build?",
        "subheading": "Head to the admin panel and start customising your pages.",
        "config": {},
        "items": []
      }
    ]
    $legacy$::jsonb AS content
)
UPDATE pages AS page
SET title = 'Go Web Platform',
    description = 'Build, publish, connect, and grow with the capabilities included in Go Web Platform.',
    content = $gwp$
    [
      {
        "id": "gwp-hero",
        "display_order": 1,
        "section_type": "hero",
        "heading": "Build what your community needs",
        "subheading": "Go Web Platform brings publishing, data, participation, commerce, and real-time connection into one tenant-ready experience.",
        "config": "{\"background_image\":\"/banner_7783x7783.png\",\"tint_color\":\"#07111f\",\"tint_opacity\":0.72,\"variant\":1}",
        "items": []
      },
      {
        "id": "gwp-foundation",
        "display_order": 2,
        "section_type": "stat_cards",
        "heading": "One foundation, many experiences",
        "subheading": "Start with native tools that share the same identity, permissions, content, and responsive design system.",
        "config": "{}",
        "items": [
          {"id": "gwp-foundation-pages", "section_id": "gwp-foundation", "display_order": 1, "icon": "Compass", "heading": "Visual publishing", "subheading": "Compose responsive pages from reusable sections and rich media.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-foundation-live", "section_id": "gwp-foundation", "display_order": 2, "icon": "Zap", "heading": "Live by default", "subheading": "Keep conversations, presence, notifications, and page updates moving in real time.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-foundation-tenant", "section_id": "gwp-foundation", "display_order": 3, "icon": "Shield", "heading": "Tenant ready", "subheading": "Apply independent branding, permissions, data, domains, and operational controls.", "image_url": "", "link_url": "", "config": "{}"}
        ]
      },
      {
        "id": "gwp-create",
        "display_order": 3,
        "section_type": "feature_grid",
        "heading": "Create, connect, and publish",
        "subheading": "Use focused tools on their own or combine them into a complete member experience.",
        "config": "{}",
        "items": [
          {"id": "gwp-create-pages", "section_id": "gwp-create", "display_order": 1, "icon": "Compass", "heading": "Pages and content", "subheading": "Build landing pages, documentation, galleries, profiles, event highlights, and reusable content sections.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-create-data", "section_id": "gwp-create", "display_order": 2, "icon": "TrendingUp", "heading": "Data-powered sections", "subheading": "Connect protected datasources to cards, tables, statistics, and reusable component groups.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-create-interactive", "section_id": "gwp-create", "display_order": 3, "icon": "CheckCircle", "heading": "Participation tools", "subheading": "Collect structured forms, moderated questions, surveys, polls, and confirmed votes.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-create-community", "section_id": "gwp-create", "display_order": 4, "icon": "Users", "heading": "Community workflows", "subheading": "Bring forums, proposals, showcases, events, documentation, and member discovery together.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-create-commerce", "section_id": "gwp-create", "display_order": 5, "icon": "ShoppingCart", "heading": "Commerce and rewards", "subheading": "Offer products, wallets, fulfilment, external-event rewards, and configurable rankings.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-create-media", "section_id": "gwp-create", "display_order": 6, "icon": "Globe", "heading": "Media and integrations", "subheading": "Publish rich media and extend operations through Frappe, Superset, and tenant-managed services.", "image_url": "", "link_url": "", "config": "{}"}
        ]
      },
      {
        "id": "gwp-connect",
        "display_order": 4,
        "section_type": "card_group",
        "heading": "Turn audiences into active communities",
        "subheading": "Communication and participation share one responsive experience across desktop and mobile.",
        "config": "{}",
        "items": [
          {"id": "gwp-connect-conversation", "section_id": "gwp-connect", "display_order": 1, "icon": "MessageCircle", "heading": "Conversation that stays organized", "subheading": "Use forums, replies, inbox conversations, notifications, and group chat to keep people connected.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-connect-live", "section_id": "gwp-connect", "display_order": 2, "icon": "Headphones", "heading": "Meet in real time", "subheading": "Add room presence, voice, video, screen sharing, shared cursors, and live route awareness.", "image_url": "", "link_url": "", "config": "{}"},
          {"id": "gwp-connect-participate", "section_id": "gwp-connect", "display_order": 3, "icon": "Award", "heading": "Invite meaningful participation", "subheading": "Run events, proposals, attendance, voting, rewards, and leaderboards with permission-aware controls.", "image_url": "", "link_url": "", "config": "{}"}
        ]
      },
      {
        "id": "gwp-adapt",
        "display_order": 5,
        "section_type": "rich_text",
        "heading": "",
        "subheading": "",
        "config": "{\"content\":\"<h2>Designed to become your platform</h2><p>Shape the experience with tenant branding, configurable navigation, feature controls, granular permissions, custom pages, reusable data-backed components, and integrations. Go Web Platform keeps public discovery, authenticated collaboration, and operator workflows on the same secure foundation.</p><p><strong>Start with the capabilities you need today.</strong> Enable more as your community, organization, or product grows.</p>\"}",
        "items": []
      },
      {
        "id": "gwp-cta",
        "display_order": 6,
        "section_type": "cta",
        "heading": "Make it unmistakably yours",
        "subheading": "Use the page builder and administration tools to choose your content, capabilities, branding, and community experience.",
        "config": "{}",
        "items": []
      }
    ]
    $gwp$::jsonb,
    updated_at = CURRENT_TIMESTAMP
FROM legacy_seed
WHERE page.slug = 'get-started'
  AND page.title = 'Get Started'
  AND page.description = 'A quick tour of the page builder blocks available on your site.'
  AND page.visibility = 'public'
  AND page.owner_id IS NULL
  AND page.seo_title = ''
  AND page.seo_description = ''
  AND page.seo_image = ''
  AND page.deleted_at IS NULL
  AND page.content = legacy_seed.content;
