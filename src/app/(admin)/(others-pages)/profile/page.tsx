"use client";
import React, { useEffect, useState } from "react";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserAddressCard from "@/components/user-profile/UserAddressCard";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Not authenticated");
        setUser(await res.json());
      })
      .catch(() => setError("Not authenticated"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Carregando...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-7">
          Perfil
        </h3>
        <div className="space-y-6">
          <UserMetaCard user={user} />
          <UserInfoCard user={user} />
          <UserAddressCard />
        </div>
      </div>
    </div>
  );
}
