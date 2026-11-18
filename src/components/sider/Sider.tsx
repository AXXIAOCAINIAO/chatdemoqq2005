import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { IconPanelLeftOutline16, NewChatIcon } from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Avatar } from '../base/Avatar.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

const pad = (value: number) => String(value).padStart(2, '0')

const formatClock = () => {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/** 2000 年代风格的 QQ 主面板：蓝色标题栏 + 个人信息区 + 好友（会话）分组列表 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const [clock, setClock] = useState(formatClock)
  const groups = useMemo(() => {
    // 好友会话固定归在「我的好友」组，自己新建的对话仍按时间分组
    const friends = sessions.filter((session) => session.friendId !== undefined)
    const others = sessions.filter((session) => session.friendId === undefined)
    const result: { key: string; label: string; sessions: SessionSummary[] }[] = []
    if (friends.length > 0) {
      result.push({ key: 'friends', label: t('myFriends'), sessions: friends })
    }
    result.push(...groupSessions(others, now, t))
    return result
  }, [sessions, now, t])
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setClock(formatClock()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.titleBar}>
        <span className={styles.titleText}>{t('appName')}</span>
        <span className={styles.windowButtons} aria-hidden>
          <span className={styles.winBtn}>_</span>
          <span className={styles.winBtn}>□</span>
          <span className={styles.winBtn}>×</span>
        </span>
      </div>
      <div className={styles.profile}>
        <Avatar kind="me" size={48} />
        <div className={styles.profileInfo}>
          <div className={styles.nickname}>{t('retroNickname')}</div>
          <div className={styles.signature} title={t('retroSignature')}>
            {t('retroSignature')}
          </div>
          <div className={styles.status}>
            <span className={styles.onlineDot} />
            <span>{t('retroOnline')}</span>
            <span className={styles.clock}>{clock}</span>
          </div>
        </div>
      </div>
      <div className={styles.toolbar}>
        <IconButton icon={<NewChatIcon />} tooltip={t('newChat')} onClick={newChat} />
        <IconButton
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.caret}>▼</span>
                <span className={styles.sectionLabel}>{group.label}</span>
                <span className={styles.sectionCount}>
                  {group.key === 'friends'
                    ? `(${group.sessions.length}/${group.sessions.length})`
                    : `(${group.sessions.length})`}
                </span>
              </div>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onDelete={() => setDeleting(session)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon} />
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} onClick={closeMobileSider} />
      <div className={styles.drawer}>
        <Sider mobile />
      </div>
    </>
  )
}
