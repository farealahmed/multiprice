# multiprice

## Setup

`docker compose up` requires a `.env` file at the repository root — it is not
committed, and there is no working default for `JWT_SECRET` (an empty or
guessable session secret would make signed cookies forgeable).

```sh
cp .env.example .env
```

Then set `JWT_SECRET` in `.env` to a real generated value:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Paste the output into `.env` as `JWT_SECRET=...`. Once that's set:

```sh
docker compose up --build
```

The app is served at `http://localhost:3000`.
