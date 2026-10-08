import React, { useEffect, useState } from "react";

export const candidateRoutes = {
  overview: "/candidate/dashboard",
  jobs: "/jobs",
  resume: "/candidate/cv",
  applications: "/candidate/applications",
  recommendations: "/candidate/recommendations",
  interviews: "/candidate/interviews",
};

export function dashboardPath(user) {
  return user ? `/${user.role}/dashboard` : "/login";
}

export function loginPath(redirect) {
  return `/login?${new URLSearchParams({ redirect })}`;
}

export function navigate(href, replace = false) {
  const next = new URL(href, window.location.origin);
  if (next.origin !== window.location.origin) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useLocation() {
  const [location, setLocation] = useState(() => new URL(window.location.href));
  useEffect(() => {
    const update = () => setLocation(new URL(window.location.href));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location]);
  return location;
}

export function Link({ href, onClick, children, ...props }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          props.target ||
          props.download
        )
          return;
        if (new URL(href, window.location.origin).origin !== window.location.origin) return;
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
}

export function Redirect({ to }) {
  useEffect(() => navigate(to, true), [to]);
  return null;
}
