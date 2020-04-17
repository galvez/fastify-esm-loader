import { readdirSync, existsSync } from 'fs'
import { parse, join } from 'path'
import klaw from 'klaw'

export const methodPathSymbol = Symbol.for('method-path')

export function walk (dir, { sliceRoot = true } = {}) {
  const matches = []

  let sliceAt
  if (sliceRoot) {
    if (sliceRoot === true) {
      sliceRoot = dir
    }

    sliceAt = sliceRoot.length + (sliceRoot.endsWith('/') ? 0 : 1)
  }

  return new Promise((resolve) => {
    klaw(dir)
      .on('data', (match) => {
        const path = sliceAt ? match.path.slice(sliceAt) : match.path
        if (!path.includes('node_modules') && path.endsWith('index.js')) {
          matches.push(path)
        }
      })
      .on('end', () => resolve(matches))
  })
}

function defaultImport (path) {
  return import(path)
    .then(m => m.default)
}

function getFastifyFacade (fastify, { hooks }) {
  const httpMethods = {
    get: (...args) => {
      const [url, handler] = args
      fastify.route({
        method: 'GET',
        url,
        handler,
        ...hooks,
      })
    },
    post: (...args) => {
      const [url, handler] = args
      fastify.route({
        method: 'POST',
        url,
        handler,
        ...hooks,
      })      
    },
    put: (...args) => {
      const [url, handler] = args
      fastify.route({
        method: 'PUT',
        url,
        handler,
        ...hooks,
      })
    },
    delete: (...args) => {
      const [url, handler] = args
      fastify.route({
        method: 'DELETE',
        url,
        handler,
        ...hooks,
      })
    },
  }
  return new Proxy({
    ...httpMethods,
    route: (options) => {
      for (const [hook, list] of Object.entries(hooks)) {
        if (options[hook]) {
          if (!Array.isArray(list)) {
            list = [list]
          }
          if (!Array.isArray(options[hook])) {
            options[hook] = [options[hook], ...list]
          } else {
            options[hook].push(...list)
          }
        } else {
          options[hook] = list
        }
      }
      fastify.route(options)
    },
  },
  {
    get (facade, prop) {
      if (prop in facade) {
        return facade[prop]
      } else {
        return fastify[prop]
      }
    }
  })
}

async function loadRoutes (
  baseDir,
  matches,
  injections = {},
) {
  const routeLoaders = []
  for (const match of matches) {
    let dir = parse(match).dir
    if (dir) {
      dir = `./${dir}`
    }
    const dirPath = dir.replace(/[/\\]/g, '.').replace(/^\.+/g, '')
    const routes = {
      index: existsSync(join(baseDir, match))
        ? () => import(join(baseDir, match)).catch(() => {})
        : () => ({}),
      ...readdirSync(join(baseDir, dir))
        .filter(_ => _.endsWith('.js'))
        .filter(_ => !_.endsWith('index.js'))
        .reduce((methods, method) => {
          const methodName = parse(method).name
          methods[methodName] = () => {
            return defaultImport(`${baseDir}/${join(dir, method)}`)
              .then((method) => {
                if (typeof method !== 'function') {
                  return null
                }
                method[methodPathSymbol] = `${dirPath}.${methodName}`
                return method
              })
          }
          return methods
        }, {})
    }
    const routeIndex = await routes.index()
    const routeInjections = {
      ...injections,
      ...routeIndex,
      env: {
        ...process.env,
        ...process.env.NODE_ENV && {
          [`$${process.env.NODE_ENV.toLowerCase()}`]: true
        }
      }
    }

    for (const [method, methodLoader] of Object.entries(routes)) {
      if (method === 'index') {
        if (!routeIndex.default || typeof routeIndex.default !== 'function') {
          continue
        }
        routeLoaders.push((fastify, hooks) => {
          return routeIndex.default({
            ...routeInjections,
            fastify: getFastifyFacade(fastify, hooks),
            bind (method, name) {
              if (!method.name) {
                method.name = name
              }
              if (method.name) {
                method[methodPathSymbol] = `${dirPath}.${method.name}`
              }
              return method
            },
            self: new Proxy(routes, {
              get (_, prop) {
                if (prop in routes) {
                  if (routes[prop].length === 1) {
                    const dynMethod = routes[prop](routeInjections)
                    dynMethod[methodPathSymbol] = routes[prop][methodPathSymbol]
                    return dynMethod
                  }
                  return routes[prop]
                } else {
                  fastify.log.error(`${prop} is missing in index namespace.`)
                }
              }
            })
          })
        })
      } else {
        routes[method] = await methodLoader()
      }
    }
  }
  return routeLoaders
}

export default async (fastify, options = {}, next) => {
  if (!options.baseDir) {
    throw new Error('baseDir missing')
  }
  const matches = await walk(options.baseDir, {
    validateExtension: /\.js$/
  })
  const routeLoaders = await loadRoutes(
    options.baseDir,
    matches.filter(Boolean),
    options.injections || {},
  )
  const hooks = options.hooks || {}
  await Promise.all(routeLoaders.map(loader => loader(fastify, hooks)))
  next()
}
