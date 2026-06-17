import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { hasPermissionAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import Select from "../input/Select";

interface Category {
  id: string;
  name: string;
  is_locked?: boolean;
}

interface ForumCategoryProps {
  value?: string;
  onChange?: (categoryId: string) => void;
}

const ForumCategory: React.FC<ForumCategoryProps> = ({ value, onChange }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canEditCategory = hasPermission("forum.category-edit");

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await apiRequest<any[]>("/forum/categories");
        const categoryList =
          response?.map(cat => ({
            id: cat.id,
            name: cat.name,
            is_locked: cat.is_locked,
          })) || [];
        setCategories(categoryList);
      } catch (error) {
        console.error("Error loading categories:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCategories();
  }, []);

  return (
    <div className="form-group">
      <Select
        id="category"
        className="form-input"
        label="Category *"
        value={value || ""}
        options={[
          { value: "", label: "Select a category" },
          ...categories.map(cat => ({
            value: cat.id,
            label: `${cat.name}${cat.is_locked ? " (locked)" : ""}`,
            disabled: cat.is_locked && !canEditCategory,
          })),
        ]}
        onChange={e => onChange?.(e.target.value)}
        disabled={loading}
      />
    </div>
  );
};

export default ForumCategory;
