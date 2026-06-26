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
| Contract ID | `CABD7Y45CYNAMJ5UULGMFCEC7C6TM4TUKMA4FV4XDPHN5N4V5W6SIHOT` |
| Network | testnet |
| Explorer | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CABD7Y45CYNAMJ5UULGMFCEC7C6TM4TUKMA4FV4XDPHN5N4V5W6SIHOT) |
| Deploy Tx | [View transaction](https://stellar.expert/explorer/testnet/tx/aed86f63bd6316990ea43ada2389a125d573d3fb8103ce6648db5b5e84453e8b) |
| Deployed | 2026-06-26 15:11:23 UTC |
| Wallet | freighter (`GAGI…SF4G`) |
