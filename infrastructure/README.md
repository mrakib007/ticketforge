# Local infrastructure

`docker compose up -d` starts PostgreSQL, Redis and single-node Kafka (KRaft). Data is stored in named Docker volumes. Do not use this configuration in production: it has local-only passwords, no TLS and no replication.
