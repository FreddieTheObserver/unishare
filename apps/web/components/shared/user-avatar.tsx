import Image from 'next/image'
import { isRenderableImage } from '@/lib/image-hosts'
import { avatarGradient, initials as initialsOf } from '@/lib/avatar'
import { cn } from '@/lib/utils'

const sizeClasses = {
  xs: 'w-5 h-5 rounded-[4px] text-[9px]',
  sm: 'w-6 h-6 rounded-[4px] text-[9px]',
  md: 'w-8 h-8 rounded-[6px] text-xs',
  lg: 'w-[72px] h-[72px] rounded-[6px] text-xl',
}

const sizePx = {
  xs: '20px',
  sm: '24px',
  md: '32px',
  lg: '72px',
}

interface UserAvatarProps {
  name: string
  image?: string | null
  size: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  priority?: boolean
}

export function UserAvatar({ name, image, size, className, priority }: UserAvatarProps) {
  const showImage = !!image && isRenderableImage(image)
  return (
    <div
      className={cn(
        sizeClasses[size],
        'relative flex items-center justify-center font-mono font-medium overflow-hidden',
        showImage
          ? 'bg-border text-foreground'
          : 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.25)]',
        className,
      )}
      // No picture: a gradient picked from the name (same palette as uniauth's account page).
      style={showImage ? undefined : { background: avatarGradient(name) }}
    >
      {/* Unlisted hosts would throw in next/image; show initials instead. */}
      {showImage ? (
        <Image
          src={image}
          alt={name}
          fill
          sizes={sizePx[size]}
          className="object-cover"
          priority={priority}
        />
      ) : (
        initialsOf(name)
      )}
    </div>
  )
}
