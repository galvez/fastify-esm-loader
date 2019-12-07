import { parse, join } from 'path'
import klaw from 'klaw'
export { access, readFile, copyFile, ensureDir } from 'fs-extra'

// Copied from @nuxt/blueprints as-is
function createFileFilter (filter) {
  if (!filter) {
    return
  }

  if (filter instanceof RegExp) {
    return path => filter.test(path)
  }

  if (typeof filter === 'string') {
    return path => path.includes(filter)
  }

  return filter
}

// Copied from @nuxt/blueprints as-is
export function walk (dir, { validate, sliceRoot = true } = {}) {
  const matches = []

  let sliceAt
  if (sliceRoot) {
    if (sliceRoot === true) {
      sliceRoot = dir
    }

    sliceAt = sliceRoot.length + (sliceRoot.endsWith('/') ? 0 : 1)
  }

  validate = createFileFilter(validate)

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
  parent = undefined,
  result = {},
  routeLoaders = [],
  injections = {},
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
                  if (method.length === 1) {
                    return method(injections)
                  } else {
                    return method
                  }
                })
            }
            return methods
          }, {}),
      }
      const routeIndex = await result[match].index()
      const routeInjections = { ...injections, ...routeIndex }

      for (const [method, methodLoader] of Object.entries(result[match])) {
        if (method === 'index') {
          routeLoaders.push((fastify) => {
            return routeIndex.default({
              ...routeInjections,
              fastify,
              self: new Proxy(result[match], {
                get (_, prop) {
                  if (prop in result[match]) {
                    return result[match][prop].bind(routeInjections)
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
      result.index = match
    // eslint-disable-next-line no-cond-assign
    } else if (m = match.match(/^[^/.]+\.js$/)) {
      result[m[0]] = match
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
  const matches = await walk(baseDir, {
    validate: /!\.js$/,
  })
  const routeLoaders = await loadRoutes(baseDir, matches.filter(Boolean))
  await Promise.all(routeLoaders.map(loader => loader(fastify)))
  next()
}
