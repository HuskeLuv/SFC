import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import Avatar from "@/components/ui/avatar/Avatar";
import AvatarExample from "@/components/ui/avatar/AvatarExample";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Next.js Avatars | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Avatars page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function AvatarPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Avatar" />
      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Sistema Inteligente - Demonstração">
          <AvatarExample />
        </ComponentCard>

        <ComponentCard title="Avatar com Imagem">
          {/* Avatar with Image */}
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Avatar src="/images/user/user-01.jpg" size="xsmall" />
            <Avatar src="/images/user/user-01.jpg" size="small" />
            <Avatar src="/images/user/user-01.jpg" size="medium" />
            <Avatar src="/images/user/user-01.jpg" size="large" />
            <Avatar src="/images/user/user-01.jpg" size="xlarge" />
            <Avatar src="/images/user/user-01.jpg" size="xxlarge" />
          </div>
        </ComponentCard>

        <ComponentCard title="Avatar com Iniciais (Automático)">
          {/* Avatar with Initials - automatically generated */}
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Avatar name="Wellington Santos" size="xsmall" />
            <Avatar name="Wellington Santos" size="small" />
            <Avatar name="Wellington Santos" size="medium" />
            <Avatar name="Wellington Santos" size="large" />
            <Avatar name="Wellington Santos" size="xlarge" />
            <Avatar name="Wellington Santos" size="xxlarge" />
          </div>
        </ComponentCard>

        <ComponentCard title="Diferentes Usuários com Iniciais">
          {/* Different users with initials */}
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Avatar name="João Silva" size="medium" />
            <Avatar name="Maria Costa" size="medium" />
            <Avatar name="Pedro Oliveira" size="medium" />
            <Avatar name="Ana Santos" size="medium" />
            <Avatar name="Carlos Lima" size="medium" />
          </div>
        </ComponentCard>

        <ComponentCard title="Avatar com Indicador de Status">
          {/* Avatar with status indicator */}
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Avatar
              name="Wellington Santos"
              size="medium"
              status="online"
            />
            <Avatar
              name="João Silva"
              size="medium"
              status="offline"
            />
            <Avatar
              name="Maria Costa"
              size="medium"
              status="busy"
            />
            <Avatar
              name="Pedro Oliveira"
              size="medium"
              status="none"
            />
          </div>
        </ComponentCard>

        <ComponentCard title="Avatar com Imagem e Status">
          {/* Avatar with image and status */}
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <Avatar
              src="/images/user/user-01.jpg"
              size="medium"
              status="online"
            />
            <Avatar
              src="/images/user/user-02.jpg"
              size="medium"
              status="offline"
            />
            <Avatar
              src="/images/user/user-03.jpg"
              size="medium"
              status="busy"
            />
          </div>
        </ComponentCard>

        <ComponentCard title="Sistema Inteligente - Avatar Misto">
          {/* Mixed avatars - some with images, some with initials */}
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
              O sistema automaticamente escolhe entre imagem e iniciais baseado na disponibilidade
            </p>
            <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
              <Avatar
                src="/images/user/user-01.jpg"
                name="Usuário com Imagem"
                size="medium"
              />
              <Avatar
                name="Usuário Sem Imagem"
                size="medium"
              />
              <Avatar
                src="/images/user/user-02.jpg"
                name="Outro com Imagem"
                size="medium"
              />
              <Avatar
                name="Wellington Santos"
                size="medium"
              />
            </div>
          </div>
        </ComponentCard>
      </div>
    </div>
  );
}
