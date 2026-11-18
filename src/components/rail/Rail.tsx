import clsx from 'clsx'
import { useTheme } from '../../app/theme.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { setSiderCollapsed, setThemePreference, useSettings } from '../../services/settings.js'
import {
  IconDarkOutline16,
  IconLightOutline16,
  IconNewChatOutline20,
  IconSettingsOutline16,
} from '../base/icons.js'
import { openSettings } from '../settings/settingsDialogState.js'
import styles from './Rail.module.css'

/** 消息气泡图标（QQ 左侧导航用的对话入口） */
const ChatBubbleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path
      d="M20.5 11.6c0 4.3-3.8 7.8-8.5 7.8-1 0-2-.2-2.9-.5L4.5 20.5l1.2-3.5c-1.3-1.4-2.2-3.3-2.2-5.4C3.5 7.3 7.3 3.8 12 3.8s8.5 3.5 8.5 7.8Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="8.6" cy="11.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11.6" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.4" cy="11.6" r="1" fill="currentColor" stroke="none" />
  </svg>
)

/** 最左侧竖排导航：头像、消息（会话列表开关）、新建对话，底部为主题与设置 */
export const Rail = () => {
  const t = useTranslate()
  const theme = useTheme()
  const collapsed = useSettings((state) => state.siderCollapsed)
  const listTooltip = collapsed ? t('expandSiderbarButton') : t('collapseSiderbarButton')
  const themeTooltip = t('avatarMenuSettingsDialogThemeItemLabel')

  return (
    <nav className={styles.rail}>
      <div className={styles.nav}>
        <button
          type="button"
          title={listTooltip}
          aria-label={listTooltip}
          aria-pressed={!collapsed}
          className={clsx(styles.button, !collapsed && styles.active)}
          onClick={() => setSiderCollapsed(!collapsed)}
        >
          <ChatBubbleIcon />
        </button>
        <button
          type="button"
          title={t('newChat')}
          aria-label={t('newChat')}
          className={styles.button}
          onClick={newChat}
        >
          <IconNewChatOutline20 />
        </button>
      </div>
      <div className={styles.spacer} />
      <div className={styles.nav}>
        <button
          type="button"
          title={themeTooltip}
          aria-label={themeTooltip}
          className={styles.button}
          onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <IconLightOutline16 /> : <IconDarkOutline16 />}
        </button>
        <button
          type="button"
          title={t('settings')}
          aria-label={t('settings')}
          className={styles.button}
          onClick={() => openSettings('general')}
        >
          <IconSettingsOutline16 />
        </button>
      </div>
    </nav>
  )
}
