import { Auth } from "../../components/auth/Auth";

export const LoginPage = () => {
  const handleAuthSuccess = (token: string) => {
    console.log("Login successful, token:", token);
  };

  return <Auth initialMode="login" onAuthSuccess={handleAuthSuccess} />;
};
