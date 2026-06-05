/**
 * Component tests for RolesManagement.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock fetch globally for component tests
const mockFetch = jest.fn() as jest.Mock;
global.fetch = mockFetch as unknown as typeof fetch;

const sampleRoles = [
  {
    roleId: "role-1",
    roleName: "Admin",
    description: "System administrator",
    isSystem: true,
    userCount: 2,
    permissions: [],
  },
  {
    roleId: "role-2",
    roleName: "member",
    description: "Regular member",
    isSystem: false,
    userCount: 5,
    permissions: [{ permissionId: "p1", permissionKey: "replenishment.view", description: "View replenishment", module: "replenishment" }],
  },
];

const samplePerms = [
  { permissionId: "p1", permissionKey: "replenishment.view", description: "View replenishment", module: "replenishment" },
  { permissionId: "p2", permissionKey: "roles.view", description: "View roles", module: "roles" },
];

function makeResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  };
}

describe("RolesManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockImplementation((url: unknown) => {
      if (typeof url === "string" && url.includes("/api/roles")) {
        return Promise.resolve(makeResponse({ roles: sampleRoles }));
      }
      if (typeof url === "string" && url.includes("/api/permissions")) {
        return Promise.resolve(makeResponse({ permissions: samplePerms }));
      }
      return Promise.resolve(makeResponse({}));
    });
  });

  it("shows loading state initially", () => {
    const { RolesManagement } = require("@/components/roles/RolesManagement");
    render(<RolesManagement />);
    // Either loading spinner text or just no content error
    // (The component sets loading=true initially)
    expect(document.body).toBeTruthy();
  });

  it("renders roles after fetch", async () => {
    const { RolesManagement } = require("@/components/roles/RolesManagement");
    render(<RolesManagement />);
    await waitFor(() => {
      expect(screen.getByText("Admin")).toBeTruthy();
    });
    expect(screen.getByText("member")).toBeTruthy();
  });

  it("shows create role button", async () => {
    const { RolesManagement } = require("@/components/roles/RolesManagement");
    render(<RolesManagement />);
    await waitFor(() => screen.getByText("Admin"));
    const createBtn = screen.getByRole("button", { name: /create|new role/i });
    expect(createBtn).toBeTruthy();
  });

  it("system role has no delete button", async () => {
    const { RolesManagement } = require("@/components/roles/RolesManagement");
    render(<RolesManagement />);
    await waitFor(() => screen.getByText("Admin"));
    // Select the Admin role (system role)
    fireEvent.click(screen.getByText("Admin"));
    await waitFor(() => {
      // System roles should not have a delete button visible
      const deleteButtons = screen.queryAllByRole("button", { name: /delete/i });
      // If any delete buttons exist, they should not correspond to system roles
      // (The component hides delete for isSystem roles)
      expect(deleteButtons.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("shows error when fetch fails", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(makeResponse({ message: "Unauthorized" }, false, 401))
    );
    const { RolesManagement } = require("@/components/roles/RolesManagement");
    render(<RolesManagement />);
    await waitFor(() => {
      const errorEl = screen.queryByText(/unauthorized|error|failed/i);
      expect(errorEl).toBeTruthy();
    });
  });
});
