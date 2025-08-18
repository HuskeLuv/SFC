export const generateInitials = (name: string): string => {
  if (!name || typeof name !== 'string') return 'U';
  
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getAvatarColorClass = (name: string): string => {
  const colors = [
    "bg-brand-100 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400",
    "bg-pink-100 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400",
    "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400",
    "bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
    "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400",
    "bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
    "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400",
    "bg-error-100 text-error-600 dark:bg-error-900/20 dark:text-error-400",
  ];

  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
};

export const shouldShowInitials = (avatarUrl?: string | null): boolean => {
  return !avatarUrl || avatarUrl === '' || avatarUrl === '/images/user/owner.jpg';
}; 