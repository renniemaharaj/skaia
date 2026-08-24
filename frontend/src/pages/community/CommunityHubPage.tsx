import { useAtomValue } from "jotai";
import {
  Activity,
  BookOpen,
  CalendarDays,
  FileText,
  Gift,
  Images,
  Link2,
  Lightbulb,
  Settings,
  Store,
  Trophy,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { currentUserAtom, hasPermissionAtom, isAuthenticatedAtom } from "../../atoms/auth";
import { featuresAtom } from "../../atoms/config";
import { CommunityModuleShell } from "./CommunityModuleShell";
import "./community-hub.css";

interface Destination {
  to: string;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  feature?: string;
  permission?: string;
}

const publicDestinations: Destination[] = [
  {
    to: "/community/proposal",
    title: "Proposals",
    description: "Suggest improvements and follow community decisions.",
    icon: Lightbulb,
    feature: "community",
  },
  {
    to: "/community/showcase",
    title: "Showcases",
    description: "Discover work shared by community members.",
    icon: Images,
    feature: "community",
  },
  {
    to: "/community/event",
    title: "Events",
    description: "Find scheduled gatherings and community activities.",
    icon: CalendarDays,
    feature: "community",
  },
  {
    to: "/leaderboards",
    title: "Leaderboards",
    description: "Explore current and completed ranked seasons.",
    icon: Trophy,
    feature: "rankings",
  },
  {
    to: "/forum",
    title: "Forum",
    description: "Join conversations and continue linked discussions.",
    icon: Users,
    feature: "forum",
  },
  {
    to: "/doc",
    title: "Documentation",
    description: "Browse guides and shared community knowledge.",
    icon: BookOpen,
    feature: "docs",
  },
  {
    to: "/store",
    title: "Store",
    description: "Browse products and services available here.",
    icon: Store,
    feature: "store",
  },
  {
    to: "/status",
    title: "Service status",
    description: "Check current availability and public incident updates.",
    icon: Activity,
    feature: "status",
  },
  {
    to: "/pages",
    title: "Pages",
    description: "Explore public pages created for this site.",
    icon: FileText,
  },
  {
    to: "/kjv",
    title: "Bible",
    description: "Open the reader and narration experience.",
    icon: BookOpen,
  },
];

const memberDestinations: Destination[] = [
  {
    to: "/rewards",
    title: "Rewards",
    description: "View points, reward history, and available redemptions.",
    icon: Gift,
    feature: "rewards",
  },
  {
    to: "/users",
    title: "People",
    description: "Find members and visit their public profiles.",
    icon: Users,
    feature: "users",
  },
  {
    to: "/inbox",
    title: "Messages",
    description: "Continue your direct and group conversations.",
    icon: Users,
    feature: "inbox",
  },
];

const operatorDestinations: Destination[] = [
  {
    to: "/activity",
    title: "Activity",
    description: "Review the protected site activity stream.",
    icon: Activity,
    permission: "events.view",
  },
  {
    to: "/admin/rewards",
    title: "Reward operations",
    description: "Review reward catalog and delivery outcomes.",
    icon: Gift,
    feature: "rewards",
    permission: "home.manage",
  },
  {
    to: "/admin/status",
    title: "Status operations",
    description: "Review diagnostics and publish incident updates.",
    icon: Activity,
    feature: "status",
    permission: "home.manage",
  },
  {
    to: "/form/site",
    title: "Site settings",
    description: "Configure branding, features, and site behavior.",
    icon: Settings,
    permission: "home.manage",
  },
];

export default function CommunityHubPage() {
  const features = useAtomValue(featuresAtom);
  const authenticated = useAtomValue(isAuthenticatedAtom);
  const user = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const enabled = (item: Destination) => !item.feature || !!features?.[item.feature];
  const visiblePublic = publicDestinations.filter(enabled);
  const visibleMember = memberDestinations.filter(item => authenticated && enabled(item));
  if (authenticated && user) {
    visibleMember.push(
      {
        to: `/form/user/${user.id}/identities`,
        title: "Linked identities",
        description: "Connect and control the visibility of external accounts.",
        icon: Link2,
      },
      {
        to: `/form/user/${user.id}/profile`,
        title: "Your settings",
        description: "Manage your profile and account security.",
        icon: Settings,
      }
    );
  }
  const visibleOperator = operatorDestinations.filter(
    item => authenticated && enabled(item) && !!item.permission && hasPermission(item.permission)
  );

  if (!features) {
    return (
      <CommunityModuleShell showTabs={false}>
        <main className="community-hub" aria-busy="true">
          <p role="status">Loading available apps…</p>
        </main>
      </CommunityModuleShell>
    );
  }

  return (
    <CommunityModuleShell showTabs={false}>
      <main className="community-hub">
        <header className="community-hub__hero">
          <span>COMMUNITY</span>
          <h1>
            {user
              ? `Welcome back, ${user.display_name || user.username}`
              : "Everything in one place"}
          </h1>
          <p>
            Explore what is public, then sign in to see the tools and spaces available to your
            account.
          </p>
        </header>
        <DestinationSection
          title="Explore"
          description="Public spaces available on this site."
          items={visiblePublic}
        />
        {authenticated ? (
          <DestinationSection
            title="For you"
            description="Your member apps and account spaces."
            items={visibleMember}
          />
        ) : (
          <aside className="community-hub__signin">
            <div>
              <h2>Make it yours</h2>
              <p>Sign in to see rewards, people, messages, and account tools available to you.</p>
            </div>
            <Link to="/login">Sign in</Link>
          </aside>
        )}
        {visibleOperator.length > 0 && (
          <DestinationSection
            title="Manage"
            description="Tools shown from your current permissions."
            items={visibleOperator}
          />
        )}
      </main>
    </CommunityModuleShell>
  );
}

function DestinationSection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Destination[];
}) {
  if (items.length === 0) return null;
  const headingId = `community-${title.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="community-hub__section" aria-labelledby={headingId}>
      <div>
        <h2 id={headingId}>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="community-hub__grid">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="community-hub__card">
              <span>
                <Icon size={20} />
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
