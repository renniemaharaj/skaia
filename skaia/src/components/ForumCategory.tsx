import "./ForumCategory.css";

const ForumCategory = () => {
  return (
    <div className="form-group">
      <select className="category-select">
        <option value="">Select a category</option>
        <option value="general">General Discussion</option>
        <option value="tech">Support</option>
        <option value="gaming">Events</option>
      </select>
    </div>
  );
};

export default ForumCategory;
