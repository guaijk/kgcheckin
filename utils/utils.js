import { spawn } from 'child_process'

/** 延时 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 启动 api 服务 */
function startService() {
  const api = spawn('npm', ['run', 'apiService'])

  api.stdout.on('data', () => {})
  api.on('close', () => console.log('子进程退出'))
  api.stderr.on('data', data => {
    console.log('服务启动失败')
    throw new Error(`${data}`)
  })

  return api
}

/** 关闭 api 服务 */
function close_api(api) {
  api.kill()
}

/** 发送请求到本地 api 服务 */
async function send(path, method, headers) {
  const result = await fetch('http://127.0.0.1:3000' + path, {
    method,
    headers,
  }).then(r => r.json())
  return result
}

export { delay, startService, close_api, send }
