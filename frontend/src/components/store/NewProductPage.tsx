import { NewProduct } from "../../components/store/NewProduct";
import { StorePageShell } from "./StorePageShell";

export const NewProductPage = () => {
  return (
    <StorePageShell backTo="/store">
      <NewProduct />
    </StorePageShell>
  );
};
