import { readdirSync } from 'fs'
import { parse, join } from 'path'
import klaw from 'klaw'

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

async function loadRoutes (
  baseDir,
  matches,
  injections = {}
) {
  const routeLoaders = []
  for (const match of matches) {
    let dir = parse(match).dir
    if (dir) {
      dir = `./${dir}`
    }
    const routes = {
      index: () => import(join(baseDir, match)),
      ...readdirSync(join(baseDir, dir))
        .filter(_ => _.endsWith('.js'))
        .filter(_ => !_.endsWith('index.js'))
        .reduce((methods, method) => {
          methods[parse(method).name] = () => {
            return defaultImport(`${baseDir}/${join(dir, method)}`)
              .then((method) => {
                if (typeof method !== 'function') {
                  return null
                }
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
        routeLoaders.push((fastify) => {
          return routeIndex.default({
            ...routeInjections,
            fastify,
            self: new Proxy(routes, {
              get (_, prop) {
                if (prop in routes) {
                  if (routes[prop].length === 1) {
                    return routes[prop](routeInjections)
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
    options.injections || {}
  )
  await Promise.all(routeLoaders.map(loader => loader(fastify)))
  next()
}
