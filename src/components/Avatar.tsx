import React from 'react';
import { UserCircle } from 'lucide-react';

interface AvatarProps {
  avatarUrl: string | null;
  name?: string;
  size: number;
  className: string;
}

// Renders a User's real avatar photo when available, or a single fixed
// generic icon otherwise — never a randomly-generated stand-in image. See
// issue #18: `avatarUrl` is only ever populated from a real Google profile
// photo, so every fallback here is deliberately the same icon, not per-user
// variation.
export const Avatar: React.FC<AvatarProps> = ({ avatarUrl, name = '', size, className }) => {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <UserCircle size={size} />
    </div>
  );
};
