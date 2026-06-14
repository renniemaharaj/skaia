import { useState, useEffect } from "react";
import { apiRequest } from "../../utils/api";
import { useAtomValue } from "jotai";
import { hasPermissionAtom } from "../../atoms/auth";

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
          response?.map((cat) => ({
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
      <label htmlFor="category">Category *</label>
        <select
          id="category"
          className="form-input"
          value={value || ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id} disabled={cat.is_locked && !canEditCategory}>
              {cat.name}
              {cat.is_locked ? " (locked)" : ""}
            </option>
          ))}
        </select>
    </div>
  );
};

export default ForumCategory;
