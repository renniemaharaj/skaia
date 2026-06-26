import { Workflow } from "lucide-react";

export function Header() {
  return (
    <header className="sk-flow-header">
      <div className="sk-flow-header-title">
        <Workflow size={24} />
        <span>Flow designer</span>
      </div>
      <div className="sk-flow-header-actions" />
    </header>
  );
}
