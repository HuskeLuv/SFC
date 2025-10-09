/**
 * Componente genérico de estado de erro
 * Usado quando ocorre um erro ao carregar dados
 */

interface ErrorStateProps {
  title?: string;
  message: string;
}

const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Erro ao carregar dados",
  message,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
          {title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      </div>
    </div>
  );
};

export default ErrorState;

