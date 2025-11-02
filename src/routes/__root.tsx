import NavBar from "@/components/nav-bar";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <NavBar />
      <Outlet />
    </>
  );
}
