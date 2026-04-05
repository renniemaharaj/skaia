import { useState, useEffect } from "react";
import { apiRequest } from "../../utils/api";
import { ChevronDown } from "lucide-react";
import "./ForumCategory.css";

interface Category {
  id: string;
  name: string;
}

interface ForumCategoryProps {
  value?: string;
  onChange?: (categoryId: string) => void;
}

const ForumCategory: React.FC<ForumCategoryProps> = ({ value, onChange }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await apiRequest<any[]>("/forum/categories");
        const categoryList =
          response?.map((cat) => ({
            id: cat.id,
            name: cat.name,
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
      <div className="category-select-wrapper">
        <select
          id="category"
          className="category-select"
          value={value || ""}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={loading}
        >
          <option value="">Select a category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <ChevronDown className="category-select-icon" size={18} />
      </div>
    </div>
  );
};

export default ForumCategory;
