import type { ErrorPattern } from './types'

// Sources:
// - https://nodejs.org/api/errors.html (ERR_TLS_*, ERR_CRYPTO_*)
// - https://docs.openssl.org/master/man3/X509_STORE_CTX_get_error/ (X509 verification codes)
// - https://github.com/nodejs/node/blob/main/src/crypto/crypto_util.cc (how Node names ERR_SSL_* and ERR_OSSL_* codes)
// - https://github.com/openssl/openssl/blob/openssl-3.0/ssl/ssl_err.c (OpenSSL SSL reason strings)
// - https://www.rfc-editor.org/rfc/rfc8446 (TLS alert meanings)
// - https://github.com/nodejs/node/blob/main/src/crypto/crypto_cipher.cc (IV length checks)
// - https://nodejs.org/api/cli.html (--openssl-legacy-provider)

// TLS errors: Node's ERR_TLS_* and ERR_SSL_* codes, plus the OpenSSL X509
// verification codes Node copies into error.code (x509_txt.c).
export const nodeTlsPatterns: ErrorPattern[] = [
  {
    key: 'CERT_HAS_EXPIRED',
    hint: 'Certificate expired',
    detail:
      'The server certificate is past its validity date, or the client clock is badly skewed.',
    howToFix: 'Renew the certificate.',
    category: 'config',
  },
  {
    key: 'CERT_NOT_YET_VALID',
    hint: 'Certificate not yet valid',
    detail:
      'The certificate start date is in the future: it was just issued, or the client clock is wrong.',
    howToFix: 'Wait until the start date, or sync the client clock.',
    category: 'config',
  },
  {
    key: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    hint: 'Self-signed certificate',
    detail:
      'The server presents a self-signed certificate that is not trusted.',
    howToFix: 'Add it to NODE_EXTRA_CA_CERTS or use a CA-signed one.',
    category: 'config',
  },
  {
    key: 'SELF_SIGNED_CERT_IN_CHAIN',
    hint: 'Self-signed root not trusted',
    detail:
      'The chain ends in a self-signed CA the client does not trust (internal CA or a corporate proxy).',
    howToFix: 'Add the CA to NODE_EXTRA_CA_CERTS.',
    category: 'config',
  },
  {
    key: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    hint: 'Issuer certificate missing',
    detail:
      'The client cannot find the issuer of the server certificate: an intermediate is missing on the server or the CA is unknown.',
    howToFix:
      'Install the full chain on the server, or add the CA to NODE_EXTRA_CA_CERTS.',
    category: 'config',
  },
  {
    key: 'UNABLE_TO_GET_ISSUER_CERT',
    hint: 'Issuer certificate missing',
    detail:
      'The issuer of a certificate found in the trust store is missing: the list of trusted certificates is incomplete (an intermediate without its root).',
    howToFix:
      'Add the missing root CA to the trusted certificates (NODE_EXTRA_CA_CERTS or the ca option).',
    category: 'config',
  },
  {
    key: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    hint: 'Cannot verify certificate',
    detail:
      'The server certificate signature cannot be checked because its issuer is not available. The server sends an incomplete chain.',
    howToFix:
      'Configure the server to send the full chain, including intermediates.',
    category: 'config',
  },
  {
    key: 'CERT_UNTRUSTED',
    hint: 'Certificate not trusted',
    detail:
      'The root CA is in the trust store but not marked as trusted for this purpose (e.g. TLS server authentication).',
    howToFix:
      'Use a CA trusted for this purpose, or fix the trust settings of the CA in the trust store.',
    category: 'config',
  },
  {
    key: 'CERT_REJECTED',
    hint: 'Certificate rejected',
    detail: 'The CA is explicitly marked as rejected in the trust store.',
    howToFix:
      'Remove the rejection from the trust store, or use a certificate from another CA.',
    category: 'config',
  },
  {
    key: 'CERT_REVOKED',
    hint: 'Certificate revoked',
    detail: 'The certificate appears in a revocation list.',
    howToFix: 'The server must install a new certificate.',
    category: 'config',
  },
  {
    key: 'CERT_SIGNATURE_FAILURE',
    hint: 'Certificate signature invalid',
    detail:
      'A certificate signature in the chain does not verify. The chain is corrupted or tampered with.',
    howToFix:
      'Reinstall the certificate chain on the server from the CA files.',
    category: 'config',
  },
  {
    key: 'CERT_CHAIN_TOO_LONG',
    hint: 'Certificate chain too long',
    detail: 'The chain exceeds the allowed depth.',
    howToFix:
      'Check the chain the server sends: it should hold the leaf and its intermediates only, not extra or looping certificates.',
    category: 'config',
  },
  {
    key: 'HOSTNAME_MISMATCH',
    hint: 'Certificate hostname mismatch',
    detail:
      'The certificate was issued for another hostname. The URL host or the certificate SAN list is wrong.',
    howToFix:
      'Use the hostname the certificate was issued for, or add the host to the certificate SAN list.',
    category: 'config',
  },
  {
    key: 'ERR_TLS_CERT_ALTNAME_INVALID',
    hint: 'Certificate hostname mismatch',
    detail:
      'The host in the URL matches none of the certificate subjectAltNames.',
    howToFix: 'Use the hostname the certificate was issued for (not the IP).',
    category: 'config',
  },
  {
    key: 'ERR_TLS_HANDSHAKE_TIMEOUT',
    hint: 'TLS handshake timed out',
    detail:
      'The TLS handshake did not finish in time. The peer is slow, or a non-TLS port was used.',
    howToFix: 'Retry, and check the port serves TLS.',
    retryable: true,
  },
  {
    key: 'ERR_TLS_REQUIRED_SERVER_NAME',
    hint: 'TLS server name missing',
    detail:
      'server.addContext() was called without a host name as its first argument.',
    howToFix:
      'Pass the SNI host name to addContext(), and check the value it is built from.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_WRONG_VERSION_NUMBER',
    hint: 'Not a TLS endpoint',
    detail:
      'The peer answered with plain text where TLS was expected: https:// used on an http port, or tls option on a non-TLS Redis/SMTP port.',
    howToFix:
      'Use the TLS port, or drop https:// or the tls option for a plain port.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_UNSUPPORTED_PROTOCOL',
    hint: 'TLS version unsupported',
    detail:
      'The peer only speaks a TLS version this Node build refuses (TLS 1.0/1.1).',
    howToFix: 'Upgrade the server or set minVersion.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION',
    hint: 'TLS version rejected',
    detail:
      'The server rejected the TLS version offered. Usually the server wants TLS 1.2+.',
    howToFix: 'Check minVersion/maxVersion.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE',
    hint: 'TLS handshake rejected',
    detail:
      'The server sent a handshake failure alert: no common cipher, or a client certificate was required but not sent.',
    howToFix:
      'Check the cipher settings on both sides, and send a client certificate if the server requires one.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN',
    hint: 'Server rejected client cert',
    detail:
      'The server did not accept the client certificate presented (mTLS).',
    howToFix: 'Check the cert/key pair and its CA.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
    hint: 'Server does not trust our CA',
    detail:
      'The server rejected the client certificate because it does not trust its CA (mTLS).',
    howToFix:
      'Use a client certificate signed by a CA the server trusts, or add the CA on the server.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC',
    hint: 'TLS record corrupted',
    detail:
      'A TLS record failed its integrity check: a proxy or load balancer altered the stream, or the connection was reused wrongly.',
    howToFix:
      'Retry on a new connection; if frequent, check the proxy or load balancer.',
    retryable: true,
  },
  {
    key: 'ERR_SSL_PACKET_LENGTH_TOO_LONG',
    hint: 'Not a TLS endpoint',
    detail:
      'The peer sent data that is not TLS. The port probably serves plain HTTP or another protocol.',
    howToFix: 'Use the TLS port, or connect without TLS to this port.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_EVP_UNSUPPORTED',
    hint: 'Crypto algorithm unsupported',
    detail:
      'OpenSSL 3 (Node 17+) refuses a legacy algorithm (md4, old PKCS12).',
    howToFix: 'Re-encode the key/cert, or use --openssl-legacy-provider.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_PEM_NO_START_LINE',
    hint: 'Key or cert not PEM',
    detail:
      'The key/certificate file is not valid PEM (wrong file, DER, or escaped newlines in env).',
    howToFix: 'Check the file contents.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_BAD_DECRYPT',
    hint: 'Wrong decryption key',
    detail:
      'Decrypting failed: the key or passphrase does not match the data (wrong env secret, data from another env).',
    howToFix:
      'Check the key or passphrase secret matches the environment the data came from.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH',
    hint: 'Ciphertext corrupted',
    detail:
      'Block decryption got data of the wrong length: the ciphertext was truncated or encoded differently (base64 vs hex).',
    howToFix:
      'Check the ciphertext is stored whole and decoded with the encoding it was written with.',
    category: 'bug',
  },
  {
    key: 'ERR_CRYPTO_INVALID_KEYLEN',
    hint: 'Wrong crypto key length',
    detail:
      'The key length does not match the cipher (AES-256 needs 32 bytes).',
    howToFix: 'Check how the key is derived from env.',
    category: 'config',
  },
  {
    key: 'ERR_CRYPTO_INVALID_IV',
    hint: 'Wrong crypto IV length',
    detail:
      'The initialization vector is missing or has the wrong length for the cipher (e.g. AES-CBC needs 16 bytes).',
    howToFix: 'Generate an IV of the length the cipher needs.',
    category: 'bug',
  },
]
