import { lazy } from "react";
import type { CustomRoute, IndexRoute } from "./routing.tsx";

const Index = lazy(() => import("./index/index.tsx"));
const StorePage = lazy(() => import("./store/index.tsx").then(m => ({ default: m.StorePage })));
const ProductPage = lazy(() =>
  import("../components/store/ProductPage.tsx").then(m => ({
    default: m.ProductPage,
  }))
);
const WalletPage = lazy(() =>
  import("../components/store/WalletPage.tsx").then(m => ({
    default: m.WalletPage,
  }))
);
const OrdersPage = lazy(() =>
  import("../components/store/OrdersPage.tsx").then(m => ({
    default: m.OrdersPage,
  }))
);
const OrderViewPage = lazy(() =>
  import("../components/store/OrderViewPage.tsx").then(m => ({
    default: m.default,
  }))
);
const NewProductPage = lazy(() =>
  import("../components/store/NewProductPage.tsx").then(m => ({
    default: m.NewProductPage,
  }))
);
const NewStoreCategoryPage = lazy(() =>
  import("../components/store/NewStoreCategoryPage.tsx").then(m => ({
    default: m.NewStoreCategoryPage,
  }))
);
const ForumPage = lazy(() => import("./forum/index.tsx").then(m => ({ default: m.ForumPage })));
const NewForumCategoryPage = lazy(() =>
  import("./forum/NewForumCategoryPage.tsx").then(m => ({
    default: m.NewForumCategoryPage,
  }))
);
const CartPage = lazy(() => import("./cart/index.tsx").then(m => ({ default: m.CartPage })));
const NotFoundPage = lazy(() =>
  import("./not-found/index.tsx").then(m => ({ default: m.NotFoundPage }))
);
const LoginPage = lazy(() => import("./login/index.tsx").then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import("./register/index.tsx").then(m => ({ default: m.RegisterPage }))
);
const NewThreadPage = lazy(() =>
  import("./new-thread/index.tsx").then(m => ({ default: m.NewThreadPage }))
);
const EditThreadPage = lazy(() => import("./edit-thread/index.tsx"));
const ViewThreadPage = lazy(() => import("./view-thread/index.tsx"));
const UserDiscovery = lazy(() => import("./users/index.tsx"));
const CategoryThreadsPage = lazy(() => import("./threads/categories/index.tsx"));
const InboxPage = lazy(() => import("./inbox/index.tsx"));
const AdminMetaSettings = lazy(() =>
  import("./admin/meta.tsx").then(m => ({ default: m.AdminMetaSettings }))
);

const RolesManagementPage = lazy(() => import("../components/admin/RolesManagementPage.tsx"));
const DeploymentsPage = lazy(() => import("../components/page/deployments/DeploymentsPage.tsx").then(m => ({ default: m.DeploymentsPage })));
const PageBuilder = lazy(() => import("./page/index.tsx"));
const CustomPages = lazy(() => import("../components/page/CustomPages.tsx"));
const DataSourcesPage = lazy(() => import("../components/page/datasources/DataSourcesPage.tsx"));
const DataSourceEditorPage = lazy(
  () => import("../components/page/datasources/DataSourceEditorPage.tsx")
);
const ActivityPage = lazy(() => import("./activity/index.tsx"));
const VerifyEmailPage = lazy(() => import("./verify-email/index.tsx"));
const ForgotPasswordPage = lazy(() => import("./forgot-password/index.tsx"));
const ResetPasswordPage = lazy(() => import("./reset-password/index.tsx"));
const VisualizerPage = lazy(() => import("./visualizer/index.tsx"));
const UserUploadsDirectory = lazy(() => import("../components/user/UserUploadsDirectory.tsx"));
const SettingsPage = lazy(() => import("./settings/index.tsx"));
const FlowPage = lazy(() => import("./flow/index.tsx"));

export const protectedRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "new-thread", element: <NewThreadPage />, conditional: "forum" },
  {
    path: "forum/new-category",
    element: <NewForumCategoryPage />,
    conditional: "forum",
  },
  {
    path: "store/new-product",
    element: <NewProductPage />,
    conditional: "store",
  },
  {
    path: "store/new-category",
    element: <NewStoreCategoryPage />,
    conditional: "store",
  },
  {
    path: "edit-thread/:threadId",
    element: <EditThreadPage />,
    conditional: "forum",
  },
  { path: "wallet/:sessionId", element: <WalletPage />, conditional: "store" },
  { path: "cart", element: <CartPage />, conditional: "store" },
  { path: "store/orders", element: <OrdersPage />, conditional: "store" },
  {
    path: "store/orders/:id",
    element: <OrderViewPage />,
    conditional: "store",
  },
  { path: "users", element: <UserDiscovery />, conditional: "users" },
  { path: "users/:userId", element: <UserDiscovery />, conditional: "users" },
  { path: "inbox", element: <InboxPage />, conditional: "inbox" },
  { path: "admin/meta/*", element: <AdminMetaSettings /> },
  { path: "admin/roles", element: <RolesManagementPage /> },
  { path: "deployments", element: <DeploymentsPage /> },
  { path: "datasources", element: <DataSourcesPage /> },
  { path: "datasources/:id", element: <DataSourceEditorPage /> },
  { path: "activity", element: <ActivityPage /> },
  { path: "flow", element: <FlowPage /> },
  { path: "settings/users/:userId/*", element: <SettingsPage /> },
  { path: "settings/*", element: <SettingsPage /> },
];

/** Routes accessible to both guests and authenticated users. */
export const guestRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "store", element: <StorePage />, conditional: "store" },
  { path: "store/product/:id", element: <ProductPage />, conditional: "store" },
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
  { path: "verify-email", element: <VerifyEmailPage /> },
  { path: "forgot-password", element: <ForgotPasswordPage /> },
  { path: "reset-password", element: <ResetPasswordPage /> },
  { path: "visualizer", element: <VisualizerPage /> },
  { path: "directory/:userId", element: <UserUploadsDirectory /> },
];
