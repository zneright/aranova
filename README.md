# Aranova Smart Contract

Decentralized transit finance network optimization architecture engineered on top of Stellar Soroban.

## Vision and Purpose
Aranova eliminates cash-flow constraints for transport networks in emerging regions. By integrating everyday micro-payments directly with automated credit systems, the platform provides unbanked commuters, drivers, and cooperatives with zero-risk liquidity lines, transforming standard transactional activity into transparent, functional credit history.

## Stellar Features Employed
* **Programmable Flows (Soroban):** Rulesets enforcing automated payment splits, programmatic vault locks, and riskless daily loan mechanics.
* **On-Chain Settlement Routing:** Real-time transfer routing utilizing classic and tokenized asset anchors.
* **Telegraphy Logs:** Native Soroban event publishers map user configuration changes and deposit splits immediately to indexing clients.

## Prerequisites
* **Rust Toolchain:** `rustc 1.75.0` or higher
* **Cargo Configuration:** Target extensions for WebAssembly processing profiles (`wasm32-unknown-unknown`)
* **Soroban CLI Version:** Engine builds >= `20.0.0`

## Build and Compilation
To build and optimize the source code into a target executable binary:
```bash
soroban contract build

## Deployed Contract

| Field | Value |
|-------|-------|
| Contract ID | `CCT3YGPRWWIEHBVZQLZOIJ5GJX7Z5PYYF6ENCG3EKXCM3M7KX2QWWXJP` |
| Network | testnet |
| Explorer | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CCT3YGPRWWIEHBVZQLZOIJ5GJX7Z5PYYF6ENCG3EKXCM3M7KX2QWWXJP) |
| Deploy Tx | [View transaction](https://stellar.expert/explorer/testnet/tx/4af8b0971a219158ae3bee9a2e3e3ec7cbcfafacd4882347c6ed09d70ed81887) |
| Deployed | 2026-06-28 14:33:32 UTC |
| Wallet | freighter (`GAGI…SF4G`) |

