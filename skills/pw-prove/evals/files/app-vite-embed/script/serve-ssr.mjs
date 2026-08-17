// The packaged serve script hard-codes its port through the package.json script
// (PORT=4100). Read the command, supply your own PORT -- never invoke it verbatim.
import { createServer } from 'node:http'
const port = Number(process.env.PORT) || 4100
createServer((_req, res) => res.end('ok')).listen(port, () => {
  console.log(`ssr server listening on http://localhost:${port}`)
})
