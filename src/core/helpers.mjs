/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import util from 'util'
import { FullstackTestingError } from './errors.mjs'
import * as paths from 'path'
import { fileURLToPath } from 'url'
import * as semver from 'semver'
import { Templates } from './templates.mjs'
import { HEDERA_HAPI_PATH, ROOT_CONTAINER, SOLO_LOGS_DIR } from './constants.mjs'
import { constants } from './index.mjs'
import { FileContentsQuery, FileId } from '@hashgraph/sdk'

// cache current directory
const CUR_FILE_DIR = paths.dirname(fileURLToPath(import.meta.url))

export function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function parseNodeIds (input) {
  return splitFlagInput(input, ',')
}

export function splitFlagInput (input, separator = ',') {
  if (typeof input === 'string') {
    const items = []
    input.split(separator).forEach(s => {
      const item = s.trim()
      if (s) {
        items.push(item)
      }
    })

    return items
  }

  throw new FullstackTestingError('input is not a comma separated string')
}

export function cloneArray (arr) {
  return JSON.parse(JSON.stringify(arr))
}

/**
 * load package.json
 * @returns {any}
 */
export function loadPackageJSON () {
  try {
    const raw = fs.readFileSync(path.join(CUR_FILE_DIR, '..', '..', 'package.json'))
    return JSON.parse(raw.toString())
  } catch (e) {
    throw new FullstackTestingError('failed to load package.json', e)
  }
}

export function packageVersion () {
  const packageJson = loadPackageJSON()
  return packageJson.version
}

/**
 * Return the required root image for a platform version
 * @param releaseTag platform version
 * @return {string}
 */
export function getRootImageRepository (releaseTag) {
  const releaseVersion = semver.parse(releaseTag, { includePrerelease: true })
  if (releaseVersion.minor < 46) {
    return 'hashgraph/full-stack-testing/ubi8-init-java17'
  }

  return 'hashgraph/full-stack-testing/ubi8-init-java21'
}

export function getTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'solo-'))
}

export function createBackupDir (destDir, prefix = 'backup', curDate = new Date()) {
  const dateDir = util.format('%s%s%s_%s%s%s',
    curDate.getFullYear(),
    curDate.getMonth().toString().padStart(2, '0'),
    curDate.getDate().toString().padStart(2, '0'),
    curDate.getHours().toString().padStart(2, '0'),
    curDate.getMinutes().toString().padStart(2, '0'),
    curDate.getSeconds().toString().padStart(2, '0')
  )

  const backupDir = path.join(destDir, prefix, dateDir)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  return backupDir
}

export function makeBackup (fileMap = new Map(), removeOld = true) {
  for (const entry of fileMap) {
    const srcPath = entry[0]
    const destPath = entry[1]
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath)
      if (removeOld) {
        fs.rmSync(srcPath)
      }
    }
  }
}

export function backupOldPfxKeys (nodeIds, keysDir, curDate = new Date(), dirPrefix = 'gossip-pfx') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)
  const fileMap = new Map()
  for (const nodeId of nodeIds) {
    const srcPath = path.join(keysDir, `private-${nodeId}.pfx`)
    const destPath = path.join(backupDir, `private-${nodeId}.pfx`)
    fileMap.set(srcPath, destPath)
  }

  const srcPath = path.join(keysDir, 'public.pfx')
  const destPath = path.join(backupDir, 'public.pfx')
  fileMap.set(srcPath, destPath)
  makeBackup(fileMap, true)

  return backupDir
}

export function backupOldTlsKeys (nodeIds, keysDir, curDate = new Date(), dirPrefix = 'tls') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)
  const fileMap = new Map()
  for (const nodeId of nodeIds) {
    const srcPath = path.join(keysDir, Templates.renderTLSPemPrivateKeyFile(nodeId))
    const destPath = path.join(backupDir, Templates.renderTLSPemPrivateKeyFile(nodeId))
    fileMap.set(srcPath, destPath)
  }

  makeBackup(fileMap, true)

  return backupDir
}

