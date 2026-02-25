import { Auth } from "../../components/Auth";

export const RegisterPage = () => {
  const handleAuthSuccess = (token: string) => {
    console.log("Registration successful, token:", token);
  };

  return <Auth initialMode="register" onAuthSuccess={handleAuthSuccess} />;
};
