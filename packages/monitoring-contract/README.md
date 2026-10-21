# skilllane-monitoring-contract

The wire format between [`skilllane-monitoring`](https://www.npmjs.com/package/skilllane-monitoring)
(the SDK, publisher) and the skilllane-monitoring engine (subscriber):

- stream names and queue / topic defaults (`STREAMS`, `topicName()`, `rabbitmqExchange()`)
- message headers (`HEADER_STREAM`, `HEADER_VERSION`) and the HTTP ingest path (`INGEST_PATH`)
- the envelope types and `parseEnvelope()`
- the `LOG_*` environment variable names and `resolveExportMode()`
- the masking rules both ends apply (`mask/`)

Services do not install this directly; it comes with `skilllane-monitoring`.
