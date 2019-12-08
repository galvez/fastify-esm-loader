
export default ({ env, fastify, self }) => {
  if (env.$staging) {
    fastify.get('/staging-only', self.stagingOnly)
  }
}
