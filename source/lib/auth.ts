import { redirect } from "next/navigation";

import { demoMembers } from "@/lib/demo";
import { env, hasSupabaseConfig } from "@/lib/env";
import { createClientSupabaseServer } from "@/lib/supabase";

export type AuthUser = {
  id: string;
  email: string;
  role: "ADMIN" | "MEMBER";
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!hasSupabaseConfig()) {
    return {
      id: "demo-admin",
      email: demoMembers[1].email,
      role: "ADMIN",
    };
  }

  const supabase = await createClientSupabaseServer();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const email = data.user.email.toLowerCase();
  const metadataRole = String(data.user.app_metadata?.role ?? "").toLowerCase();
  const role = metadataRole === "admin" || env.adminEmails.includes(email) ? "ADMIN" : "MEMBER";

  return {
    id: data.user.id,
    email,
    role,
  };
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
