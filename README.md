# fastify-esm-loader

An esm-based loader for your Fastify applications.

## Features

- Automatically **discovers and registers route definitions**
- Introduces handy **idioms and helpers for dependency injection**
- Forces a **clean, well organized style** for route handler definitions

## Usage

Check `examples/index.js` and `examples/main.js` for the full boilerplate.

`fastify-esm-loader` will peek into `baseDir` and pick up the following.

> Assuming `baseDir` is `resolve(__dirname, 'routes')`.

**project/routes/index.js**: exports from this file are made available in 
route definition functions (more on this below) in the `this` context. I refer
to these as _root route injections_.

**projects/routes/users/index.js**: here `users` is a **route group** -- you
can have multiple route groups under `baseDir`. This file must export a function
with a signature like this:

```js
export default function ({ fastify, self, env }) {
  if (env.NODE_ENV === 'staging') {
    fastify.get('/staging-only-handler', self.stagingOnly)
  }
  fastify.get('/users/all', self.listUsers)
  fastify.get('/users/:id', self.getUser)
  fastify.post('/users/', self.createUser)
}
```

For that to work, you'd have to have three files under `routes/users`:

```
projects/routes/users/listUser.js
projects/routes/users/createUser.js
projects/routes/users/createUser.js
```

And each of these files, export a default function that is then used as a route
handler. The loader will make them available in `self` in the main route 
definition function (`routes/index.js`), so that you can easily tweak the mapping.

> Bonus: the mechanics described above **will work recursively for subfolders**.

## Handlers

There are two ways to define a handler:

1. A function that returns the handler, useful for injections:

```js
export default ({ env }) => {
  return async (request, reply) => {
    reply.send(await auth.authenticate(env.JWT_TOKEN))
  }
}
```

2. A direct handler export:

```js
export default async function (request, reply) {
  reply.send({ message: 'No injectios needed here' })
}
```

## License

MIT
