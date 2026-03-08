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

export const protectedRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "store", element: <StorePage /> },
  { path: "new-thread", element: <NewThreadPage /> },
  { path: "edit-thread/:threadId", element: <EditThreadPage /> },
  { path: "view-thread/:threadId", element: <ViewThreadPage /> },
  { path: "forum", element: <ForumPage /> },
  { path: "threads/categories/:categoryId", element: <CategoryThreadsPage /> },
  { path: "cart", element: <CartPage /> },
  { path: "users", element: <UserDiscovery /> },
  { path: "users/:userId", element: <UserDiscovery /> },
  { path: "inbox", element: <InboxPage /> },
  { path: "admin/meta", element: <AdminMetaSettings /> },
];
export const publicRoutes: (CustomRoute | IndexRoute)[] = [
  { index: true, element: <Index /> },
  { path: "*", element: <NotFoundPage /> },
  { path: "login", element: <LoginPage /> },
  { path: "register", element: <RegisterPage /> },
];
