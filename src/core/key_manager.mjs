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
import * as x509 from '@peculiar/x509'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { FullstackTestingError, MissingArgumentError } from './errors.mjs'
import { getTmpDir } from './helpers.mjs'
import { constants, Keytool } from './index.mjs'
import { Logger } from './logging.mjs'
import { Templates } from './templates.mjs'

x509.cryptoProvider.set(crypto)

export class KeyManager {
  static SigningKeyAlgo = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 3072
  }

  static SigningKeyUsage = ['sign', 'verify']

  static TLSKeyAlgo = {
    name: 'RSASSA-PKCS1-v1_5',
    hash: 'SHA-384',
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 4096
  }

  static TLSKeyUsage = ['sign', 'verify']
  static TLSCertKeyUsages =
    x509.KeyUsageFlags.digitalSignature |
    x509.KeyUsageFlags.keyEncipherment |
    x509.KeyUsageFlags.dataEncipherment

  static TLSCertKeyExtendedUsages = [
    x509.ExtendedKeyUsage.serverAuth,
    x509.ExtendedKeyUsage.clientAuth
  ]

  static ECKeyAlgo = {
    name: 'ECDSA',
    namedCurve: 'P-384',
    hash: 'SHA-384'
  }

  constructor (logger) {
    if (!logger || !(logger instanceof Logger)) throw new MissingArgumentError('An instance of core/Logger is required')
    this.logger = logger
  }

  /**
   * Convert CryptoKey into PEM string
   * @param privateKey
   * @returns {Promise<string>}
   */
  async convertPrivateKeyToPem (privateKey) {
    const ab = await crypto.subtle.exportKey('pkcs8', privateKey)
    return x509.PemConverter.encode(ab, 'PRIVATE KEY')
  }

  /**
   * Convert PEM private key into CryptoKey
   * @param pemStr PEM string
   * @param algo key algorithm
   * @param keyUsages key usages
   * @returns {Promise<CryptoKey>}
   */
  async convertPemToPrivateKey (pemStr, algo, keyUsages = ['sign']) {
    if (!algo) throw new MissingArgumentError('algo is required')

    const items = x509.PemConverter.decode(pemStr)

    // Since pem file may include multiple PEM data, the decoder returns an array
    // However for private key there should be a single item.
    // So, we just being careful here to pick the last item (similar to how last PEM data represents the actual cert in
    // a certificate bundle)
    const lastItem = items[items.length - 1]

    return await crypto.subtle.importKey('pkcs8', lastItem, algo, false, keyUsages)
  }

  /**
   * Return file names for node key
   * @param nodeId node ID
   * @param keyPrefix key prefix such as constants.PFX_AGREEMENT_KEY_PREFIX
   * @param keysDir directory where keys and certs are stored
   * @returns {{privateKeyFile: string, certificateFile: string}}
   */
  prepareNodeKeyFilePaths (nodeId, keysDir, keyPrefix = constants.SIGNING_KEY_PREFIX) {
    if (!nodeId) throw new MissingArgumentError('nodeId is required')
    if (!keysDir) throw new MissingArgumentError('keysDir is required')
    if (!keyPrefix) throw new MissingArgumentError('keyPrefix is required')

    const keyFile = path.join(keysDir, Templates.renderGossipPemPrivateKeyFile(keyPrefix, nodeId))
    const certFile = path.join(keysDir, Templates.renderGossipPemPublicKeyFile(keyPrefix, nodeId))

    return {
      privateKeyFile: keyFile,
      certificateFile: certFile
    }
  }

  /**
   * Return file names for TLS key
   * @param nodeId node ID
   * @param keysDir directory where keys and certs are stored
   * @returns {{privateKeyFile: string, certificateFile: string}}
   */
  prepareTLSKeyFilePaths (nodeId, keysDir) {
    if (!nodeId) throw new MissingArgumentError('nodeId is required')
    if (!keysDir) throw new MissingArgumentError('keysDir is required')

    const keyFile = path.join(keysDir, `hedera-${nodeId}.key`)
    const certFile = path.join(keysDir, `hedera-${nodeId}.crt`)

    return {
      privateKeyFile: keyFile,
      certificateFile: certFile
    }
  }

  /**
   * Store node keys and certs as PEM files
   * @param nodeId node ID
   * @param nodeKey an object containing privateKeyPem, certificatePem data
   * @param keysDir directory where keys and certs are stored
   * @param nodeKeyFiles an object stores privateKeyFile and certificateFile
   * @param keyName optional key type name for logging
   * @return a Promise that saves the keys and certs as PEM files
   */
  async storeNodeKey (nodeId, nodeKey, keysDir, nodeKeyFiles, keyName = '') {
    if (!nodeId) {
      throw new MissingArgumentError('nodeId is required')
    }

    if (!nodeKey || !nodeKey.privateKey) {
      throw new MissingArgumentError('nodeKey.privateKey is required')
    }

    if (!nodeKey || !nodeKey.certificateChain) {
      throw new MissingArgumentError('nodeKey.certificateChain is required')
    }

    if (!keysDir) {
      throw new MissingArgumentError('keysDir is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new MissingArgumentError('nodeKeyFiles.privateKeyFile is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new MissingArgumentError('nodeKeyFiles.certificateFile is required')
    }

    const keyPem = await this.convertPrivateKeyToPem(nodeKey.privateKey)
    const certPems = []
    nodeKey.certificateChain.forEach(cert => {
      certPems.push(cert.toString('pem'))
    })

    const self = this
    return new Promise((resolve, reject) => {
      try {
        this.logger.debug(`Storing ${keyName} key for node: ${nodeId}`, { nodeKeyFiles })

        fs.writeFileSync(nodeKeyFiles.privateKeyFile, keyPem)

        // remove if the certificate file exists already as otherwise we'll keep appending to the last
        if (fs.existsSync(nodeKeyFiles.certificateFile)) {
          fs.rmSync(nodeKeyFiles.certificateFile)
        }

        certPems.forEach(certPem => {
          fs.writeFileSync(nodeKeyFiles.certificateFile, certPem + '\n', { flag: 'a' })
        })

        self.logger.debug(`Stored ${keyName} key for node: ${nodeId}`, {
          nodeKeyFiles
        })

        resolve(nodeKeyFiles)
      } catch (e) {
        reject(e)
      }
    })
  }

  /**
   * Load node keys and certs from PEM files
   * @param nodeId node ID
   * @param keysDir directory where keys and certs are stored
   * @param algo algorithm used for key
   * @param nodeKeyFiles an object stores privateKeyFile and certificateFile
   * @param keyName optional key type name for logging
   * @return returns a dictionary object contains privateKey, certificate, certificateChain
   */
  async loadNodeKey (nodeId, keysDir, algo, nodeKeyFiles, keyName = '') {
    if (!nodeId) {
      throw new MissingArgumentError('nodeId is required')
    }

    if (!keysDir) {
      throw new MissingArgumentError('keysDir is required')
    }

    if (!algo) {
      throw new MissingArgumentError('algo is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.privateKeyFile) {
      throw new MissingArgumentError('nodeKeyFiles.privateKeyFile is required')
    }

    if (!nodeKeyFiles || !nodeKeyFiles.certificateFile) {
      throw new MissingArgumentError('nodeKeyFiles.certificateFile is required')
    }

    this.logger.debug(`Loading ${keyName}-keys for node: ${nodeId}`, { nodeKeyFiles })

    const keyBytes = await fs.readFileSync(nodeKeyFiles.privateKeyFile)
    const keyPem = keyBytes.toString()
    const key = await this.convertPemToPrivateKey(keyPem, algo)

    const certBytes = await fs.readFileSync(nodeKeyFiles.certificateFile)
    const certPems = x509.PemConverter.decode(certBytes.toString())

    const certs = []
    certPems.forEach(certPem => {
      const cert = new x509.X509Certificate(certPem)
      certs.push(cert)
    })

    const certChain = await new x509.X509ChainBuilder({ certificates: certs.slice(1) }).build(certs[0])

    this.logger.debug(`Loaded ${keyName}-key for node: ${nodeId}`, {
      nodeKeyFiles,
      cert: certs[0].toString('pem')
    })
    return {
      privateKey: key,
      certificate: certs[0],
      certificateChain: certChain
    }
  }

  /**
   * Generate signing key and certificate
   * @param nodeId node ID
   * @return returns a dictionary object stores privateKey, certificate, certificateChain
   */
  async generateSigningKey (nodeId) {
    try {
      const keyPrefix = constants.SIGNING_KEY_PREFIX
      const curDate = new Date()
      const friendlyName = Templates.renderNodeFriendlyName(keyPrefix, nodeId)

      this.logger.debug(`generating ${keyPrefix}-key for node: ${nodeId}`, { friendlyName })

      const keypair = await crypto.subtle.generateKey(
        KeyManager.SigningKeyAlgo,
        true,
        KeyManager.SigningKeyUsage)

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: `CN=${friendlyName}`,
        notBefore: curDate,
        notAfter: new Date().setFullYear(curDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS),
        keys: keypair,
        extensions: [
          new x509.BasicConstraintsExtension(true, 1, true),
          new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth, x509.ExtendedKeyUsage.clientAuth], true),
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          await x509.SubjectKeyIdentifierExtension.create(keypair.publicKey)
        ]
      })

      const certChain = await new x509.X509ChainBuilder().build(cert)

      this.logger.debug(`generated ${keyPrefix}-key for node: ${nodeId}`, { cert: cert.toString('pem') })

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to generate signing key: ${e.message}`, e)
    }
  }

  /**
   * Store signing key and certificate
   * @param nodeId node ID
   * @param nodeKey an object containing privateKeyPem, certificatePem data
   * @param keysDir directory where keys and certs are stored
   * @return returns a Promise that saves the keys and certs as PEM files
   */
  async storeSigningKey (nodeId, nodeKey, keysDir) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeId, keysDir, constants.SIGNING_KEY_PREFIX)
    return this.storeNodeKey(nodeId, nodeKey, keysDir, nodeKeyFiles, 'signing')
  }

  /**
   * Load signing key and certificate
   * @param nodeId node ID
   * @param keysDir directory path where pem files are stored
   * @return returns a dictionary object contains privateKey, certificate, certificateChain
   */
  async loadSigningKey (nodeId, keysDir) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeId, keysDir, constants.SIGNING_KEY_PREFIX)
    return this.loadNodeKey(nodeId, keysDir, KeyManager.SigningKeyAlgo, nodeKeyFiles, 'signing')
  }

  /**
   * Generate EC key and cert
   *
   * @param nodeId node ID
   * @param keyPrefix key prefix such as constants.PFX_AGREEMENT_KEY_PREFIX
   * @param signingKey signing key
   * @return a dictionary object stores privateKey, certificate, certificateChain
   */
  async ecKey (nodeId, keyPrefix, signingKey) {
    if (!nodeId) throw new MissingArgumentError('nodeId is required')
    if (!keyPrefix) throw new MissingArgumentError('keyPrefix is required')
    if (!signingKey) throw new MissingArgumentError('no signing key found')

    try {
      const curDate = new Date()
      const notAfter = new Date().setFullYear(curDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS)
      const friendlyName = Templates.renderNodeFriendlyName(keyPrefix, nodeId)

      this.logger.debug(`generating ${keyPrefix}-key for node: ${nodeId}`, { friendlyName })

      const keypair = await crypto.subtle.generateKey(KeyManager.ECKeyAlgo, true, ['sign', 'verify'])

      const cert = await x509.X509CertificateGenerator.create({
        publicKey: keypair.publicKey,
        signingKey: signingKey.privateKey,
        subject: `CN=${friendlyName}`,
        issuer: signingKey.certificate.subject,
        serialNumber: '01',
        notBefore: curDate,
        notAfter,
        extensions: [
          new x509.KeyUsagesExtension(
            x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
        ]
      })

      if (!await cert.verify({
        date: new Date(notAfter),
        publicKey: signingKey.certificate.publicKey,
        signatureOnly: true
      })) {
        throw new FullstackTestingError(`failed to verify generated certificate for '${friendlyName}'`)
      }

      const certChain = await new x509.X509ChainBuilder({ certificates: [signingKey.certificate] }).build(cert)

      this.logger.debug(`generated ${keyPrefix}-key for node: ${nodeId}`, { cert: cert.toString('pem') })
      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to generate ${keyPrefix}-key: ${e.message}`, e)
    }
  }

  /**
   * Generate agreement key
   * @param nodeId node ID
   * @param signingKey signing key
   * @return a dictionary object stores privateKey, certificate, certificateChain
   */
  async generateAgreementKey (nodeId, signingKey) {
    return this.ecKey(nodeId, constants.AGREEMENT_KEY_PREFIX, signingKey)
  }

  /**
   * Store agreement key and certificate
   * @param nodeId node ID
   * @param nodeKey an object containing privateKeyPem, certificatePem data
   * @param keysDir directory where keys and certs are stored
   * @return a Promise that saves the keys and certs as PEM files
   */
  async storeAgreementKey (nodeId, nodeKey, keysDir) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeId, keysDir, constants.AGREEMENT_KEY_PREFIX)
    return this.storeNodeKey(nodeId, nodeKey, keysDir, nodeKeyFiles, 'agreement')
  }

  /**
   * Load agreement key and certificate
   * @param nodeId node ID
   * @param keysDir directory path where pem files are stored
   * @return a dictionary object contains privateKey, certificate, certificateChain
   */
  async loadAgreementKey (nodeId, keysDir) {
    const nodeKeyFiles = this.prepareNodeKeyFilePaths(nodeId, keysDir, constants.AGREEMENT_KEY_PREFIX)
    return this.loadNodeKey(nodeId, keysDir, KeyManager.ECKeyAlgo, nodeKeyFiles, 'agreement')
  }

  /**
   * Generate gRPC TLS key
   *
   * It generates TLS keys in PEM format such as below:
   *  hedera-<nodeID>.key
   *  hedera-<nodeID>.crt
   *
   * @param nodeId
   * @param distinguishedName distinguished name as: new x509.Name(`CN=${nodeId},ST=${state},L=${locality},O=${org},OU=${orgUnit},C=${country}`)
   * @return {Promise<privateKeyFile:string|certificateFile:string>}
   */
  async generateGrpcTLSKey (nodeId, distinguishedName = new x509.Name(`CN=${nodeId}`)) {
    if (!nodeId) throw new MissingArgumentError('nodeId is required')
    if (!distinguishedName) throw new MissingArgumentError('distinguishedName is required')

    try {
      const curDate = new Date()

      this.logger.debug(`generating gRPC TLS for node: ${nodeId}`, { distinguishedName })

      const keypair = await crypto.subtle.generateKey(
        KeyManager.TLSKeyAlgo,
        true,
        KeyManager.TLSKeyUsage)

      const cert = await x509.X509CertificateGenerator.createSelfSigned({
        serialNumber: '01',
        name: distinguishedName,
        notBefore: curDate,
        notAfter: new Date().setFullYear(curDate.getFullYear() + constants.CERTIFICATE_VALIDITY_YEARS),
        keys: keypair,
        extensions:
          [
            new x509.BasicConstraintsExtension(false, 0, true),
            new x509.KeyUsagesExtension(KeyManager.TLSCertKeyUsages, true),
            new x509.ExtendedKeyUsageExtension(KeyManager.TLSCertKeyExtendedUsages, true),
            await x509.SubjectKeyIdentifierExtension.create(keypair.publicKey, false),
            await x509.AuthorityKeyIdentifierExtension.create(keypair.publicKey, false)
          ]
      })

      const certChain = await new x509.X509ChainBuilder().build(cert)

      this.logger.debug(`generated gRPC TLS for node: ${nodeId}`, { cert: cert.toString('pem') })

      return {
        privateKey: keypair.privateKey,
        certificate: cert,
        certificateChain: certChain
      }
    } catch (e) {
      throw new FullstackTestingError(`failed to generate gRPC TLS key: ${e.message}`, e)
    }
  }

  /**
   * Store TLS key and certificate
   * @param nodeId node ID
   * @param nodeKey an object containing privateKeyPem, certificatePem data
   * @param keysDir directory where keys and certs are stored
   * @return a Promise that saves the keys and certs as PEM files
   */
  async storeTLSKey (nodeId, nodeKey, keysDir) {
    const nodeKeyFiles = this.prepareTLSKeyFilePaths(nodeId, keysDir)
    return this.storeNodeKey(nodeId, nodeKey, keysDir, nodeKeyFiles, 'gRPC TLS')
  }

  /**
   * Load TLS key and certificate
   * @param nodeId node ID
   * @param keysDir directory path where pem files are stored
   * @return a dictionary object contains privateKey, certificate, certificateChain
   */
  async loadTLSKey (nodeId, keysDir) {
    const nodeKeyFiles = this.prepareTLSKeyFilePaths(nodeId, keysDir)
    return this.loadNodeKey(nodeId, keysDir, KeyManager.TLSKeyAlgo, nodeKeyFiles, 'gRPC TLS')
  }

  /**
   * Generate PFX private key file
   *
   * It generates 'private-<nodeID>.pfx' containing:
   *    - s-key & cert: self-signed signing key
   *    - a-key & cert: agreement key and signed cert
   *    - e-key & cert: encryption key and signed cert (currently unused)
   *
   * @param keytool an instance of Keytool class
   * @param nodeId node id
   * @param keysDir directory where the pfx files should be stored
   * @param tmpDir tmp directory where intermediate files can be stored.
   * @return {Promise<string>} path to the pfx file
   */
  async generatePrivatePfxKeys (keytool, nodeId, keysDir, tmpDir = getTmpDir()) {
    if (!keytool || !(keytool instanceof Keytool)) throw new MissingArgumentError('An instance of core/Keytool is required')
    if (!nodeId) throw new MissingArgumentError('nodeId is required')
    if (!keysDir) throw new MissingArgumentError('keysDir is required')
    if (!fs.existsSync(keysDir)) throw new MissingArgumentError('keysDir does not exist')

    const privatePfxFile = path.join(keysDir, `private-${nodeId}.pfx`)
    if (fs.existsSync(privatePfxFile)) {
      this.logger.debug(`overwriteKeys is set to false and private pfx file already exists: ${privatePfxFile}`)
      return privatePfxFile
    }

    const validity = constants.CERTIFICATE_VALIDITY_YEARS * 365
    const tmpPrivatePfxFile = path.join(tmpDir, `private-${nodeId}.pfx`)
    const signedKeyAlias = `${constants.SIGNING_KEY_PREFIX}-${nodeId}`

    // signing key (s key)
    await keytool.genKeyPair(
      `-alias ${signedKeyAlias}`,
      `-keystore ${tmpPrivatePfxFile}`,
      '-storetype pkcs12',
      '-storepass password',
      `-dname cn=s-${nodeId}`,
      '-keyalg rsa',
      '-sigalg SHA384withRSA',
      '-keysize 3072',
      `-validity ${validity}`
    )

    // generate signed keys (a-key and e-key)
    for (const keyPrefix of [constants.AGREEMENT_KEY_PREFIX, constants.ENCRYPTION_KEY_PREFIX]) {
      const certReqFile = path.join(tmpDir, `${nodeId}-cert-req-${keyPrefix}.pfx`)
      const certFile = path.join(tmpDir, `${nodeId}-signed-cert-${keyPrefix}.pfx`)
      const alias = `${keyPrefix}-${nodeId}`
      // generate key pair
      await keytool.genKeyPair(
        `-alias ${alias}`,
        `-keystore "${tmpPrivatePfxFile}"`,
        '-storetype pkcs12',
        '-storepass password',
        `-dname cn=${alias}`,
        '-keyalg ec',
        '-sigalg SHA384withECDSA',
        '-groupname secp384r1',
        `-validity ${validity}`
      )

      // cert-req
      await keytool.certReq(
        `-alias ${alias}`,
        `-keystore "${tmpPrivatePfxFile}"`,
        '-storetype pkcs12',
        '-storepass password',
        `-file "${certReqFile}"`
      )

      // signed cert
      await keytool.genCert(
        `-alias ${signedKeyAlias}`,
        `-keystore "${tmpPrivatePfxFile}"`,
        '-storetype pkcs12',
        '-storepass password',
        `-validity ${validity}`,
        `-infile "${certReqFile}"`,
        `-outfile "${certFile}"`
      )

      // import signed cert in private-pfx file
      await keytool.importCert(
        `-alias ${alias}`,
        `-keystore "${tmpPrivatePfxFile}"`,
        '-storetype pkcs12',
        '-storepass password',
        `-file "${certFile}"`
      )
    }

    this.logger.debug(`Copying generated private pfx file: ${tmpPrivatePfxFile} -> ${privatePfxFile}`)
    fs.cpSync(tmpPrivatePfxFile, privatePfxFile)

    return privatePfxFile
  }

  /**
   * Update PFX public key file
   *
   * WARNING: do not invoke this method in parallel as the same public.pfx will be modified for the given node ids.
   *
   * @param keytool an instance of core/Keytool
   * @param nodeIds node Ids
   * @param keysDir keys directory
   * @param tmpDir tmp directory where intermediate files can be stored.
   * @return {Promise<string>}
   */
  async updatePublicPfxKey (keytool, nodeIds, keysDir, tmpDir = getTmpDir()) {
    if (!keytool || !(keytool instanceof Keytool)) throw new MissingArgumentError('An instance of core/Keytool is required')
    if (!nodeIds) throw new MissingArgumentError('nodeId is required')
    if (!keysDir) throw new MissingArgumentError('keysDir is required')
    if (!fs.existsSync(keysDir)) throw new MissingArgumentError('keysDir does not exist')

    const publicPfxFile = path.join(keysDir, 'public.pfx')
    const validity = constants.CERTIFICATE_VALIDITY_YEARS * 365
    const tmpPublicPfxFile = path.join(tmpDir, constants.PUBLIC_PFX)
    if (fs.existsSync(publicPfxFile)) {
      fs.cpSync(publicPfxFile, tmpPublicPfxFile)
    }

    for (const nodeId of nodeIds) {
      const privatePfxFile = path.join(keysDir, `private-${nodeId}.pfx`)
      if (!fs.existsSync(privatePfxFile)) throw new FullstackTestingError(`private pfx ${privatePfxFile} file does not exist`)

      for (const keyPrefix of
        [constants.SIGNING_KEY_PREFIX, constants.AGREEMENT_KEY_PREFIX, constants.ENCRYPTION_KEY_PREFIX]) {
        const certFile = path.join(tmpDir, `${nodeId}-cert-${keyPrefix}.pfx`)
        const alias = `${keyPrefix}-${nodeId}`

        // export signed cert
        await keytool.exportCert(
          `-alias ${alias}`,
          `-keystore "${privatePfxFile}"`,
          '-storetype pkcs12',
          '-storepass password',
          `-validity ${validity}`,
          `-file "${certFile}"`
        )

        // import signed cert
        await keytool.importCert(
          `-alias ${alias}`,
          `-keystore "${tmpPublicPfxFile}"`,
          '-storetype pkcs12',
          '-storepass password',
          '-noprompt',
          `-file "${certFile}"`
        )
      }
    }

    // copy generated pfx file to desired location
    this.logger.debug(`Copying generated public.pfx file: ${tmpPublicPfxFile} -> ${publicPfxFile}`)
    fs.cpSync(tmpPublicPfxFile, publicPfxFile)

    return publicPfxFile
  }
}
