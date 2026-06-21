export default function UserBox() {
  return (
    <div 
      style={{ 
        width: "36px", height: "36px", borderRadius: "50%", 
        background: "var(--primary-color)", color: "var(--bg-color)", 
        display: "flex", alignItems: "center", justifyContent: "center", 
        fontSize: "0.85rem", fontWeight: "bold", cursor: "pointer",
        boxShadow: "var(--shadow-sm)", transition: "transform 0.2s, box-shadow 0.2s"
      }}
      title="Flow User (Editor)"
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
    >
      FU
    </div>
  );
}
