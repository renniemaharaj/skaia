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

export const protectedRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "*", element: <NotFoundPage /> },
];
export const publicRoutes: (CustomRoute | IndexRoute)[] = [
  { index: true, element: <Index /> },
  { path: "store", element: <StorePage /> },
  { path: "forum", element: <ForumPage /> },
  { path: "new-thread", element: <NewThreadPage /> },
  { path: "edit-thread/:threadId", element: <EditThreadPage /> },
  { path: "cart", element: <CartPage /> },
  { path: "login", element: <LoginPage /> },
  { path: "register", element: <RegisterPage /> },
];
