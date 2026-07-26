---
status: accepted
---

# Local-disk file storage instead of S3-compatible object storage

Repair Ticket photos and Room photos are stored on the API container's local disk via a mounted Docker volume, rather than an S3-compatible object store (self-hosted MinIO or a cloud bucket like R2/S3). MinIO was the natural "obvious" choice given the self-hosted, portable-Docker direction (ADR-0002) — it would have made a future move to real cloud storage a non-event.

We chose local disk anyway because it's one fewer moving part in the compose stack for a single-school deployment that isn't expected to run multiple API replicas. The explicit cost: this design does not support horizontal scaling of the API service (uploaded files would only be visible to the replica that received them), and migrating to object storage later means writing a one-time migration script, not just a config change. Acceptable at current scale; worth revisiting if MeetFix ever needs more than one API instance.
