import { Auth } from "../../components";

export const RegisterPage = () => {
  const handleAuthSuccess = (token: string) => {
    console.log("Registration successful, token:", token);
  };

  return <Auth initialMode="register" onAuthSuccess={handleAuthSuccess} />;
};
