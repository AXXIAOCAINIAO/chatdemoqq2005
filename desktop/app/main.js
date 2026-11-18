const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { app, BrowserWindow, Menu, session, shell } = require('electron')

const DIST = path.join(__dirname, 'dist')
const ICON = path.join(__dirname, 'icon.ico')
const SMOKE = process.argv.includes('--smoke-test')
const API_HOST = 'https://api.deepseek.com'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
}

/**
 * 本地静态服务：给渲染进程一个 http://127.0.0.1 源。
 * 这样 localStorage / IndexedDB 按源隔离，跨域行为也和浏览器里调试时完全一致。
 */
const startServer = () =>
  new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const target = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
      // 只允许读取 dist 内的文件
      if (target !== DIST && !target.startsWith(DIST + path.sep)) {
        response.writeHead(403).end('Forbidden')
        return
      }
      fs.stat(target, (error, stats) => {
        if (error || !stats.isFile()) {
          response.writeHead(404).end('Not Found')
          return
        }
        response.writeHead(200, {
          'Content-Type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        fs.createReadStream(target).pipe(response)
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })

/** 桌面端请求接口时补一层 CORS 兜底 */
const patchCors = () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(API_HOST)) {
      callback({})
      return
    }
    const responseHeaders = { ...details.responseHeaders }
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === 'access-control-allow-origin') {
        delete responseHeaders[key]
      }
    }
    responseHeaders['Access-Control-Allow-Origin'] = ['*']
    callback({ responseHeaders })
  })
}

const createWindow = (origin) => {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    title: 'QQ2005 珊瑚版',
    backgroundColor: '#eef3f9',
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  // 外链、target=_blank 一律交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (SMOKE) {
    win.webContents.on('did-finish-load', async () => {
      try {
        const childCount = await win.webContents.executeJavaScript(
          'document.querySelector("#root")?.childElementCount ?? -1'
        )
        const title = await win.webContents.executeJavaScript('document.title')
        console.log(`SMOKE ok rootChildren=${childCount} title=${title}`)
        app.exit(0)
      } catch (error) {
        console.error(`SMOKE error ${error.message}`)
        app.exit(1)
      }
    })
    win.webContents.on('did-fail-load', (_event, code, description) => {
      console.error(`SMOKE fail ${code} ${description}`)
      app.exit(1)
    })
  }

  void win.loadURL(origin)
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.setAppUserModelId('com.retro.qq2005chat')

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    patchCors()
    const server = await startServer()
    const { port } = server.address()
    createWindow(`http://127.0.0.1:${port}/`)

    app.on('second-instance', () => {
      const [win] = BrowserWindow.getAllWindows()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    })
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(`http://127.0.0.1:${port}/`)
      }
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
