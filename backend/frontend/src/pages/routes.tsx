// import { lazy } from "react";
import type { CustomRoute, IndexRoute } from "./routing.tsx";
import Index from "./index/index.tsx";
import { StorePage } from "./store/index.tsx";
import { ForumPage } from "./forum/index.tsx";
import { CartPage } from "./cart/index.tsx";
import { NotFoundPage } from "./not-found/index.tsx";
import { LoginPage } from "./login/index.tsx";
import { RegisterPage } from "./register/index.tsx";
import { NewThreadPage } from "./new-thread/index.tsx";
import EditThreadPage from "./edit-thread/index.tsx";
import ViewThreadPage from "./view-thread/index.tsx";
import UserDiscovery from "./users/index.tsx";
import CategoryThreadsPage from "./threads/categories/index.tsx";
import InboxPage from "./inbox/InboxPage.tsx";
import { AdminMetaSettings } from "./admin/meta.tsx";
import GrengoPage from "./admin/grengo.tsx";
import PageBuilder from "./page/PageBuilder.tsx";
import CustomPages from "./custom-pages/CustomPages.tsx";
import DataSourcesPage from "./datasources/DataSourcesPage.tsx";
import DataSourceEditorPage from "./datasources/DataSourceEditorPage.tsx";

export const protectedRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "new-thread", element: <NewThreadPage />, conditional: "forum" },
  {
    path: "edit-thread/:threadId",
    element: <EditThreadPage />,
    conditional: "forum",
  },
  { path: "cart", element: <CartPage />, conditional: "store" },
  { path: "users", element: <UserDiscovery />, conditional: "users" },
  { path: "users/:userId", element: <UserDiscovery />, conditional: "users" },
  { path: "inbox", element: <InboxPage />, conditional: "inbox" },
  { path: "admin/meta", element: <AdminMetaSettings /> },
  { path: "datasources", element: <DataSourcesPage /> },
  { path: "datasources/:id", element: <DataSourceEditorPage /> },
  { path: "tmp/:sessionId", element: <GrengoPage /> },
];

/** Routes accessible to both guests and authenticated users. */
export const guestRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "store", element: <StorePage />, conditional: "store" },
  { path: "forum", element: <ForumPage />, conditional: "forum" },
  {
    path: "view-thread/:threadId",
    element: <ViewThreadPage />,
    conditional: "forum",
  },
  {
    path: "threads/categories/:categoryId",
    element: <CategoryThreadsPage />,
    conditional: "forum",
  },
];

export const publicRoutes: (CustomRoute | IndexRoute)[] = [
  { index: true, element: <Index />, conditional: "landing" },
  { path: "pages", element: <CustomPages /> },
  { path: "page/:slug", element: <PageBuilder /> },
  { path: "privacy", element: <PageBuilder slug="privacy" /> },
  { path: "tos", element: <PageBuilder slug="tos" /> },
  { path: "*", element: <NotFoundPage /> },
  { path: "login", element: <LoginPage /> },
  { path: "register", element: <RegisterPage /> },
];
