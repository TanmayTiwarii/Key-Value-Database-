# KeyVault — Distributed Key-Value Database Engine

A fault-tolerant, replicated key-value store built from scratch with Node.js. Features Write-Ahead Logging (WAL) for durability, atomic snapshotting for fast recovery, and leader-follower replication for horizontal read scaling.

## Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                       │
│              (GET / PUT / DELETE via HTTP)               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Layer 1 — HTTP API Layer                   │
│                   src/api/                              │
│                                                         │
│  Routes (kv.routes.js) map URLs to controller methods.  │
│  Controllers (kv.controller.js) validate the request    │
│  and call the storage engine. This layer knows nothing  │
│  about persistence or replication.                      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│           Layer 2 — Replication Layer                   │
│                src/replication/                         │
│                                                         │
│  An Express middleware that sits BEFORE the controller. │
│                                                         │
│  • On a follower node: blocks direct client writes      │
│    (403 Forbidden) unless the request carries the       │
│    x-replication-source: leader header.                 │
│                                                         │
│  • On a leader node: lets the controller handle the     │
│    write locally, then listens for res.on('finish')     │
│    to asynchronously broadcast the same operation       │
│    to all configured followers via HTTP.                │
│                                                         │
│  GET requests pass through untouched on both roles.     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│            Layer 3 — Storage Engine                     │
│                src/kvengine/                            │
│                                                         │
│  KVStore (store.js)                                     │
│  ├── In-memory Map for O(1) reads and writes            │
│  ├── On PUT/DELETE: appends to WAL first, then updates  │
│  │   the Map (write-ahead guarantee)                    │
│  └── Every 100 mutations: triggers atomic snapshot      │
│                                                         │
│  WAL (wal.js)                                           │
│  ├── Append-only log files (wal_<timestamp>.log)        │
│  ├── Replayed on startup to rebuild state               │
│  └── Supports rotation (new file) and deletion          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│            Layer 4 — Persistence (Disk)                 │
│                    data/                                │
│                                                         │
│  snapshot.bin  — Full state checkpoint (JSON array of   │
│                  [key, value] pairs). Written atomically │
│                  via: tmp write → fsync → rename.        │
│                                                         │
│  wal_*.log     — Append-only mutation log. Each line    │
│                  is a JSON object: {op, key, value}.    │
│                  Only contains operations that happened │
│                  AFTER the last snapshot.                │
└─────────────────────────────────────────────────────────┘
```

## How Everything Works Together

### Startup (Recovery)
1. `configuration.json` is loaded to determine if this node is a **leader** or **follower**.
2. The storage engine reads `snapshot.bin` from disk and loads it into the in-memory `Map`.
3. Any remaining `wal_*.log` files are replayed chronologically on top of the `Map` to recover operations that happened after the last snapshot.
4. The HTTP server starts accepting requests.

### Handling a Read (`GET /api/kv/get/:key`)
1. The request hits the **Replication Middleware** → passes through immediately (reads are allowed everywhere).
2. The **Controller** calls `store.get(key)` → returns the value directly from the in-memory `Map` in **O(1)** time.
3. No disk I/O involved.

### Handling a Write (`PUT /api/kv/put/:key/:value`)
1. The request hits the **Replication Middleware**:
   - If this is a **follower** and the request is from a client (no `x-replication-source` header) → **403 Forbidden**.
   - If this is a **leader** → the middleware attaches a `res.on('finish')` listener and calls `next()`.
2. The **Controller** calls `store.put(key, value)`.
3. The **Storage Engine** appends the operation to the WAL file on disk, then updates the in-memory `Map`.
4. If the mutation count hits **100**, an atomic snapshot is triggered:
   - Write state to `snapshot.tmp`
   - `fsync` to flush to disk
   - Rename `snapshot.tmp` → `snapshot.bin`
   - Rotate to a new WAL file
   - Delete the old WAL
5. The controller responds with `200 OK`.
6. The middleware's `finish` listener fires and the **Replicator** broadcasts the operation to all followers asynchronously.

## Project Structure

```
KeyValue Store/
├── configuration.json       # Node role (leader/follower) and follower URLs
├── .env                     # PORT configuration
├── package.json
├── data/                    # Persistence directory (gitignored)
│   ├── snapshot.bin         # Latest atomic snapshot
│   └── wal_<timestamp>.log  # Active write-ahead log
└── src/
    ├── index.js             # Entry point — boots config, store, and Express
    ├── config.js            # Loads configuration.json
    ├── api/
    │   ├── routes/
    │   │   └── kv.routes.js       # GET /get/:key, PUT /put/:key/:value, DELETE /delete/:key
    │   └── controllers/
    │       └── kv.controller.js   # Pure CRUD logic — no replication awareness
    ├── kvengine/
    │   ├── store.js         # KVStore singleton (Map + WAL + snapshotting)
    │   └── wal.js           # Write-Ahead Log (append, replay, rotate, delete)
    └── replication/
        ├── middleware.js    # Express middleware — role-based request interception
        └── replicator.js    # Broadcasts mutations to follower nodes via HTTP
```

## API Reference

| Method   | Endpoint                      | Description          |
|----------|-------------------------------|----------------------|
| `GET`    | `/api/kv/get/:key`            | Retrieve a value     |
| `PUT`    | `/api/kv/put/:key/:value`     | Store a key-value pair |
| `DELETE` | `/api/kv/delete/:key`         | Delete a key         |

## Configuration

**`configuration.json`** — Controls the replication role of this node.

```json
{
    "role": "leader",
    "followers": [
        "http://localhost:3001"
    ]
}
```

| Field       | Values                  | Description                                    |
|-------------|-------------------------|------------------------------------------------|
| `role`      | `"leader"` / `"follower"` | Determines if this node accepts writes or not |
| `followers` | Array of URLs           | Only used by the leader to broadcast writes    |

## Getting Started

```bash
# Install dependencies
npm install

# Configure your node
# Edit .env to set PORT (default: 3000)
# Edit configuration.json to set role and followers

# Start the server
npm run dev
```

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Persistence**: Custom WAL + Atomic Snapshots (no external database)
- **Replication**: HTTP-based async leader-follower
