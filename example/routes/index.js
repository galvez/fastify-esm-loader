
export default ({ env, fastify, self }) => {
  if (env.NODE_ENV === 'staging') {
    fastify.get('/staging-only', self.stagingOnly)
  }
}
