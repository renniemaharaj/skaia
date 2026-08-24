import { NewStoreCategory } from "../../components/store/NewStoreCategory";
import { StorePageShell } from "./StorePageShell";

export const NewStoreCategoryPage = () => {
  return (
    <StorePageShell backTo="/store">
      <NewStoreCategory />
    </StorePageShell>
  );
};
