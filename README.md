# @jmondi/oauth2-server-example

This is an example implementation of the [@jmondi/oauth2-server](https://github.com/jasonraimondi/ts-oauth2-server) project using a NestJS/Express server and a Sveltekit client. This is closer to a real-world example of how to implement the package in a production application.

## Getting Started

You can use [Foreman](https://github.com/ddollar/foreman) or [Overmind](https://github.com/DarthSim/overmind) to manage these processes. Both tools allow running multiple applications specified in a Procfile simultaneously.

```
cp -n .env.example .env
pnpm install
pnpm install --prefix web

docker compose up -d
pnpm db:migrate
pnpm db:seed

overmind start # or use foreman
```
