export type DashboardSession = {
  userId: string;
  avatarKey: string | null;
  role: "admin" | "member";
  username: string;
  roleId: string | null;
  roleName: string;
  permissions: string[];
  email: string;
  firstName: string;
  lastName: string;
} | null;
