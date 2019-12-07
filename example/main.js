import { join } from 'path'
import Fastify from 'fastify'
// Import directly from source here:
import FastifyESMLoader from '../index'
// Use as follows in your project:
// import FastifyESMLoader from 'fastify-esm-loader'

const fastify = Fastify({
  logger: {
    prettyPrint: {
      levelFirst: true
    }
  }
})

fastify.register(FastifyESMLoader, {
  baseDir: join(__dirname, 'routes'),
  injections: {
    someRootHelper() {
      return 'foobar'
    }
  }
})

async function listen() {
  try {
    await fastify.listen(5000)
    fastify.log.info(`Listening on ${fastify.server.address().port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

listen()
