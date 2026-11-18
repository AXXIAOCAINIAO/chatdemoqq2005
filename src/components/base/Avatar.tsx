import clsx from 'clsx'
import styles from './Avatar.module.css'

export type AvatarKind = 'me' | 'assistant' | 'session'

/** 由名称推导一个稳定的色相，让每个会话/成员有固定颜色的头像 */
const hueOf = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360
  }
  return hash
}

/** 圆形头像：自己、助手与会话各有一套配色，会话取名称首字并按名称着色 */
export const Avatar = ({
  kind,
  name = '',
  size = 38,
  tone,
  className,
}: {
  kind: AvatarKind
  name?: string
  size?: number
  /** 好友性别决定头像底色：男蓝女粉，缺省按名称哈希取色 */
  tone?: 'female' | 'male'
  className?: string
}) => {
  const box = { width: `${size}px`, height: `${size}px` }

  if (kind === 'assistant') {
    return (
      <div
        className={clsx(styles.avatar, styles.assistant, className)}
        style={{ ...box, fontSize: `${Math.round(size * 0.36)}px` }}
        aria-hidden
      >
        AI
      </div>
    )
  }

  if (kind === 'me') {
    return (
      <div className={clsx(styles.avatar, styles.me, className)} style={box} aria-hidden>
        <svg viewBox="0 0 24 24" width="62%" height="62%" fill="currentColor">
          <path d="M12 12.2a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0 1.9c-4 0-7.2 2.3-7.2 5.1V21h14.4v-1.8c0-2.8-3.2-5.1-7.2-5.1Z" />
        </svg>
      </div>
    )
  }

  const label = name.trim().charAt(0).toUpperCase() || '#'
  const hue = hueOf(name || label)
  const backgroundImage =
    tone === 'female'
      ? 'linear-gradient(180deg, #ffd5e6 0%, #ff7cb3 55%, #d6337f 100%)'
      : tone === 'male'
        ? 'linear-gradient(180deg, #d3e8ff 0%, #5aa7ea 55%, #1f6fc4 100%)'
        : `linear-gradient(135deg, hsl(${hue} 72% 64%), hsl(${(hue + 32) % 360} 74% 54%))`
  return (
    <div
      className={clsx(styles.avatar, styles.session, className)}
      style={{
        ...box,
        fontSize: `${Math.round(size * 0.42)}px`,
        backgroundImage,
      }}
      aria-hidden
    >
      {label}
    </div>
  )
}
