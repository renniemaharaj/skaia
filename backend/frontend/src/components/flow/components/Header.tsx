import { CheckCircle, Workflow, Loader2 } from "lucide-react";
import React from "react";
import UserBox from "./UserBox";
import { useAtomValue } from "jotai";
import { flowStateAtom } from "../../../atoms/flow";
import Button from "../../input/Button";

export function Header({
  progressSaved,
  syncNow,
}: {
  progressSaved: boolean;
  syncNow: () => void;
}) {
  const flowProfile = useAtomValue(flowStateAtom);

  return (
    <header className="sk-flow-header">
      <div className="sk-flow-header-title">
        <Workflow size={24} />
        <span>Flow designer</span>
      </div>
      <div className="sk-flow-header-actions">
      </div>
    </header>
  );
}
