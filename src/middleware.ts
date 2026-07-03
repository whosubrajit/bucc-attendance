/**
 * Route protection at the edge: anything under /dashboard, /attend or
 * /admin requires a valid session token. Fine-grained role checks happen
 * server-side in each route handler / server component.
 */
export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/attend/:path*", "/admin/:path*"],
};
