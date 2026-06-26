import { useEffect, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const useTransitionNavigation = () => {
  const [isPending, startTransition] = useTransition();
  const [path, setPath] = useState<string>("");

  const navigate = useNavigate();
  const navigateWT = (path: string) => {
    startTransition(() => {
      navigate(path);
      setPath(path);
    });
  };

  const location = useLocation();
  useEffect(() => {
    const path = location.pathname.split("/").slice(1).join("/");
    setPath(path);
  }, [location.pathname]);
  return {
    isPending,
    navigateWT,
    path,
  };
};
