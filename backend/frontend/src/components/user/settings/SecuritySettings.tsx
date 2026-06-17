import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "../../../utils/api";
import Button from "../../input/Button";

export default function SecuritySettings() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!oldPassword || !newPassword || !confirmPassword) {
      setError("Please fill out all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });

      toast.success("Password updated successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <section className="section">
        <div className="section__header">
          <h3>Change Password</h3>
          <p>Update your password to keep your account secure.</p>
        </div>

        <div className="section__content">
          <form
            onSubmit={handleSubmit}
            style={{ maxWidth: "400px", display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label htmlFor="old-password" style={{ fontWeight: 500 }}>
                Old Password
              </label>
              <input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label htmlFor="new-password" style={{ fontWeight: 500 }}>
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <label htmlFor="confirm-password" style={{ fontWeight: 500 }}>
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            {error && (
              <div
                style={{ color: "var(--error-color)", fontSize: "0.875rem", marginTop: "0.5rem" }}
              >
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" loading={loading} style={{ marginTop: "1rem" }}>
              Update Password
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