export function backupOldPemKeys (nodeIds, keysDir, curDate = new Date(), dirPrefix = 'gossip-pem') {
  const backupDir = createBackupDir(keysDir, `unused-${dirPrefix}`, curDate)
  const fileMap = new Map()
  for (const nodeId of nodeIds) {
    const srcPath = path.join(keysDir, Templates.renderGossipPemPrivateKeyFile(nodeId))
    const destPath = path.join(backupDir, Templates.renderGossipPemPrivateKeyFile(nodeId))
    fileMap.set(srcPath, destPath)
  }

  makeBackup(fileMap, true)

  return backupDir
}

export function isNumeric (str) {
  if (typeof str !== 'string') return false // we only process strings!
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

/**
 * Validate a path provided by the user to prevent path traversal attacks
 * @param input the input provided by the user
 * @returns {*} a validated path
 */
export function validatePath (input) {
  if (input.indexOf('\0') !== -1) {
    throw new FullstackTestingError(`access denied for path: ${input}`)
  }
  return input
}

/**
 * Download logs files from all network pods and save to local solo log directory
 *    an instance of core/K8
 * @param {K8} k8 an instance of core/K8
 * @param {string} namespace the namespace of the network
 * @returns {Promise<void>} A promise that resolves when the logs are downloaded
 */
export async function getNodeLogs (k8, namespace) {
  k8.logger.debug('getNodeLogs: begin...')
  const pods = await k8.getPodsByLabel(['fullstack.hedera.com/type=network-node'])

  const timeString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')

  for (const pod of pods) {
    const podName = pod.metadata.name
    const targetDir = path.join(SOLO_LOGS_DIR, namespace, timeString)
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      const scriptName = 'support-zip.sh'
      const sourcePath = path.join(constants.RESOURCES_DIR, scriptName) // script source path
      await k8.copyTo(podName, ROOT_CONTAINER, sourcePath, `${HEDERA_HAPI_PATH}`)
      await k8.execContainer(podName, ROOT_CONTAINER, `chmod 0755 ${HEDERA_HAPI_PATH}/${scriptName}`)
      await k8.execContainer(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/${scriptName}`)
      await k8.copyFrom(podName, ROOT_CONTAINER, `${HEDERA_HAPI_PATH}/${podName}.zip`, targetDir)
    } catch (e) {
      // not throw error here, so we can continue to finish downloading logs from other pods
      // and also delete namespace in the end
      k8.logger.error(`failed to download logs from pod ${podName}`, e)
    }
    k8.logger.debug('getNodeLogs: ...end')
  }
}

/**
 * Create a map of node IDs to account IDs
 * @param nodeIDs an array of the node IDs
 * @returns {Map<string,string>} the map of node IDs to account IDs
 */
export function getNodeAccountMap (nodeIDs) {
  const accountMap = /** @type {Map<string,string>} **/ new Map()
  const realm = constants.HEDERA_NODE_ACCOUNT_ID_START.realm
  const shard = constants.HEDERA_NODE_ACCOUNT_ID_START.shard
  let accountId = constants.HEDERA_NODE_ACCOUNT_ID_START.num

  nodeIDs.forEach(nodeID => {
    const nodeAccount = `${realm}.${shard}.${accountId++}`
    accountMap.set(nodeID, nodeAccount)
  })
  return accountMap
}

export async function getFileContents (accountManager, namespace, fileNum) {
  await accountManager.loadNodeClient(namespace)
  const client = accountManager._nodeClient
  const fileId = FileId.fromString(`0.0.${fileNum}`)
  const queryFees = new FileContentsQuery().setFileId(fileId)
  return Buffer.from(await queryFees.execute(client)).toString('hex')
}

export function getEnvValue (envVarArray, name) {
  const kvPair = envVarArray.find(v => v.startsWith(`${name}=`))
  return kvPair ? kvPair.split('=')[1] : null
}

export function parseIpAddressToUint8Array (ipAddress) {
  const parts = ipAddress.split('.')
  const uint8Array = new Uint8Array(4)

  for (let i = 0; i < 4; i++) {
    uint8Array[i] = parseInt(parts[i], 10)
  }

  return uint8Array
}
