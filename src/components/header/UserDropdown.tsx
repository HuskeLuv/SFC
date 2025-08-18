"use client";
import Link from "next/link";
import React, { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import Avatar from "../ui/avatar/Avatar";

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }
  
  // Mock user data - em produção isso viria de um contexto ou hook
  const user = {
    name: "Wellington Santos",
    email: "wellington@example.com"
  };

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center dropdown-toggle text-gray-700 dark:text-gray-400 dropdown-toggle"
      >
        <span className="mr-3">
          <Avatar 
            name={user.name}
            size="large"
            alt={`Avatar de ${user.name}`}
          />
        </span>

        <span className="block mr-1 font-medium text-theme-sm">Wellington</span>

        <svg
          className={`stroke-gray-500 dark:stroke-gray-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.3125 8.65625L9 13.3437L13.6875 8.65625"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="right-0 mt-2 w-56"
      >
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-900 dark:text-white">{user.name}</p>
          <p className="text-sm font-medium text-gray-500 truncate dark:text-gray-400">
            {user.email}
          </p>
        </div>
        <div className="py-1">
          <DropdownItem>
            <Link
              href="/profile"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={closeDropdown}
            >
              Seu Perfil
            </Link>
          </DropdownItem>
          <DropdownItem>
            <Link
              href="/settings"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={closeDropdown}
            >
              Configurações
            </Link>
          </DropdownItem>
          <DropdownItem>
            <Link
              href="/help"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={closeDropdown}
            >
              Ajuda
            </Link>
          </DropdownItem>
        </div>
        <div className="py-1 border-t border-gray-200 dark:border-gray-800">
          <DropdownItem>
            <Link
              href="/logout"
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              onClick={closeDropdown}
            >
              Sair
            </Link>
          </DropdownItem>
        </div>
      </Dropdown>
    </div>
  );
}
