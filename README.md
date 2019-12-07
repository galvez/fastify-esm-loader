# fastify-esm-loader

An esm-based loader for your Fastify applications.

```sh
npm i fastify-esm-loader --save
```

## Features

- Automatically **discovers and registers route definitions**
- Introduces handy **idioms and helpers for dependency injection**
- Forces a **clean, well organized style** for route handler definitions

## Example

```sh
npm i
cd example/
node index.js
```

## Usage

```js
import { join } from 'path'
import Fastify from 'fastify'
import FastifyESMLoader from 'fastify-esm-loader'

const fastify = Fastify({
  logger: {
    prettyPrint: {
      levelFirst: true,
    },
  },
})

fastify.register(FastifyESMLoader, {
  baseDir: join(__dirname, 'routes'),
  injections: {
    someRootHelper () {
      return 'foobar'
    }
  }
})
```

You can also use `injections` to make available things like `db` and `redis`.

Check `examples/index.js` and `examples/main.js` for the full boilerplate.

`fastify-esm-loader` will peek into `baseDir` and pick up the following.

> Assuming `baseDir` is `resolve(__dirname, 'routes')`.

**project/routes/users/index.js**: exports from this file are made available in 
route definition functions (more on this below) in the `this` context. I refer
to these as _route injections_.

**project/routes/users/index.js**: here `users` is a **route group** -- you
can have multiple route groups under `baseDir`. This file must export a function
with a signature like this:

```js
export default function ({ fastify, self, env }) {
  fastify.get('/users/all', self.listUsers)
  fastify.get('/users/:id', self.getUser)
  fastify.post('/users/', self.createUser)
}
```

For that to work, you'd have to have three files under `routes/users`:

```
project/routes/users/listUser.js
project/routes/users/createUser.js
project/routes/users/createUser.js
```

And each of these files, export a default function that is then used as a route
handler. The loader will make them available in `self` in the main route 
definition function (`routes/index.js`), so that you can easily tweak the mapping.

The mechanics described above will work for both **top-level files and 
subfolders**, i.e., the following setup work would the same:

```
project/routes/index.js
project/routes/topLevelMethod.js
project/routes/users/listUser.js
project/routes/users/createUser.js
project/routes/users/createUser.js
```

## Handlers

There are two ways to define a handler:

1. A function that returns the handler, useful for injections (and environment access):

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
  reply.send({ message: 'No injections needed here' })
}
```

## Environment shorthand

`NODE_ENV` is used to populate `env.$node_env` (lowercase, prefixed with `$`).

This allows for checks such as this:

```js
export default ({ env, fastify, self }) => {
  if (env.$staging) {
    fastify.get('/staging-only', self.stagingOnly)
  }
}
```

## License

MIT
