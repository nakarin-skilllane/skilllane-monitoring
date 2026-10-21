import type { ErrorPattern } from './types'

// TLS errors: Node's ERR_TLS_* and ERR_SSL_* codes, plus the OpenSSL X509
// verification codes Node copies into error.code (x509_txt.c).
export const nodeTlsPatterns: ErrorPattern[] = [
  {
    key: 'CERT_HAS_EXPIRED',
    hint: 'Certificate expired',
    hintDetail:
      'The server certificate is past its validity date, or the client clock is badly skewed. Renew the certificate.',
    category: 'config',
  },
  {
    key: 'CERT_NOT_YET_VALID',
    hint: 'Certificate not yet valid',
    hintDetail:
      'The certificate start date is in the future: it was just issued, or the client clock is wrong.',
    category: 'config',
  },
  {
    key: 'DEPTH_ZERO_SELF_SIGNED_CERT',
    hint: 'Self-signed certificate',
    hintDetail:
      'The server presents a self-signed certificate that is not trusted. Add it to NODE_EXTRA_CA_CERTS or use a CA-signed one.',
    category: 'config',
  },
  {
    key: 'SELF_SIGNED_CERT_IN_CHAIN',
    hint: 'Self-signed root not trusted',
    hintDetail:
      'The chain ends in a self-signed CA the client does not trust (internal CA or a corporate proxy). Add the CA to NODE_EXTRA_CA_CERTS.',
    category: 'config',
  },
  {
    key: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    hint: 'Issuer certificate missing',
    hintDetail:
      'The client cannot find the issuer of the server certificate: an intermediate is missing on the server or the CA is unknown.',
    category: 'config',
  },
  {
    key: 'UNABLE_TO_GET_ISSUER_CERT',
    hint: 'Issuer certificate missing',
    hintDetail:
      'The issuer of a certificate in the chain could not be found. The server does not send its intermediates.',
    category: 'config',
  },
  {
    key: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    hint: 'Cannot verify certificate',
    hintDetail:
      'The server certificate signature cannot be checked because its issuer is not available. The server sends an incomplete chain.',
    category: 'config',
  },
  {
    key: 'CERT_UNTRUSTED',
    hint: 'Certificate not trusted',
    hintDetail:
      'The root CA of the chain is not in the trust store. Add the CA to NODE_EXTRA_CA_CERTS.',
    category: 'config',
  },
  {
    key: 'CERT_REJECTED',
    hint: 'Certificate rejected',
    hintDetail: 'The CA is explicitly marked as rejected in the trust store.',
    category: 'config',
  },
  {
    key: 'CERT_REVOKED',
    hint: 'Certificate revoked',
    hintDetail:
      'The certificate appears in a revocation list. The server must install a new certificate.',
    category: 'config',
  },
  {
    key: 'CERT_SIGNATURE_FAILURE',
    hint: 'Certificate signature invalid',
    hintDetail:
      'A certificate signature in the chain does not verify. The chain is corrupted or tampered with.',
    category: 'config',
  },
  {
    key: 'CERT_CHAIN_TOO_LONG',
    hint: 'Certificate chain too long',
    hintDetail: 'The chain exceeds the allowed depth. Check the server chain.',
    category: 'config',
  },
  {
    key: 'HOSTNAME_MISMATCH',
    hint: 'Certificate hostname mismatch',
    hintDetail:
      'The certificate was issued for another hostname. The URL host or the certificate SAN list is wrong.',
    category: 'config',
  },
  {
    key: 'ERR_TLS_CERT_ALTNAME_INVALID',
    hint: 'Certificate hostname mismatch',
    hintDetail:
      'The host in the URL matches none of the certificate subjectAltNames. Use the hostname the certificate was issued for (not the IP).',
    category: 'config',
  },
  {
    key: 'ERR_TLS_HANDSHAKE_TIMEOUT',
    hint: 'TLS handshake timed out',
    hintDetail:
      'The TLS handshake did not finish in time. The peer is slow, or a non-TLS port was used.',
    retryable: true,
  },
  {
    key: 'ERR_TLS_REQUIRED_SERVER_NAME',
    hint: 'TLS server name missing',
    hintDetail:
      'The server requires SNI but the client sent none. Pass servername when connecting by IP.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_WRONG_VERSION_NUMBER',
    hint: 'Not a TLS endpoint',
    hintDetail:
      'The peer answered with plain text where TLS was expected: https:// used on an http port, or tls option on a non-TLS Redis/SMTP port.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_UNSUPPORTED_PROTOCOL',
    hint: 'TLS version unsupported',
    hintDetail:
      'The peer only speaks a TLS version this Node build refuses (TLS 1.0/1.1). Upgrade the server or set minVersion.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION',
    hint: 'TLS version rejected',
    hintDetail:
      'The server rejected the TLS version offered. Usually the server wants TLS 1.2+; check minVersion/maxVersion.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE',
    hint: 'TLS handshake rejected',
    hintDetail:
      'The server sent a handshake failure alert: no common cipher, or a client certificate was required but not sent.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_SSLV3_ALERT_CERTIFICATE_UNKNOWN',
    hint: 'Server rejected client cert',
    hintDetail:
      'The server did not accept the client certificate presented (mTLS). Check the cert/key pair and its CA.',
    category: 'config',
  },
  {
    key: 'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
    hint: 'Server does not trust our CA',
    hintDetail:
      'The server rejected the client certificate because it does not trust its CA (mTLS).',
    category: 'config',
  },
  {
    key: 'ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC',
    hint: 'TLS record corrupted',
    hintDetail:
      'A TLS record failed its integrity check: a proxy or load balancer altered the stream, or the connection was reused wrongly.',
    retryable: true,
  },
  {
    key: 'ERR_SSL_PACKET_LENGTH_TOO_LONG',
    hint: 'Not a TLS endpoint',
    hintDetail:
      'The peer sent data that is not TLS. The port probably serves plain HTTP or another protocol.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_EVP_UNSUPPORTED',
    hint: 'Crypto algorithm unsupported',
    hintDetail:
      'OpenSSL 3 (Node 17+) refuses a legacy algorithm (md4, old PKCS12). Re-encode the key/cert, or use --openssl-legacy-provider.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_PEM_NO_START_LINE',
    hint: 'Key or cert not PEM',
    hintDetail:
      'The key/certificate file is not valid PEM (wrong file, DER, or escaped newlines in env). Check the file contents.',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_BAD_DECRYPT',
    hint: 'Wrong decryption key',
    hintDetail:
      'Decrypting failed: the key or passphrase does not match the data (wrong env secret, data from another env).',
    category: 'config',
  },
  {
    key: 'ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH',
    hint: 'Ciphertext corrupted',
    hintDetail:
      'Block decryption got data of the wrong length: the ciphertext was truncated or encoded differently (base64 vs hex).',
    category: 'bug',
  },
  {
    key: 'ERR_CRYPTO_INVALID_KEYLEN',
    hint: 'Wrong crypto key length',
    hintDetail:
      'The key length does not match the cipher (AES-256 needs 32 bytes). Check how the key is derived from env.',
    category: 'config',
  },
  {
    key: 'ERR_CRYPTO_INVALID_IV',
    hint: 'Wrong crypto IV length',
    hintDetail:
      'The initialization vector has the wrong length for the cipher (AES-CBC/GCM need 16/12 bytes).',
    category: 'bug',
  },
]
