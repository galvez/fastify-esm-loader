export default ({ someRootHelper }) => (_, reply) => {
  reply.send({
    message: 'listUsers response',
    foobar: someRootHelper()
  })
}
