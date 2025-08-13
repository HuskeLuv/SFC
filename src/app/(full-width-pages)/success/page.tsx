import GridShape from "@/components/common/GridShape";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export const metadata: Metadata = {
  title: "Sucesso",
  description: "Sucesso",
};

export default function Success() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-6 overflow-hidden z-1">
      <GridShape />
      <div className="mx-auto w-full max-w-[274px] text-center sm:max-w-[555px]">
        <div className="mx-auto mb-10 w-full max-w-[100px] text-center sm:max-w-[160px]">
          <Image
            src="./images/error/success.svg"
            alt="success"
            className="dark:hidden"
            width={148}
            height={148}
          />
          <Image
            src="./images/error/success-dark.svg"
            alt="success"
            className="hidden dark:block"
            width={148}
            height={148}
          />
        </div>

        <h1 className="mb-2 font-bold text-gray-800 text-title-md dark:text-white/90 xl:text-title-2xl">
          SUCESSO !
        </h1>

        <p className="mt-6 mb-6 text-base text-gray-700 dark:text-gray-400 sm:text-lg">
          Ótimo! Sua mensagem foi enviada com sucesso. Nossa equipe de suporte
          entrará em contato com você o mais breve possível.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
        >
          Voltar para a página inicial
        </Link>
      </div>
      {/* <!-- Footer --> */}
      <p className="absolute text-sm text-center text-gray-500 -translate-x-1/2 bottom-6 left-1/2 dark:text-gray-400">
        &copy; {new Date().getFullYear()} - Teste
      </p>
    </div>
  );
}
