import { render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { accessTokenAtom, currentUserAtom, type User } from "../../atoms/auth";
import { featuresAtom } from "../../atoms/config";
import CommunityHubPage from "./CommunityHubPage";

const features = {
  community: true,
  rankings: true,
  rewards: true,
  forum: true,
  docs: true,
  store: false,
  users: true,
  inbox: true,
  status: true,
};
const member: User = {
  id: "7",
  username: "ada",
  email: "ada@example.com",
  display_name: "Ada",
  avatar_url: "",
  banner_url: "",
  photo_url: "",
  bio: "",
  is_suspended: false,
  email_verified: true,
  roles: [],
  permissions: [],
  created_at: "",
  updated_at: "",
};

function renderHub(user?: User) {
  const store = createStore();
  store.set(featuresAtom, features);
  if (user) {
    store.set(accessTokenAtom, "token");
    store.set(currentUserAtom, user);
  }
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CommunityHubPage />
      </MemoryRouter>
    </Provider>
  );
}

describe("CommunityHubPage", () => {
  it("shows enabled public apps and a sign-in onboarding action", () => {
    renderHub();
    expect(screen.getByRole("heading", { name: "Everything in one place" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Proposals/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Leaderboards/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Service status/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Store/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "For you" })).not.toBeInTheDocument();
  });

  it("tailors member and operator apps from live permissions", () => {
    renderHub({ ...member, permissions: ["events.view", "home.manage"] });
    expect(screen.getByRole("heading", { name: "Welcome back, Ada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Rewards/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Messages/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Linked identities/ })).toHaveAttribute(
      "href",
      "/form/user/7/identities"
    );
    expect(screen.getByRole("heading", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Activity/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Status operations/ })).toBeInTheDocument();
  });
});
