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
const OrderStatusFormPage = lazy(() => import("../components/store/OrderStatusFormPage.tsx"));
const NewProductPage = lazy(() =>
  import("../components/store/NewProductPage.tsx").then(m => ({
    default: m.NewProductPage,
  }))
);
const EditProductPage = lazy(() => import("../components/store/EditProductPage.tsx"));
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
const DeploymentsPage = lazy(() =>
  import("../components/page/deployments/DeploymentsPage.tsx").then(m => ({
    default: m.DeploymentsPage,
  }))
);
const PageBuilder = lazy(() => import("./page/index.tsx"));
const PageManageFormPage = lazy(() => import("../components/page/PageManageFormPage.tsx"));
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
const StreamPage = lazy(() => import("./stream/index.tsx"));
const ClipMakerPage = lazy(() =>
  import("./clipmaker/index.tsx").then(m => ({ default: m.ClipMakerPage }))
);
const TrashPage = lazy(() => import("./trash/TrashPage.tsx"));
const KJVPage = lazy(() => import("./kjv/index.tsx"));
const DocumentationCatalogPage = lazy(() => import("./documentation/DocumentationCatalogPage.tsx"));
const DocumentationViewPage = lazy(() => import("./documentation/DocumentationViewPage.tsx"));
const ForumDocumentationPage = lazy(() => import("./documentation/ForumDocumentationPage.tsx"));
const NewDocumentationPage = lazy(() => import("./documentation/NewDocumentationPage.tsx"));
const DocumentationSettingsPage = lazy(
  () => import("./documentation/DocumentationSettingsPage.tsx")
);
const DocumentationGuideEditorPage = lazy(
  () => import("./documentation/DocumentationGuideEditorPage.tsx")
);
const StatusPage = lazy(() => import("./status/StatusPage.tsx"));
const RewardsPage = lazy(() => import("./rewards/RewardsPage.tsx"));
const LeaderboardsPage = lazy(() => import("./leaderboards/LeaderboardsPage.tsx"));
const CommunityDirectoryPage = lazy(() => import("./community/CommunityDirectoryPage.tsx"));
const CommunityHubPage = lazy(() => import("./community/CommunityHubPage.tsx"));
const CommunityDetailPage = lazy(() => import("./community/CommunityDetailPage.tsx"));
const CommunityFormPage = lazy(() => import("./community/CommunityFormPage.tsx"));
const LegalProgressPage = lazy(() => import("./admin/LegalProgressPage.tsx"));
const LegalPolicyFormPage = lazy(() => import("./admin/LegalPolicyFormPage.tsx"));
const StoreCheckoutPolicyPage = lazy(() => import("./admin/StoreCheckoutPolicyPage.tsx"));

export const protectedRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "form/community/:kind/new", element: <CommunityFormPage />, conditional: "community" },
  {
    path: "form/community/:kind/:id/edit",
    element: <CommunityFormPage />,
    conditional: "community",
  },
  { path: "form/page/:slug/manage", element: <PageManageFormPage /> },
  { path: "form/site/legal/new", element: <LegalPolicyFormPage /> },
  {
    path: "form/store/checkout-policies",
    element: <StoreCheckoutPolicyPage />,
    conditional: "store",
  },
  { path: "form/user/:userId/*", element: <SettingsPage /> },
  { path: "form/user/*", element: <SettingsPage /> },
  { path: "form/site/*", element: <AdminMetaSettings /> },
  { path: "form/documentation/new", element: <NewDocumentationPage />, conditional: "docs" },
  {
    path: "form/documentation/:documentationSlug/settings",
    element: <DocumentationSettingsPage />,
    conditional: "docs",
  },
  {
    path: "form/documentation/:documentationSlug/guide/new",
    element: <DocumentationGuideEditorPage />,
    conditional: "docs",
  },
  {
    path: "form/documentation/:documentationSlug/guide/:articleSlug/edit",
    element: <DocumentationGuideEditorPage />,
    conditional: "docs",
  },
  { path: "form/forum/thread/new", element: <NewThreadPage />, conditional: "forum" },
  { path: "form/forum/thread/:threadId/edit", element: <EditThreadPage />, conditional: "forum" },
  { path: "form/forum/category/new", element: <NewForumCategoryPage />, conditional: "forum" },
  { path: "form/store/product/new", element: <NewProductPage />, conditional: "store" },
  {
    path: "form/store/product/:productId/edit",
    element: <EditProductPage />,
    conditional: "store",
  },
  { path: "form/store/category/new", element: <NewStoreCategoryPage />, conditional: "store" },
  {
    path: "form/store/order/:orderId/status",
    element: <OrderStatusFormPage />,
    conditional: "store",
  },
  // Legacy editor URLs remain available while external and saved links migrate.
  { path: "doc/new", element: <NewDocumentationPage />, conditional: "docs" },
  {
    path: "doc/manage/:documentationSlug/settings",
    element: <DocumentationSettingsPage />,
    conditional: "docs",
  },
  {
    path: "doc/manage/:documentationSlug/guides/new",
    element: <DocumentationGuideEditorPage />,
    conditional: "docs",
  },
  {
    path: "doc/manage/:documentationSlug/guides/:articleSlug",
    element: <DocumentationGuideEditorPage />,
    conditional: "docs",
  },
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
  { path: "admin/status", element: <StatusPage operator />, conditional: "status" },
  { path: "admin/rewards", element: <RewardsPage operator />, conditional: "rewards" },
  { path: "rewards", element: <RewardsPage />, conditional: "rewards" },
  { path: "deployments", element: <DeploymentsPage /> },
  { path: "datasources", element: <DataSourcesPage /> },
  { path: "datasources/:id", element: <DataSourceEditorPage /> },
  { path: "activity", element: <ActivityPage /> },
  { path: "trash", element: <TrashPage /> },
  { path: "flow", element: <FlowPage /> },
  { path: "stream", element: <StreamPage /> },
  { path: "clipmaker", element: <ClipMakerPage /> },
  { path: "settings/users/:userId/*", element: <SettingsPage /> },
  { path: "settings/*", element: <SettingsPage /> },
];

/** Routes accessible to both guests and authenticated users. */
export const guestRoutes: (CustomRoute | IndexRoute)[] = [
  { path: "form/site/legal", element: <LegalProgressPage /> },
  { path: "community", element: <CommunityHubPage />, conditional: "community" },
  { path: "community/:kind", element: <CommunityDirectoryPage />, conditional: "community" },
  { path: "community/:kind/:id", element: <CommunityDetailPage />, conditional: "community" },
  { path: "leaderboards", element: <LeaderboardsPage />, conditional: "rankings" },
  { path: "forum/docs", element: <ForumDocumentationPage />, conditional: "forum" },
  { path: "forum/docs/:categoryId", element: <ForumDocumentationPage />, conditional: "forum" },
  {
    path: "forum/docs/:categoryId/:threadId",
    element: <ForumDocumentationPage />,
    conditional: "forum",
  },
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
  { path: "kjv", element: <KJVPage /> },
  { path: "status", element: <StatusPage />, conditional: "status" },
  { path: "kjv/:book/:chapter/:verse/:readerState", element: <KJVPage /> },
  { path: "doc", element: <DocumentationCatalogPage />, conditional: "docs" },
  { path: "doc/:documentationSlug", element: <DocumentationViewPage />, conditional: "docs" },
  {
    path: "doc/:documentationSlug/:articleSlug",
    element: <DocumentationViewPage />,
    conditional: "docs",
  },
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
  { path: "stream/:streamId", element: <StreamPage /> },
  { path: "directory/:userId", element: <UserUploadsDirectory /> },
];
