# Package scripts

Use the package scripts in `package.json` for repeated project workflows:
- `build`: `npm run build -w efootball-client && npm run build -w efootball-server`
- `dev`: `npm run dev:server & npm run dev:client`
- `dev:client`: `npm run dev -w efootball-client`
- `dev:server`: `npm run dev -w efootball-server`
