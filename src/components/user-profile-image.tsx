import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { User } from "lucide-react";
import { useSession } from "next-auth/react";

interface UserProfileImageProps {
  user?: {
    name?: string | null;
    image?: string | null;
  } | null;
  className?: string; // Class for the main Avatar container
  fallbackClassName?: string; // Class for the fallback icon
}

export function UserProfileImage({ user, className, fallbackClassName }: UserProfileImageProps) {
  const { data: session } = useSession();

  // Use passed user, or fallback to session user
  const displayUser = user ?? session?.user;

  return (
    <Avatar className={cn("h-6 w-6", className)}>
      <AvatarImage src={displayUser?.image || ""} alt={displayUser?.name || "User"} />
      <AvatarFallback>
        {displayUser?.name?.[0]?.toUpperCase() || (
          <User className={cn("h-4 w-4", fallbackClassName)} />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
