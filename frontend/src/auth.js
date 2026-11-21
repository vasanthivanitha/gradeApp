import { AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool } from 'amazon-cognito-identity-js'

export const config = {
  api: import.meta.env.VITE_API_URL,
  pool: import.meta.env.VITE_POOL_ID,
  client: import.meta.env.VITE_CLIENT_ID,
  plans: ['monthly', 'yearly'].map((id) => {
    const prefix = 'VITE_' + id.toUpperCase() + '_'
    const env = import.meta.env
    return { id, name: env[prefix + 'NAME'] || (id === 'monthly' ? 'Monthly' : 'Yearly'),
      quota: Number(env[prefix + 'QUOTA']) || 30, price: Number(env[prefix + 'PRICE']) || null }
  }),
}
const pool = config.pool && config.client ? new CognitoUserPool({ UserPoolId: config.pool, ClientId: config.client }) : null

function requirePool() {
  if (!pool) throw new Error('Connect the app to its AWS stack to use account features.')
  return pool
}

function user(email) {
  return new CognitoUser({ Username: email.trim().toLowerCase(), Pool: requirePool() })
}

const callback = (resolve, reject) => (error, result) => error ? reject(error) : resolve(result)
export const register = (email, password) => new Promise((resolve, reject) => {
  const address = email.trim().toLowerCase()
  requirePool().signUp(address, password, [
    new CognitoUserAttribute({ Name: 'email', Value: address }),
  ], [], callback(resolve, reject))
})

export const login = (email, password) => new Promise((resolve, reject) => {
  const account = user(email)
  account.authenticateUser(new AuthenticationDetails({ Username: account.getUsername(), Password: password }), {
    onSuccess: resolve, onFailure: reject,
    newPasswordRequired: () => reject(new Error('Reset your password to finish signing in.')),
  })
})

export const verify = (email, code) => new Promise((resolve, reject) =>
  user(email).confirmRegistration(code.trim(), false, callback(resolve, reject)))
export const resend = (email) => new Promise((resolve, reject) =>
  user(email).resendConfirmationCode(callback(resolve, reject)))

export const reset = (email, code, password) => new Promise((resolve, reject) => {
  const handlers = { onSuccess: resolve, onFailure: reject, inputVerificationCode: resolve }
  if (code) user(email).confirmPassword(code.trim(), password, handlers)
  else user(email).forgotPassword(handlers)
})

export const session = () => new Promise((resolve, reject) => {
  const account = pool?.getCurrentUser()
  if (!account) return resolve(null)
  account.getSession(callback(resolve, reject))
})

export async function signOut() {
  const account = pool?.getCurrentUser()
  if (!account) return
  try {
    await new Promise((resolve) => {
      account.getSession((error) => {
        if (error) return resolve()
        account.revokeTokens(resolve)
      })
    })
  } finally {
    account.signOut()
  }
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  const current = await session()
  if (!current?.isValid()) throw Object.assign(new Error('Sign in to continue.'), { status: 401 })
  const response = await fetch(config.api + path, { method, signal,
    headers: { Authorization: 'Bearer ' + current.getIdToken().getJwtToken(),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data?.message || 'The request could not complete.'), { status: response.status })
  return data
}

export function upload(url, headers, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [header, value] of Object.entries(headers)) xhr.setRequestHeader(header, value)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100))
    }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error('The upload could not be confirmed. Check History before uploading again.'))
    xhr.onerror = xhr.ontimeout = () => reject(new Error('The upload could not be confirmed. Check your connection and History.'))
    xhr.timeout = 300000
    xhr.send(file)
  })
}
