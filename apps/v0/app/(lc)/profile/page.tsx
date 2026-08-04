"use client";

import { lazy } from "react";

const Profile = lazy(() => import("@components/containers/Profile"));

export default function Page() {
  return <Profile />;
}
