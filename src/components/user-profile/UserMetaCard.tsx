"use client";
import React from "react";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Input from "../form/input/InputField";
import Label from "../form/Label";
import Avatar from "../ui/avatar/Avatar";

interface UserMetaCardProps {
  user?: {
    name?: string;
    email?: string;
    avatarUrl?: string;
  };
}

export default function UserMetaCard({ user }: UserMetaCardProps) {
  const { isOpen, openModal, closeModal } = useModal();
  const handleSave = () => {
    // Handle save logic here
    console.log("Saving changes...");
    closeModal();
  };

  // Split name into first and last name
  const nameParts = user?.name?.split(' ') || ['', ''];
  const firstName = nameParts[0] || 'Usuário';
  const lastName = nameParts.slice(1).join(' ') || '';

  return (
    <>
      <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col items-center w-full gap-6 xl:flex-row">
            <div className="flex items-center justify-center w-20 h-20">
              <Avatar
                src={user?.avatarUrl}
                name={user?.name || 'Usuário'}
                size="xxlarge"
                alt={`Avatar de ${user?.name || 'Usuário'}`}
              />
            </div>
            <div className="order-3 xl:order-2">
              <h3 className="mb-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {user?.name || 'Usuário'}
              </h3>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                {user?.email || 'email@exemplo.com'}
              </p>
              <Button size="sm" onClick={openModal}>
                Editar Perfil
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal}>
        <div className="max-w-[700px] m-4 p-6">
          <div className="mb-6">
            <h4 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              Editar Perfil
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Atualize seus detalhes para manter seu perfil atualizado.
            </p>
          </div>
          
          <div className="space-y-6">
            <div>
              <h5 className="mb-5 text-lg font-medium text-gray-800 dark:text-white/90 lg:mb-6">
                Informações de Contato
              </h5>
              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div>
                  <Label>LinkedIn</Label>
                  <Input
                    type="text"
                    defaultValue="https://www.linkedin.com/company/"
                  />
                </div>

                <div>
                  <Label>Instagram</Label>
                  <Input
                    type="text"
                    defaultValue="https://instagram.com/"
                  />
                </div>
              </div>
            </div>
            <div className="mt-7">
              <h5 className="mb-5 text-lg font-medium text-gray-800 dark:text-white/90 lg:mb-6">
                Informações Pessoais
              </h5>

              <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
                <div className="col-span-2 lg:col-span-1">
                  <Label>Nome</Label>
                  <Input type="text" defaultValue={firstName} />
                </div>

                <div className="col-span-2 lg:col-span-1">
                  <Label>Sobrenome</Label>
                  <Input type="text" defaultValue={lastName} />
                </div>

                <div className="col-span-2 lg:col-span-1">
                  <Label>Endereço de Email</Label>
                  <Input type="text" defaultValue={user?.email || ""} />
                </div>

                <div className="col-span-2 lg:col-span-1">
                  <Label>Telefone</Label>
                  <Input type="text" defaultValue="+85 99999-9999" />
                </div>

                <div className="col-span-2">
                  <Label>Biografia</Label>
                  <Input type="text" defaultValue="Gerente de Equipe" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 px-2 mt-6 lg:justify-end">
            <Button size="sm" variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave}>
              Salvar Alterações
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
