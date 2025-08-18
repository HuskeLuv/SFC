import React from "react";
import Avatar from "./Avatar";

interface AvatarExampleProps {
  className?: string;
}

interface User {
  id: number;
  name: string;
  avatarUrl?: string | null;
}

const AvatarExample: React.FC<AvatarExampleProps> = ({ className = "" }) => {
  // Exemplo de usuários com diferentes cenários
  const users: User[] = [
    {
      id: 1,
      name: "Wellington Santos",
      avatarUrl: undefined, // Sem imagem - mostrará iniciais "WS"
    },
    {
      id: 2,
      name: "João Silva",
      avatarUrl: "/images/user/user-01.jpg", // Com imagem
    },
    {
      id: 3,
      name: "Maria Costa",
      avatarUrl: "", // String vazia - mostrará iniciais "MC"
    },
    {
      id: 4,
      name: "Pedro Oliveira",
      avatarUrl: null, // Null - mostrará iniciais "PO"
    },
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          Sistema de Avatar Inteligente
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          O sistema automaticamente escolhe entre mostrar uma imagem ou as iniciais do usuário.
          Se não houver imagem ou se for uma imagem padrão, as iniciais são exibidas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex flex-col items-center space-y-3 p-4 border border-gray-200 rounded-lg dark:border-gray-800"
          >
            <Avatar
              src={user.avatarUrl || undefined}
              name={user.name}
              size="large"
              alt={`Avatar de ${user.name}`}
            />
            <div className="text-center">
              <p className="font-medium text-gray-800 dark:text-white/90">
                {user.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {user.avatarUrl ? "Com imagem" : "Com iniciais"}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-gray-50 rounded-lg dark:bg-gray-800/50">
        <h4 className="mb-2 font-medium text-gray-800 dark:text-white/90">
          Como usar:
        </h4>
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <code className="px-2 py-1 bg-gray-200 rounded dark:bg-gray-700">
              &lt;Avatar name=&quot;Wellington Santos&quot; /&gt;
            </code>{" "}
            - Mostra iniciais &quot;WS&quot;
          </p>
          <p>
            <code className="px-2 py-1 bg-gray-200 rounded dark:bg-gray-700">
              &lt;Avatar src=&quot;/path/to/image.jpg&quot; name=&quot;João Silva&quot; /&gt;
            </code>{" "}
            - Mostra a imagem se disponível, senão iniciais
          </p>
          <p>
            <code className="px-2 py-1 bg-gray-200 rounded dark:bg-gray-700">
              &lt;Avatar name=&quot;Maria Costa&quot; size=&quot;large&quot; status=&quot;online&quot; /&gt;
            </code>{" "}
            - Com tamanho e status
          </p>
        </div>
      </div>
    </div>
  );
};

export default AvatarExample; 