/**
 * Component tests for StockPillGroup.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import { StockPillGroup } from "@/components/replenishment/StockPillGroup";

describe("StockPillGroup", () => {
  it("renders em-dash when no stock numbers", () => {
    const { container } = render(
      <StockPillGroup allStockNos={[]} selectedStockNos={new Set()} onToggle={() => {}} />
    );
    expect(container.textContent).toContain("—");
  });

  it("renders one pill per stock number", () => {
    render(
      <StockPillGroup
        allStockNos={["STK-001", "STK-002", "STK-003"]}
        selectedStockNos={new Set()}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("STK-001")).toBeTruthy();
    expect(screen.getByText("STK-002")).toBeTruthy();
    expect(screen.getByText("STK-003")).toBeTruthy();
  });

  it("selected pill has emerald styling", () => {
    render(
      <StockPillGroup
        allStockNos={["STK-001"]}
        selectedStockNos={new Set(["STK-001"])}
        onToggle={() => {}}
      />
    );
    const btn = screen.getByText("STK-001");
    expect(btn.className).toContain("emerald");
  });

  it("unselected pill has stone styling", () => {
    render(
      <StockPillGroup
        allStockNos={["STK-002"]}
        selectedStockNos={new Set()}
        onToggle={() => {}}
      />
    );
    const btn = screen.getByText("STK-002");
    expect(btn.className).toContain("stone");
  });

  it("calls onToggle with correct stockNo when clicked", () => {
    const onToggle = jest.fn();
    render(
      <StockPillGroup
        allStockNos={["STK-001", "STK-002"]}
        selectedStockNos={new Set()}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByText("STK-002"));
    expect(onToggle).toHaveBeenCalledWith("STK-002");
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("has accessible title on selected pill", () => {
    render(
      <StockPillGroup
        allStockNos={["STK-001"]}
        selectedStockNos={new Set(["STK-001"])}
        onToggle={() => {}}
      />
    );
    const btn = screen.getByText("STK-001");
    expect(btn.getAttribute("title")).toContain("deselect");
  });

  it("has accessible title on unselected pill", () => {
    render(
      <StockPillGroup
        allStockNos={["STK-001"]}
        selectedStockNos={new Set()}
        onToggle={() => {}}
      />
    );
    const btn = screen.getByText("STK-001");
    expect(btn.getAttribute("title")).toContain("select");
  });

  it("renders many pills without error", () => {
    const stockNos = Array.from({ length: 50 }, (_, i) => `STK-${String(i).padStart(3, "0")}`);
    render(
      <StockPillGroup
        allStockNos={stockNos}
        selectedStockNos={new Set(stockNos.slice(0, 10))}
        onToggle={() => {}}
      />
    );
    expect(screen.getByText("STK-000")).toBeTruthy();
    expect(screen.getByText("STK-049")).toBeTruthy();
  });
});
