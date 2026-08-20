import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Mail } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import FormField from "./FormField";
import ManagedForm from "./ManagedForm";

describe("ManagedForm grouped variant", () => {
  it("keeps separated field groups while Formik owns validation and submission", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <MemoryRouter>
        <ManagedForm
          id="grouped-form"
          variant="grouped"
          icon={<Mail size={18} />}
          title="Account access"
          description="Enter your account email."
          initialValues={{ email: "" }}
          validate={values => (!values.email.trim() ? { email: "Email is required" } : {})}
          onSubmit={onSubmit}
          submitLabel="Continue"
        >
          <FormField name="email" label="Account email" type="email" variant="grouped" required />
        </ManagedForm>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Account access" })).toBeInTheDocument();
    expect(screen.getByLabelText("Account email").closest(".managed-field-group")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Account email"), "member@example.com");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { email: "member@example.com" },
        expect.objectContaining({ setStatus: expect.any(Function) })
      )
    );
  });
});
