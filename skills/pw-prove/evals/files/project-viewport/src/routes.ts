// Route table.
export const routes = [
  { path: "/login", name: "Login" },
  { path: "/reports", name: "Reports" },
  { path: "/reports/:id", name: "Report detail" },
  { path: "/settings", name: "Settings" },
] as const;

export type RoutePath = (typeof routes)[number]["path"];
