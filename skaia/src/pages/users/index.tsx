import { useParams } from "react-router-dom";
import UserPermissionManager from "../../components/user/UserPermissionManager";
import UserProfile from "./UserProfile";

const UserDiscovery = () => {
  const { userId } = useParams<{ userId: string }>();

  // If userId is provided, show the user profile
  if (userId) {
    return <UserProfile />;
  }

  // Otherwise show the permission manager
  return <UserPermissionManager />;
};

export default UserDiscovery;
