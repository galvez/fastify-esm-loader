import { parse, join } from 'path'
import klaw from 'klaw'
export { access, readFile, copyFile, ensureDir } from 'fs-extra'

function createFileExtensionFilter (filter) {
  return (path) => {
    let ext
    // eslint-disable-next-line no-cond-assign
    if (ext = parse(path).ext) {
      return filter.test(ext)
    }
    return true
  }
}

// Copied from @nuxt/blueprints as-is
export function walk (dir, { validateExtension, sliceRoot = true } = {}) {
  const matches = []

  let sliceAt
  if (sliceRoot) {
    if (sliceRoot === true) {
      sliceRoot = dir
    }

    sliceAt = sliceRoot.length + (sliceRoot.endsWith('/') ? 0 : 1)
  }

  const validate = createFileExtensionFilter(validateExtension)

  return new Promise((resolve) => {
    klaw(dir)
      .on('data', (match) => {
        const path = sliceAt ? match.path.slice(sliceAt) : match.path
        if (!path.includes('node_modules') && (!validate || validate(path))) {
          matches.push(path)
        }
      })
      .on('end', () => resolve(matches))
  })
}

function baseImport (baseDir, path, parent = null) {
  return import(parent ? join(baseDir, parent, path) : join(baseDir, path))
    .catch(() => console.error(`Error importing ${path}`))
}

function defaultImport (baseDir, path, parent = null) {
  return import(parent ? join(baseDir, parent, path) : join(baseDir, path))
    .then(m => m.default)
    .catch(() => console.error(`Error importing ${path}`))
}

async function loadRoutes (
  baseDir,
  matches,
  injections = {},
  parent = undefined,
  result = {},
  routeLoaders = [],
) {
  let m
  for (const match of matches) {
    if (match.match(/^[^/.]+$/)) {
      const index = matches.find(_ => _.match(`^${match}/index.js`))
      result[match] = {
        ...index && {
          index: () => baseImport(baseDir, join(match, 'index.js')),
        },
        ...matches
          .filter(_ => _.match(`^${match}/[^/]+\\.js$`))
          .filter(_ => !_.endsWith('index.js'))
          .reduce((methods, method) => {
            methods[parse(method).name] = () => {
              return defaultImport(baseDir, method, parent)
                .then((method) => {
                  if (typeof method !== 'function') {
                    return null
                  }
                  return method
                })
            }
            return methods
          }, {}),
      }
      const routeIndex = await result[match].index()
      const routeInjections = {
        ...injections,
        ...routeIndex,
        env: process.env,
        ...process.env.NODE_ENV && {
          [`$${env[process.env.NODE_ENV.toLowerCase()]}`]: true
        }
      }

      for (const [method, methodLoader] of Object.entries(result[match])) {
        if (method === 'index') {
          routeLoaders.push((fastify) => {
            return routeIndex.default({
              ...routeInjections,
              fastify,
              self: new Proxy(result[match], {
                get (_, prop) {
                  if (prop in result[match]) {
                    if (result[match][prop].length === 1) {
                      return result[match][prop](routeInjections)
                    }
                    return result[match][prop]
                  } else {
                    fastify.log.error(`${prop} is missing in ${match} namespace.`)
                  }
                },
              }),
            })
          })
        } else {
          result[match][method] = await methodLoader()
        }
      }
    } else if (match === 'index.js') {
      const indexRoutes = {
        index: () => baseImport(baseDir, 'index.js'),
        ...matches
          .filter(_ => _.match(/^[^/]+\.js$/))
          .filter(_ => !_.endsWith('index.js'))
          .reduce((methods, method) => {
            methods[parse(method).name] = () => {
              return defaultImport(baseDir, method, parent)
                .then((method) => {
                  if (typeof method !== 'function') {
                    return null
                  }
                  return method
                })
            }
            return methods
          }, {}),
      }
      const routeIndex = await indexRoutes.index()
      const routeInjections = {
        ...injections,
        ...routeIndex,
        env: process.env,
        ...process.env.NODE_ENV && {
          [`$${env[process.env.NODE_ENV.toLowerCase()]}`]: true
        }
      }

      for (const [method, methodLoader] of Object.entries(indexRoutes)) {
        if (method === 'index') {
          routeLoaders.push((fastify) => {
            return routeIndex.default({
              ...routeInjections,
              fastify,
              self: new Proxy(indexRoutes, {
                get (_, prop) {
                  if (prop in indexRoutes) {
                    if (indexRoutes[prop].length === 1) {
                      return indexRoutes[prop](routeInjections)
                    }
                    return indexRoutes[prop]
                  } else {
                    fastify.log.error(`${prop} is missing in index namespace.`)
                  }
                },
              }),
            })
          })
        } else {
          indexRoutes[method] = await methodLoader()
        }
      }
    } else {
      const childMatch = match.match(/^([^/.]+)\/([^/.]+)$/)
      if (childMatch) {
        if (!result[childMatch[1]]) {
          result[childMatch[1]] = {}
        }
        Object.assign(
          result[childMatch[1]],
          await loadRoutes(
            baseDir,
            matches
              .filter(_ => _.startsWith(match))
              .map(_ => _.slice(childMatch[1].length + 1))
              .filter(Boolean),
            injections,
            childMatch[1],
          ),
        )
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
    validateExtension: /\.js$/,
  })
  const routeLoaders = await loadRoutes(
    options.baseDir,
    matches.filter(Boolean),
    options.injections || {}
  )
  await Promise.all(routeLoaders.map(loader => loader(fastify)))
  next()
}
