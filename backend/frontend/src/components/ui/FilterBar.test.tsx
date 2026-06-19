import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TableView } from "./TableView/TableView";
import { FilterBar } from "./FilterBar";

describe("FilterBar", () => {
  it("forwards search changes and clears active filters", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const onClear = vi.fn();

    render(
      <FilterBar
        searchValue="pending"
        onSearchChange={onSearchChange}
        onClear={onClear}
        hasActiveFilters
        resultCount="2 of 8"
      />
    );

    await user.type(screen.getByRole("searchbox"), " order");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onSearchChange).toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByText("2 of 8")).toBeInTheDocument();
  });

  it("stays inside TableView when filtering produces no rows", () => {
    render(
      <TableView
        data={[] as Array<{ id: string }>}
        columns={[{ id: "id", header: "ID", cell: item => item.id }]}
        toolbar={<FilterBar searchValue="missing" onSearchChange={() => {}} />}
        emptyState={<p>No matching rows.</p>}
      />
    );

    expect(screen.getByRole("searchbox")).toHaveValue("missing");
    expect(screen.getByText("No matching rows.")).toBeInTheDocument();
  });
});
