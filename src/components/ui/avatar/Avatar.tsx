import Image from "next/image";
import React from "react";
import { generateInitials, getAvatarColorClass, shouldShowInitials } from "@/utils/avatarUtils";

interface AvatarProps {
  src?: string; // URL of the avatar image (optional now)
  alt?: string; // Alt text for the avatar
  name?: string; // User's name for generating initials
  size?: "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge"; // Avatar size
  status?: "online" | "offline" | "busy" | "none"; // Status indicator
}

const sizeClasses = {
  xsmall: "h-6 w-6 max-w-6",
  small: "h-8 w-8 max-w-8",
  medium: "h-10 w-10 max-w-10",
  large: "h-12 w-12 max-w-12",
  xlarge: "h-14 w-14 max-w-14",
  xxlarge: "h-16 w-16 max-w-16",
};

const textSizeClasses = {
  xsmall: "text-xs",
  small: "text-sm",
  medium: "text-sm",
  large: "text-base",
  xlarge: "text-lg",
  xxlarge: "text-xl",
};

const statusSizeClasses = {
  xsmall: "h-1.5 w-1.5 max-w-1.5",
  small: "h-2 w-2 max-w-2",
  medium: "h-2.5 w-2.5 max-w-2.5",
  large: "h-3 w-3 max-w-3",
  xlarge: "h-3.5 w-3.5 max-w-3.5",
  xxlarge: "h-4 w-4 max-w-4",
};

const statusColorClasses = {
  online: "bg-success-500",
  offline: "bg-error-400",
  busy: "bg-warning-500",
};

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "User Avatar",
  name = "User",
  size = "medium",
  status = "none",
}) => {
  const showInitials = shouldShowInitials(src);
  const initials = generateInitials(name);
  const colorClass = getAvatarColorClass(name);

  return (
    <div className={`relative rounded-full ${sizeClasses[size]}`}>
      {showInitials ? (
        // Avatar with Initials
        <div className={`flex items-center justify-center w-full h-full rounded-full ${colorClass}`}>
          <span className={`font-medium ${textSizeClasses[size]}`}>{initials}</span>
        </div>
      ) : (
        // Avatar with Image
        <Image
          width="0"
          height="0"
          sizes="100vw"
          src={src!}
          alt={alt}
          className="object-cover w-full h-full rounded-full"
        />
      )}

      {/* Status Indicator */}
      {status !== "none" && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-[1.5px] border-white dark:border-gray-900 ${
            statusSizeClasses[size]
          } ${statusColorClasses[status] || ""}`}
        ></span>
      )}
    </div>
  );
};

export default Avatar;
