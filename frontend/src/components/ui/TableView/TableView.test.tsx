import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableView } from "./TableView";

describe("TableView deferred rows", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the shared viewport boundary for large tables", () => {
    const observers: Array<{
      callback: IntersectionObserverCallback;
      target?: Element;
    }> = [];
    const disconnect = vi.fn();

    vi.stubGlobal(
      "IntersectionObserver",
      class {
        private entry: (typeof observers)[number];

        constructor(callback: IntersectionObserverCallback) {
          this.entry = { callback };
          observers.push(this.entry);
        }

        observe(target: Element) {
          this.entry.target = target;
        }

        disconnect() {
          disconnect();
        }
      }
    );

    const data = Array.from({ length: 26 }, (_, index) => ({ id: index + 1 }));
    const { container } = render(
      <TableView
        data={data}
        rowKey={item => item.id}
        columns={[
          {
            header: "Record",
            cell: item => <span>Record {item.id}</span>,
          },
        ]}
      />
    );

    expect(screen.queryByText("Record 1")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton-ui__primitive--text")).toHaveLength(26);

    const first = observers[0];
    act(() => {
      first.callback(
        [{ isIntersecting: true, target: first.target } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByText("Record 1")).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });
});
