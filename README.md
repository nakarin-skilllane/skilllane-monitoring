# skilllane-monitoring

The packages a service installs to send its logs and traces to a
skilllane-monitoring engine.

| Package | What it is |
| --- | --- |
| [`skilllane-monitoring`](packages/monitoring) | The SDK: structured ECS logs and OpenTelemetry traces for NestJS services, published to the service's queue (Kafka, RabbitMQ or BullMQ), straight to the engine over HTTP, or to OTLP |
| [`skilllane-monitoring/contract`](packages/monitoring/src/contract) | Module of the SDK, also its own entry point: the wire format shared by the SDK (publisher) and the engine (subscriber): stream names, headers, the envelope and the masking rules |

The engine and its UI are not here; they read what these packages publish.

## Develop

```sh
pnpm install
pnpm build      # the SDK (the contract is part of it)
pnpm test
pnpm lint
```

## Install in a service

```sh
pnpm add skilllane-monitoring
```

Configuration is environment only (`LOG_*`); see the
[SDK README](packages/monitoring/README.md).
