export default helpers => (request, reply) => {
  reply.send({
    message: 'createUserResponse',
    foobar: helpers.someRegistrationHelper()
  })
}
