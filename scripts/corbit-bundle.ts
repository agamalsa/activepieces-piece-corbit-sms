// Builds the self-contained npm bundle of the piece with the official Activepieces bundler,
// then adds README.md and LICENSE so they appear on npm. Run from the Activepieces root after
// place-in-activepieces.mjs (which copies this file to tools/scripts/pieces/corbit-bundle.ts).
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { preparePieceDistForPublish } from '../../../packages/cli/src/lib/utils/prepare-piece-utils'

const main = async (): Promise<void> => {
  const piecePath = resolve('packages/pieces/community/corbit-sms')
  const { name } = JSON.parse(readFileSync(join(piecePath, 'package.json'), 'utf8'))
  execSync(`npx turbo run build --filter=${name} --concurrency=1`, { stdio: 'inherit' })
  await preparePieceDistForPublish(piecePath)
  for (const file of ['README.md', 'LICENSE']) {
    if (existsSync(join(piecePath, file))) {
      copyFileSync(join(piecePath, file), join(piecePath, 'dist', file))
    }
  }
  const json = JSON.parse(readFileSync(join(piecePath, 'dist', 'package.json'), 'utf8'))
  const deps = Object.entries({ ...json.dependencies, ...json.peerDependencies })
  const offending = deps.filter(([dep, version]) => dep.startsWith('@activepieces/') || String(version).startsWith('workspace:'))
  if (offending.length > 0) {
    throw new Error(`Unbundled dependencies left in dist/package.json: ${offending.map(([dep]) => dep).join(', ')}`)
  }
  console.info(`Bundle ready: ${join(piecePath, 'dist')} (${json.name}@${json.version})`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
