
export default ({ fastify, self }) => {
  fastify.get('/users', self.listUsers)
  fastify.get('/users/:id', self.getUser)
  fastify.post('/users', self.createUser)
}

export function someRegistrationHelper () {
  return 'foobar'
}
